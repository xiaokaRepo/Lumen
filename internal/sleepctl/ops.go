package sleepctl

import (
	"context"
	"errors"
	"log"
	"net"
	"strings"
	"time"

	"github.com/xiaokaRepo/lumen/internal/alerteng"
	"github.com/xiaokaRepo/lumen/internal/dockermgr"
	"github.com/xiaokaRepo/lumen/internal/metrics"
	"github.com/xiaokaRepo/lumen/internal/store"
)

type proxy struct {
	ln net.Listener
}

func New(st *store.Store, docker *dockermgr.Manager, hist *metrics.History, alerts *alerteng.Engine) *Ctl {
	return &Ctl{
		store:   st,
		docker:  docker,
		hist:    hist,
		alerts:  alerts,
		proxies: map[string]*proxy{},
		holds:   map[string]int{},
		gates:   map[string]*gate{},
	}
}

func (c *Ctl) Run() {
	c.reconcile(context.Background())
	t := time.NewTicker(10 * time.Second)
	defer t.Stop()
	for range t.C {
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		c.reconcile(ctx)
		c.idle(ctx)
		cancel()
	}
}

func (c *Ctl) Sleep(ctx context.Context, id string) error {
	svc, key, names, err := c.target(id)
	if err != nil {
		return err
	}
	if svc.Kind == "systemd" || svc.Kind == "process" {
		return errors.New("这个服务不能休眠")
	}
	return c.withGate(key, func() error {
		return c.sleepNames(ctx, names)
	})
}

func (c *Ctl) Wake(ctx context.Context, id string) error {
	_, key, names, err := c.target(id)
	if err != nil {
		return err
	}
	return c.withGate(key, func() error {
		return c.wakeNames(ctx, names)
	})
}

func (c *Ctl) Start(ctx context.Context, id string) error {
	svc, key, names, err := c.target(id)
	if err != nil {
		return err
	}
	return c.withGate(key, func() error {
		if c.anyAsleep(names) {
			return c.wakeNames(ctx, names)
		}
		if err := c.docker.Action(ctx, svc.Name, "start", false); err != nil && !startedOK(err) {
			return err
		}
		if err := c.attach(ctx, svc.Name); err != nil {
			return err
		}
		c.docker.RefreshNow()
		return nil
	})
}

func (c *Ctl) Stop(ctx context.Context, id string) error {
	svc, key, _, err := c.target(id)
	if err != nil {
		return err
	}
	return c.withGate(key, func() error {
		if err := c.docker.Action(ctx, svc.Name, "stop", false); err != nil && !stoppedOK(err) {
			return err
		}
		if rec, ok := c.store.SleepRec(svc.Name); ok {
			rec.Asleep = false
			rec.Since = ""
			rec.SinceUnix = 0
			_ = c.store.PutSleep(svc.Name, rec)
		}
		c.closeProxy(svc.Name)
		c.docker.RefreshNow()
		return nil
	})
}

func (c *Ctl) Restart(ctx context.Context, id string) error {
	svc, key, names, err := c.target(id)
	if err != nil {
		return err
	}
	return c.withGate(key, func() error {
		if c.asleep(svc.Name) {
			return c.wakeNames(ctx, names)
		}
		if err := c.docker.Action(ctx, svc.Name, "restart", false); err != nil {
			return err
		}
		if err := c.attach(ctx, svc.Name); err != nil {
			return err
		}
		c.docker.RefreshNow()
		return nil
	})
}

func (c *Ctl) Remove(ctx context.Context, id string, volumes bool) error {
	svc, key, _, err := c.target(id)
	if err != nil {
		return err
	}
	return c.withGate(key, func() error {
		c.closeProxy(svc.Name)
		_ = c.store.ForgetSleep(svc.Name)
		if err := c.docker.Action(ctx, svc.Name, "remove", volumes); err != nil {
			return err
		}
		c.docker.RefreshNow()
		return nil
	})
}

func (c *Ctl) Stack(ctx context.Context, project, action string) error {
	names := c.stackNames(project)
	key := "stack:" + project
	switch action {
	case "start":
		return c.withGate(key, func() error {
			if c.anyAsleep(names) {
				return c.wakeNames(ctx, names)
			}
			if err := c.docker.StackAction(ctx, project, "start"); err != nil {
				return err
			}
			for _, n := range names {
				_ = c.attach(ctx, n)
			}
			c.docker.RefreshNow()
			return nil
		})
	case "stop":
		return c.withGate(key, func() error {
			err := c.docker.StackAction(ctx, project, "stop")
			for _, n := range names {
				if rec, ok := c.store.SleepRec(n); ok {
					rec.Asleep = false
					rec.Since = ""
					rec.SinceUnix = 0
					_ = c.store.PutSleep(n, rec)
				}
				c.closeProxy(n)
			}
			c.docker.RefreshNow()
			return err
		})
	case "restart":
		return c.withGate(key, func() error {
			if c.anyAsleep(names) {
				return c.wakeNames(ctx, names)
			}
			if err := c.docker.StackAction(ctx, project, "restart"); err != nil {
				return err
			}
			for _, n := range names {
				_ = c.attach(ctx, n)
			}
			c.docker.RefreshNow()
			return nil
		})
	default:
		return c.docker.StackAction(ctx, project, action)
	}
}

func (c *Ctl) target(id string) (dockermgr.Service, string, []string, error) {
	svc, ok := c.docker.One(id)
	if !ok {
		return dockermgr.Service{}, "", nil, errors.New("没有这个服务")
	}
	if svc.Stack != "" {
		names := c.stackNames(svc.Stack)
		if len(names) == 0 {
			names = []string{svc.Name}
		}
		return svc, "stack:" + svc.Stack, names, nil
	}
	return svc, "id:" + svc.Name, []string{svc.Name}, nil
}

func (c *Ctl) stackNames(project string) []string {
	svcs, _ := c.docker.Services()
	var names []string
	for _, s := range svcs {
		if s.Stack == project {
			names = append(names, s.Name)
		}
	}
	return names
}

func (c *Ctl) expandStack(names []string) []string {
	c.docker.RefreshNow()
	for _, name := range names {
		svc, ok := c.docker.One(name)
		if !ok || svc.Stack == "" {
			continue
		}
		if fresh := c.stackNames(svc.Stack); len(fresh) > 0 {
			return fresh
		}
	}
	return names
}

func (c *Ctl) sleepNames(ctx context.Context, names []string) error {
	names = c.expandStack(names)
	un := c.hold(names...)
	defer un()
	for _, name := range names {
		if err := c.plan(name); err != nil {
			return err
		}
		if c.alerts != nil {
			c.alerts.Drop(name)
		}
	}
	c.docker.RefreshNow()
	var first error
	for _, name := range names {
		if err := c.docker.Action(ctx, name, "stop", false); err != nil && !stoppedOK(err) && first == nil {
			first = err
		}
	}
	for _, name := range names {
		if err := c.adopt(ctx, name); err != nil && first == nil {
			first = err
		}
	}
	c.docker.RefreshNow()
	return first
}

func (c *Ctl) plan(name string) error {
	svc, ok := c.docker.One(name)
	if !ok {
		return errors.New("没有这个服务")
	}
	rec, _ := c.store.SleepRec(name)
	now := time.Now()
	rec.Asleep = true
	rec.Since = now.Format("01-02 15:04")
	rec.SinceUnix = now.Unix()
	rec.LastError = ""
	if svc.WebURL != "" {
		rec.WebURL = svc.WebURL
	}
	if !rec.Adopted {
		if host, cont, ip, proto, ok := chooseWeb(svc); ok {
			rec.HostPort = host
			rec.ContPort = cont
			rec.Proto = proto
			rec.BindIP = ip
		}
	}
	return c.store.PutSleep(name, rec)
}

func (c *Ctl) adopt(ctx context.Context, name string) error {
	rec, ok := c.store.SleepRec(name)
	if !ok || rec.HostPort <= 0 {
		return nil
	}
	if !rec.Adopted {
		if err := c.docker.ReleaseWebBinding(ctx, name, rec.HostPort, rec.Proto); err != nil {
			rec.LastError = err.Error()
			_ = c.store.PutSleep(name, rec)
			return err
		}
		rec.Adopted = true
		rec.LastError = ""
		if err := c.store.PutSleep(name, rec); err != nil {
			return err
		}
	}
	if err := c.ensureProxy(rec, name); err != nil {
		rec.LastError = err.Error()
		_ = c.store.PutSleep(name, rec)
		return err
	}
	return nil
}

func (c *Ctl) wakeNames(ctx context.Context, names []string) error {
	if len(names) == 0 {
		return errors.New("没有这个服务")
	}
	names = c.expandStack(names)
	un := c.hold(names...)
	defer un()
	var first error
	for _, name := range names {
		if err := c.wakeOne(ctx, name); err != nil && first == nil {
			first = err
		}
	}
	c.docker.RefreshNow()
	return first
}

func (c *Ctl) wakeOne(ctx context.Context, name string) error {
	rec, ok := c.store.SleepRec(name)
	if !ok {
		if err := c.docker.Action(ctx, name, "start", false); err != nil && !startedOK(err) {
			return err
		}
		return nil
	}
	brief, err := c.docker.InspectBrief(ctx, name)
	if err != nil {
		return err
	}
	if !brief.Exists {
		c.closeProxy(name)
		_ = c.store.ForgetSleep(name)
		return errors.New("没有这个服务")
	}
	if brief.Running {
		rec.Asleep = false
		rec.Since = ""
		rec.SinceUnix = 0
		rec.LastError = ""
		if err := c.saveAwake(name, rec); err != nil {
			return err
		}
		return c.attach(ctx, name)
	}
	ports, err := c.docker.HostPorts(ctx, name)
	if err != nil {
		return err
	}
	if msg := c.docker.PublishConflict(name, ports); msg != "" {
		rec.LastError = msg
		_ = c.store.PutSleep(name, rec)
		return errors.New(msg)
	}
	if rec.HostPort > 0 && rec.Adopted {
		if err := c.ensureProxy(rec, name); err != nil {
			rec.LastError = err.Error()
			_ = c.store.PutSleep(name, rec)
			return err
		}
	}
	if rec.HostPort > 0 && !rec.Adopted {
		c.closeProxy(name)
	}
	if err := c.docker.Action(ctx, name, "start", false); err != nil && !startedOK(err) {
		if rec.Asleep && rec.HostPort > 0 {
			_ = c.ensureProxy(rec, name)
		}
		rec.LastError = err.Error()
		_ = c.store.PutSleep(name, rec)
		return err
	}
	if err := c.waitUp(ctx, name, rec); err != nil {
		rec.Asleep = false
		rec.Since = ""
		rec.SinceUnix = 0
		rec.LastError = err.Error()
		_ = c.saveAwake(name, rec)
		_ = c.attach(ctx, name)
		return err
	}
	rec.Asleep = false
	rec.Since = ""
	rec.SinceUnix = 0
	rec.LastError = ""
	if err := c.saveAwake(name, rec); err != nil {
		return err
	}
	return c.attach(ctx, name)
}

func (c *Ctl) saveAwake(name string, rec store.SleepRec) error {
	if !rec.Adopted && rec.HostPort == 0 {
		return c.store.ForgetSleep(name)
	}
	return c.store.PutSleep(name, rec)
}

func (c *Ctl) waitUp(ctx context.Context, name string, rec store.SleepRec) error {
	deadline := time.Now().Add(60 * time.Second)
	var last string
	for {
		if ctx.Err() != nil || time.Now().After(deadline) {
			if last == "" {
				last = "唤醒超时"
			}
			return errors.New(last)
		}
		brief, err := c.docker.InspectBrief(ctx, name)
		if err != nil {
			return err
		}
		if !brief.Running {
			if brief.Error != "" {
				last = brief.Error
			}
			time.Sleep(300 * time.Millisecond)
			continue
		}
		if brief.Health == "unhealthy" || brief.Health == "starting" {
			if brief.Error != "" {
				last = brief.Error
			}
			time.Sleep(300 * time.Millisecond)
			continue
		}
		if rec.ContPort <= 0 {
			return nil
		}
		addr := dialAddr(brief, rec)
		if addr == "" {
			time.Sleep(300 * time.Millisecond)
			continue
		}
		conn, err := net.DialTimeout("tcp", addr, 800*time.Millisecond)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(300 * time.Millisecond)
	}
}

func dialAddr(brief dockermgr.Brief, rec store.SleepRec) string {
	if rec.Adopted {
		if brief.IP == "" || rec.ContPort <= 0 {
			return ""
		}
		return net.JoinHostPort(brief.IP, itoa(rec.ContPort))
	}
	if strings.Contains(brief.NetworkMode, "host") && rec.HostPort > 0 {
		return net.JoinHostPort("127.0.0.1", itoa(rec.HostPort))
	}
	if brief.IP != "" && rec.ContPort > 0 {
		return net.JoinHostPort(brief.IP, itoa(rec.ContPort))
	}
	if rec.HostPort > 0 {
		return net.JoinHostPort("127.0.0.1", itoa(rec.HostPort))
	}
	return ""
}

func (c *Ctl) attach(ctx context.Context, name string) error {
	rec, ok := c.store.SleepRec(name)
	if !ok || !rec.Adopted || rec.HostPort <= 0 {
		return nil
	}
	brief, err := c.docker.InspectBrief(ctx, name)
	if err != nil || !brief.Running {
		return err
	}
	return c.ensureProxy(rec, name)
}

func (c *Ctl) reconcile(ctx context.Context) {
	svcs, errText := c.docker.Services()
	if errText != "" {
		return
	}
	known := map[string]bool{}
	for _, s := range svcs {
		known[s.ID] = true
	}
	open := map[string]bool{}
	for name, rec := range c.store.SleepRecs() {
		if c.holding(name) {
			continue
		}
		if !known[name] {
			if err := c.docker.RecoverName(ctx, name); err != nil {
				c.closeProxy(name)
				_ = c.store.ForgetSleep(name)
				continue
			}
		}
		brief, err := c.docker.InspectBrief(ctx, name)
		if err != nil || !brief.Exists {
			continue
		}
		if rec.Asleep && brief.Running {
			if err := c.docker.Action(ctx, name, "stop", false); err != nil && !stoppedOK(err) {
				log.Printf("休眠对账停止 %s: %v", name, err)
			} else {
				brief.Running = false
			}
		}
		if rec.HostPort > 0 && (rec.Asleep || (rec.Adopted && brief.Running)) {
			if err := c.ensureProxy(rec, name); err != nil {
				log.Printf("网页端口代听 %s: %v", name, err)
			} else {
				open[name] = true
			}
		}
	}
	c.closeMissing(open)
}

func (c *Ctl) idle(ctx context.Context) {
	svcs, errText := c.docker.Services()
	if errText != "" {
		return
	}
	for _, id := range pickIdle(svcs, c.quiet) {
		if err := c.Sleep(ctx, id); err != nil {
			log.Printf("空闲休眠 %s: %v", id, err)
		}
	}
}

func (c *Ctl) asleep(id string) bool {
	rec, ok := c.store.SleepRec(id)
	return ok && rec.Asleep
}

func (c *Ctl) anyAsleep(names []string) bool {
	for _, n := range names {
		if c.asleep(n) {
			return true
		}
	}
	return false
}

func (c *Ctl) withGate(key string, fn func() error) error {
	g, leader := c.lead(key)
	if !leader {
		<-g.done
		return g.err
	}
	err := fn()
	c.finish(key, g, err)
	return err
}

func (c *Ctl) lead(key string) (*gate, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if g, ok := c.gates[key]; ok {
		return g, false
	}
	g := &gate{done: make(chan struct{})}
	c.gates[key] = g
	return g, true
}

func (c *Ctl) finish(key string, g *gate, err error) {
	g.err = err
	c.mu.Lock()
	delete(c.gates, key)
	c.mu.Unlock()
	close(g.done)
}

func (c *Ctl) hold(names ...string) func() {
	c.mu.Lock()
	for _, n := range names {
		c.holds[n]++
	}
	c.mu.Unlock()
	return func() {
		c.mu.Lock()
		for _, n := range names {
			c.holds[n]--
			if c.holds[n] <= 0 {
				delete(c.holds, n)
			}
		}
		c.mu.Unlock()
	}
}

func (c *Ctl) holding(name string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.holds[name] > 0
}

func stoppedOK(err error) bool {
	if err == nil {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "not running") || strings.Contains(msg, "already stopped")
}

func startedOK(err error) bool {
	if err == nil {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "already running") || strings.Contains(msg, "already started")
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [16]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
