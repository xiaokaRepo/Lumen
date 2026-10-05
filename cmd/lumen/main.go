package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/xiaokaRepo/lumen/internal/alerteng"
	"github.com/xiaokaRepo/lumen/internal/dockermgr"
	"github.com/xiaokaRepo/lumen/internal/hoststat"
	"github.com/xiaokaRepo/lumen/internal/httpapi"
	"github.com/xiaokaRepo/lumen/internal/imgupd"
	"github.com/xiaokaRepo/lumen/internal/metrics"
	"github.com/xiaokaRepo/lumen/internal/notify"
	"github.com/xiaokaRepo/lumen/internal/store"
)

func main() {
	data := getenv("LUMEN_DATA", "data")
	addr := getenv("LUMEN_ADDR", ":7878")
	st, err := store.Open(data)
	if err != nil {
		log.Fatal(err)
	}
	if len(os.Args) > 1 && os.Args[1] == "reset-password" {
		if err := st.ResetPassword(); err != nil {
			log.Fatal(err)
		}
		log.Print("密码已清除，下次打开面板会进入设置密码")
		return
	}
	host := hoststat.New()
	docker, err := dockermgr.New(st, func() string { return host.Current().IP })
	if err != nil {
		log.Fatal(err)
	}
	history := metrics.Open(filepath.Join(data, "metrics.json"))
	go sampleHistory(history, host, docker)
	go watch(st, host, docker, alerteng.New())
	srv := &httpapi.Server{
		Store:   st,
		Host:    host,
		Docker:  docker,
		History: history,
		Static:  os.Getenv("LUMEN_STATIC"),
	}
	httpSrv := &http.Server{
		Addr:              addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("Lumen listening on %s", addr)
	log.Fatal(httpSrv.ListenAndServe())
}

func sampleHistory(h *metrics.History, host *hoststat.Sampler, docker *dockermgr.Manager) {
	var prevR, prevW uint64
	var prevAt time.Time
	take := func() {
		snap := host.Current()
		mem := 0.0
		if snap.MemTotalGB > 0 {
			mem = snap.MemUsedGB / snap.MemTotalGB * 100
		}
		rd, wr := 0.0, 0.0
		read, write := hoststat.DiskBytes()
		now := time.Now()
		if !prevAt.IsZero() {
			dt := now.Sub(prevAt).Seconds()
			if dt > 0 {
				if read >= prevR {
					rd = float64(read-prevR) / dt / 1024 / 1024
				}
				if write >= prevW {
					wr = float64(write-prevW) / dt / 1024 / 1024
				}
			}
		}
		prevR, prevW, prevAt = read, write, now
		samples := []metrics.Sample{{
			ID: "host", CPU: snap.CPUPercent, Mem: mem,
			Rx: snap.NetRxMBs, Tx: snap.NetTxMBs, Rd: rd, Wr: wr,
		}}
		svcs, _ := docker.Services()
		for _, s := range svcs {
			samples = append(samples, metrics.Sample{
				ID: s.ID, CPU: s.CPU, Mem: s.MemMB,
				Rx: s.NetRxKBs, Tx: s.NetTxKBs,
				Rd: s.DiskReadKBs / 1024, Wr: s.DiskWriteKBs / 1024,
			})
		}
		h.Add(samples)
		h.Flush()
	}
	take()
	t := time.NewTicker(15 * time.Second)
	defer t.Stop()
	for range t.C {
		take()
	}
}

func watch(st *store.Store, host *hoststat.Sampler, docker *dockermgr.Manager, eng *alerteng.Engine) {
	check := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		rows, errText := imgupd.Check(ctx, docker)
		_ = st.SetUpdates(rows, errText)
	}
	go func() {
		time.Sleep(3 * time.Second)
		check()
		t := time.NewTicker(6 * time.Hour)
		defer t.Stop()
		for range t.C {
			check()
		}
	}()
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	eval := func() {
		svcs, _ := docker.Services()
		rows, _, _ := st.Updates()
		fires := eng.Eval(time.Now(), st.Rules(), svcs, host.Current(), rows)
		channels := st.Channels()
		byID := map[string]store.Channel{}
		for _, c := range channels {
			byID[c.ID] = c
		}
		for _, f := range fires {
			sent := []store.Sent{}
			for _, id := range f.Rule.Channels {
				ch, ok := byID[id]
				if !ok || !ch.Enabled {
					continue
				}
				err := notify.Send(ch, f.Title, f.Detail)
				sent = append(sent, store.Sent{Channel: id, OK: err == nil})
			}
			state := "firing"
			resolved := ""
			if f.Resolved {
				state = "resolved"
				resolved = time.Now().Format("01-02 15:04")
			}
			_ = st.AddEvent(store.AlertEvent{
				RuleID: f.Rule.ID, Severity: f.Severity, Title: f.Title, Detail: f.Detail,
				State: state, ResolvedAt: resolved, Sent: sent,
			})
		}
	}
	eval()
	for range t.C {
		eval()
	}
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
