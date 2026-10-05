package sleepctl

import (
	"context"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/xiaokaRepo/lumen/internal/store"
)

func listenAddr(rec store.SleepRec) string {
	ip := rec.BindIP
	if ip == "" || ip == "0.0.0.0" || ip == "::" {
		ip = "0.0.0.0"
	}
	return net.JoinHostPort(ip, strconv.Itoa(rec.HostPort))
}

func (c *Ctl) ensureProxy(rec store.SleepRec, name string) error {
	if rec.HostPort <= 0 {
		return nil
	}
	c.mu.Lock()
	if _, ok := c.proxies[name]; ok {
		c.mu.Unlock()
		return nil
	}
	c.mu.Unlock()
	ln, err := net.Listen("tcp", listenAddr(rec))
	if err != nil {
		return fmt.Errorf("网页端口 %d 仍被占用，无法代听", rec.HostPort)
	}
	c.mu.Lock()
	if _, ok := c.proxies[name]; ok {
		c.mu.Unlock()
		_ = ln.Close()
		return nil
	}
	c.proxies[name] = &proxy{ln: ln}
	c.mu.Unlock()
	go c.serve(ln, name)
	return nil
}

func (c *Ctl) closeProxy(name string) {
	c.mu.Lock()
	p := c.proxies[name]
	delete(c.proxies, name)
	c.mu.Unlock()
	if p != nil && p.ln != nil {
		_ = p.ln.Close()
	}
}

func (c *Ctl) closeMissing(open map[string]bool) {
	c.mu.Lock()
	var drop []string
	for name := range c.proxies {
		if !open[name] && c.holds[name] == 0 {
			drop = append(drop, name)
		}
	}
	c.mu.Unlock()
	for _, name := range drop {
		c.closeProxy(name)
	}
}

func (c *Ctl) serve(ln net.Listener, name string) {
	for {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		go c.handle(conn, name)
	}
}

func (c *Ctl) handle(conn net.Conn, name string) {
	defer conn.Close()
	buf := make([]byte, 8)
	_ = conn.SetReadDeadline(time.Now().Add(1200 * time.Millisecond))
	n, _ := conn.Read(buf)
	_ = conn.SetReadDeadline(time.Time{})
	peeked := append([]byte(nil), buf[:n]...)
	httpish := isHTTP(peeked)
	rec, _ := c.store.SleepRec(name)
	if rec.Asleep {
		if httpish {
			if rec.LastError != "" {
				writePage(conn, errorPage(rec.LastError))
				return
			}
			go c.Wake(context.Background(), name)
			writePage(conn, waitingPage)
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 70*time.Second)
		defer cancel()
		if err := c.Wake(ctx, name); err != nil {
			return
		}
	}
	if err := c.forward(conn, peeked, name); err != nil && httpish {
		writePage(conn, errorPage(err.Error()))
	}
}

func (c *Ctl) forward(conn net.Conn, peeked []byte, name string) error {
	rec, ok := c.store.SleepRec(name)
	if !ok || rec.HostPort <= 0 {
		return fmt.Errorf("服务还没有起来")
	}
	brief, err := c.docker.InspectBrief(context.Background(), name)
	if err != nil {
		return err
	}
	if !brief.Running {
		return fmt.Errorf("服务还没有起来")
	}
	addr := dialAddr(brief, rec)
	if addr == "" {
		return fmt.Errorf("容器还没有网络地址")
	}
	return splice(conn, peeked, addr)
}

func splice(client net.Conn, peeked []byte, addr string) error {
	up, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return err
	}
	defer up.Close()
	if len(peeked) > 0 {
		if _, err := up.Write(peeked); err != nil {
			return err
		}
	}
	errc := make(chan struct{}, 2)
	go func() {
		_, _ = io.Copy(up, client)
		errc <- struct{}{}
	}()
	go func() {
		_, _ = io.Copy(client, up)
		errc <- struct{}{}
	}()
	<-errc
	return nil
}

func isHTTP(b []byte) bool {
	s := string(b)
	for _, m := range []string{"GET ", "POST ", "HEAD ", "PUT ", "DELETE ", "OPTIONS ", "PATCH "} {
		if strings.HasPrefix(s, m) {
			return true
		}
	}
	return false
}

const waitingPage = `<!doctype html>
<meta charset="utf-8">
<meta http-equiv="refresh" content="2">
<title>正在唤醒</title>
<style>body{font-family:system-ui,sans-serif;margin:3rem;color:#111}</style>
<p>正在唤醒，请稍候。</p>
`

func errorPage(msg string) string {
	return `<!doctype html>
<meta charset="utf-8">
<title>唤醒失败</title>
<style>body{font-family:system-ui,sans-serif;margin:3rem;color:#111}</style>
<p>唤醒失败。</p>
<p>` + htmlEscape(msg) + `</p>
<p>请在服务菜单里再次唤醒。</p>
`
}

func writePage(conn net.Conn, body string) {
	head := "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " +
		strconv.Itoa(len(body)) + "\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n"
	_, _ = io.WriteString(conn, head+body)
}

func htmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	return r.Replace(s)
}
