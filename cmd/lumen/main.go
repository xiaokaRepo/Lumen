package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/xiaokaRepo/lumen/internal/agentlink"
	"github.com/xiaokaRepo/lumen/internal/alerteng"
	"github.com/xiaokaRepo/lumen/internal/dockermgr"
	"github.com/xiaokaRepo/lumen/internal/hoststat"
	"github.com/xiaokaRepo/lumen/internal/httpapi"
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
	hub := agentlink.New()
	fleet := httpapi.NewFleet(st, hub)
	eng := alerteng.New()
	go watchAgents(st, fleet, eng)
	srv := &httpapi.Server{
		Store:  st,
		Static: os.Getenv("LUMEN_STATIC"),
		Fleet:  fleet,
		Hub:    hub,
	}
	httpSrv := &http.Server{
		Addr:              addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("Lumen panel listening on %s", addr)
	log.Fatal(httpSrv.ListenAndServe())
}

func watchAgents(st *store.Store, fleet *httpapi.Fleet, eng *alerteng.Engine) {
	eval := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		status, _, body, err := fleet.Do(ctx, http.MethodGet, "/api/snapshot", nil)
		if err != nil || status >= 300 {
			return
		}
		var snap struct {
			Host     hoststat.Snapshot   `json:"host"`
			Services []dockermgr.Service `json:"services"`
		}
		if json.Unmarshal(body, &snap) != nil {
			return
		}
		var rows []store.UpdateRow
		ustatus, _, ubody, uerr := fleet.Do(ctx, http.MethodGet, "/api/updates", nil)
		if uerr == nil && ustatus < 300 {
			var u struct {
				Updates []store.UpdateRow `json:"updates"`
			}
			if json.Unmarshal(ubody, &u) == nil {
				rows = u.Updates
			}
		}
		fires := eng.Eval(time.Now(), st.Rules(), snap.Services, snap.Host, rows)
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
	time.Sleep(5 * time.Second)
	eval()
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
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
