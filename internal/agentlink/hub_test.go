package agentlink

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDialRoundTrip(t *testing.T) {
	hub := New()
	token := "test-token-value"
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/agent/wait", func(w http.ResponseWriter, r *http.Request) {
		if strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ") != token {
			http.Error(w, "no", http.StatusUnauthorized)
			return
		}
		hub.ServeWait(w, token)
	})
	mux.HandleFunc("POST /api/agent/result", func(w http.ResponseWriter, r *http.Request) {
		hub.ServeResult(w, r)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	local := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/ping" || r.URL.Query().Get("q") != "1" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"pong":true}`))
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go Dial(ctx, srv.URL, token, local)

	deadline := time.Now().Add(5 * time.Second)
	var (
		status int
		body   []byte
		err    error
	)
	for time.Now().Before(deadline) {
		status, _, body, err = hub.Call(context.Background(), token, http.MethodGet, "/api/ping?q=1", nil)
		if err == nil {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if err != nil {
		t.Fatal(err)
	}
	if status != http.StatusOK || !strings.Contains(string(body), `"pong":true`) {
		t.Fatalf("status %d body %s", status, body)
	}
	if !hub.Online(token) {
		t.Fatal("expected the dialed agent to look online")
	}
}
