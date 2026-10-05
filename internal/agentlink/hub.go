package agentlink

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sync"
	"time"
)

// Hub lets an agent that can dial the panel pick up work. The panel uses this
// when it cannot open a connection to the agent.
type Hub struct {
	mu      sync.Mutex
	queues  map[string]chan *pending
	waiters map[string]chan result
	seen    map[string]time.Time
}

type pending struct {
	id     string
	method string
	path   string
	body   []byte
	done   chan result
}

type result struct {
	status int
	ctype  string
	body   []byte
}

type wireCall struct {
	ID     string `json:"id"`
	Method string `json:"method"`
	Path   string `json:"path"`
	Body   string `json:"body,omitempty"`
}

func New() *Hub {
	return &Hub{
		queues:  map[string]chan *pending{},
		waiters: map[string]chan result{},
		seen:    map[string]time.Time{},
	}
}

// Online reports whether this token has waited for work recently.
func (h *Hub) Online(token string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	at, ok := h.seen[token]
	return ok && time.Since(at) < 40*time.Second
}

// Wait blocks until the panel has a request for this token, or the wait elapses.
func (h *Hub) Wait(token string, d time.Duration) (*pending, bool) {
	h.mu.Lock()
	q := h.queues[token]
	if q == nil {
		q = make(chan *pending, 4)
		h.queues[token] = q
	}
	h.seen[token] = time.Now()
	h.mu.Unlock()
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case p := <-q:
		h.touch(token)
		return p, true
	case <-timer.C:
		h.touch(token)
		return nil, false
	}
}

func (h *Hub) touch(token string) {
	h.mu.Lock()
	h.seen[token] = time.Now()
	h.mu.Unlock()
}

// Call asks a connected agent to perform one request against its own API.
func (h *Hub) Call(ctx context.Context, token, method, path string, body []byte) (int, http.Header, []byte, error) {
	id, err := newID()
	if err != nil {
		return 0, nil, nil, err
	}
	p := &pending{id: id, method: method, path: path, body: body, done: make(chan result, 1)}
	h.mu.Lock()
	h.waiters[id] = p.done
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.waiters, id)
		h.mu.Unlock()
	}()

	deadline := time.Now().Add(8 * time.Second)
	sent := false
	for !sent {
		h.mu.Lock()
		q := h.queues[token]
		h.mu.Unlock()
		if q != nil {
			select {
			case q <- p:
				sent = true
			default:
			}
		}
		if sent {
			break
		}
		if ctx.Err() != nil || time.Now().After(deadline) {
			return 0, nil, nil, errors.New("agent 没有连上面板")
		}
		timer := time.NewTimer(100 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return 0, nil, nil, ctx.Err()
		case <-timer.C:
		}
	}

	select {
	case res := <-p.done:
		hdr := http.Header{}
		if res.ctype != "" {
			hdr.Set("Content-Type", res.ctype)
		}
		return res.status, hdr, res.body, nil
	case <-ctx.Done():
		return 0, nil, nil, ctx.Err()
	}
}

// ServeWait is the long-poll the agent calls.
func (h *Hub) ServeWait(w http.ResponseWriter, token string) {
	p, ok := h.Wait(token, 25*time.Second)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if !ok || p == nil {
		_, _ = w.Write([]byte(`{"idle":true}`))
		return
	}
	_ = json.NewEncoder(w).Encode(p.wire())
}

// ServeResult receives the agent's response for one call.
func (h *Hub) ServeResult(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID     string `json:"id"`
		Status int    `json:"status"`
		Type   string `json:"type"`
		Body   string `json:"body"`
	}
	dec := json.NewDecoder(io.LimitReader(r.Body, 8<<20))
	if err := dec.Decode(&body); err != nil || body.ID == "" {
		http.Error(w, `{"error":"无法读取请求"}`, http.StatusBadRequest)
		return
	}
	var raw []byte
	if body.Body != "" {
		var err error
		raw, err = base64.StdEncoding.DecodeString(body.Body)
		if err != nil {
			http.Error(w, `{"error":"结果无法解码"}`, http.StatusBadRequest)
			return
		}
	}
	if body.Status == 0 {
		body.Status = http.StatusOK
	}
	h.mu.Lock()
	ch := h.waiters[body.ID]
	h.mu.Unlock()
	if ch != nil {
		ch <- result{status: body.Status, ctype: body.Type, body: raw}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write([]byte(`{"ok":true}`))
}

func (p *pending) wire() wireCall {
	return wireCall{
		ID:     p.id,
		Method: p.method,
		Path:   p.path,
		Body:   base64.StdEncoding.EncodeToString(p.body),
	}
}

func newID() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
