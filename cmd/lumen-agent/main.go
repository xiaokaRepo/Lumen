package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/xiaokaRepo/lumen/internal/agentlink"
	"github.com/xiaokaRepo/lumen/internal/alerteng"
	"github.com/xiaokaRepo/lumen/internal/dockermgr"
	"github.com/xiaokaRepo/lumen/internal/hoststat"
	"github.com/xiaokaRepo/lumen/internal/httpapi"
	"github.com/xiaokaRepo/lumen/internal/imgupd"
	"github.com/xiaokaRepo/lumen/internal/metrics"
	"github.com/xiaokaRepo/lumen/internal/sleepctl"
	"github.com/xiaokaRepo/lumen/internal/store"
)

func main() {
	data := getenv("LUMEN_DATA", "data")
	addr := getenv("LUMEN_ADDR", ":7879")
	token := os.Getenv("LUMEN_AGENT_TOKEN")
	if token == "" {
		log.Fatal("需要环境变量 LUMEN_AGENT_TOKEN")
	}
	st, err := store.Open(data)
	if err != nil {
		log.Fatal(err)
	}
	host := hoststat.New()
	docker, err := dockermgr.New(st, func() string { return host.Current().IP })
	if err != nil {
		log.Fatal(err)
	}
	history := metrics.Open(filepath.Join(data, "metrics.json"))
	go sampleHistory(history, host, docker)
	go watchImages(st, docker)
	eng := alerteng.New()
	slp := sleepctl.New(st, docker, history, eng)
	go slp.Run()
	srv := &httpapi.Server{
		Store:   st,
		Host:    host,
		Docker:  docker,
		History: history,
		Sleep:   slp,
	}
	handler := srv.AgentHandler(token)
	if panel := os.Getenv("LUMEN_PANEL"); panel != "" {
		go agentlink.Dial(context.Background(), panel, token, handler)
		log.Printf("lumen-agent will dial the panel at %s", panel)
	}
	httpSrv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("lumen-agent listening on %s", addr)
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
	t := time.NewTicker(metrics.SampleEvery)
	defer t.Stop()
	for range t.C {
		take()
	}
}

func watchImages(st *store.Store, docker *dockermgr.Manager) {
	check := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		rows, errText := imgupd.Check(ctx, docker)
		_ = st.SetUpdates(rows, errText)
	}
	time.Sleep(3 * time.Second)
	check()
	t := time.NewTicker(6 * time.Hour)
	defer t.Stop()
	for range t.C {
		check()
	}
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
