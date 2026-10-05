package httpapi

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/xiaokaRepo/lumen/internal/agentlink"
	"github.com/xiaokaRepo/lumen/internal/hoststat"
	"github.com/xiaokaRepo/lumen/internal/store"
)

// Fleet is how the panel reaches the active lumen-agent. On one LAN it dials
// the agent's URL. If that fails and the agent has dialed in, the call goes
// back over that connection.
type Fleet struct {
	store  *store.Store
	hub    *agentlink.Hub
	client *http.Client
	probe  *http.Client

	mu      sync.Mutex
	last    hoststat.Snapshot
	hasHost bool
}

func NewFleet(st *store.Store, hub *agentlink.Hub) *Fleet {
	dial := &net.Dialer{Timeout: 3 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{
		Proxy:           http.ProxyFromEnvironment,
		DialContext:     dial.DialContext,
		MaxIdleConns:    8,
		IdleConnTimeout: 30 * time.Second,
	}
	return &Fleet{
		store: st,
		hub:   hub,
		client: &http.Client{
			Timeout:   2 * time.Minute,
			Transport: transport,
		},
		probe: &http.Client{
			Timeout:   2 * time.Second,
			Transport: transport,
		},
	}
}

func (f *Fleet) Hub() *agentlink.Hub { return f.hub }

func (f *Fleet) Remember(h hoststat.Snapshot) {
	if h.Disks == nil {
		h.Disks = []hoststat.Disk{}
	}
	if len(h.Load) == 0 {
		h.Load = []float64{0, 0, 0}
	}
	f.mu.Lock()
	f.last = h
	f.hasHost = true
	f.mu.Unlock()
}

func (f *Fleet) LastHost() hoststat.Snapshot {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !f.hasHost {
		return hoststat.Snapshot{Load: []float64{0, 0, 0}, Disks: []hoststat.Disk{}}
	}
	return f.last
}

// Do performs one API call on the active agent.
func (f *Fleet) Do(ctx context.Context, method, path string, body []byte) (int, http.Header, []byte, error) {
	ag, ok := f.store.ActiveAgent()
	if !ok {
		return 0, nil, nil, fmt.Errorf("还没有主机。请打开「主机」添加 lumen-agent")
	}
	return f.do(ctx, ag, method, path, body, f.client)
}

func (f *Fleet) do(ctx context.Context, ag store.Agent, method, path string, body []byte, client *http.Client) (int, http.Header, []byte, error) {
	if ag.URL != "" {
		status, hdr, resp, err := f.direct(ctx, client, ag, method, path, body)
		if err == nil {
			return status, hdr, resp, nil
		}
		if f.hub == nil || !f.hub.Online(ag.Token) {
			return 0, nil, nil, fmt.Errorf("连不上 %s：%v", ag.Name, err)
		}
	} else if f.hub == nil || !f.hub.Online(ag.Token) {
		return 0, nil, nil, fmt.Errorf("%s 还没有连上面板", ag.Name)
	}
	return f.hub.Call(ctx, ag.Token, method, path, body)
}

func (f *Fleet) direct(ctx context.Context, client *http.Client, ag store.Agent, method, path string, body []byte) (int, http.Header, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(ag.URL, "/")+path, bytes.NewReader(body))
	if err != nil {
		return 0, nil, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+ag.Token)
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := client.Do(req)
	if err != nil {
		return 0, nil, nil, err
	}
	defer res.Body.Close()
	buf, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return 0, nil, nil, err
	}
	return res.StatusCode, res.Header, buf, nil
}

// Probe reports whether the panel can currently reach this agent.
func (f *Fleet) Probe(ctx context.Context, ag store.Agent) (online bool, via string) {
	if ag.URL != "" {
		status, _, _, err := f.direct(ctx, f.probe, ag, http.MethodGet, "/v1/health", nil)
		if err == nil && status == http.StatusOK {
			return true, "lan"
		}
	}
	if f.hub != nil && f.hub.Online(ag.Token) {
		return true, "panel"
	}
	return false, ""
}
