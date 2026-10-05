package agentlink

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

// Dial keeps a connection from the agent to the panel. Use it when the agent
// is behind a NAT the panel cannot open. The panel still prefers a direct
// connection when it has the agent's LAN address.
func Dial(ctx context.Context, panelURL, token string, handler http.Handler) {
	panelURL = strings.TrimRight(strings.TrimSpace(panelURL), "/")
	if panelURL == "" || token == "" || handler == nil {
		return
	}
	client := &http.Client{Timeout: 40 * time.Second}
	for ctx.Err() == nil {
		if !pollOnce(ctx, client, panelURL, token, handler) {
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
			}
		}
	}
}

func pollOnce(ctx context.Context, client *http.Client, panelURL, token string, handler http.Handler) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, panelURL+"/api/agent/wait", nil)
	if err != nil {
		return false
	}
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := client.Do(req)
	if err != nil {
		return false
	}
	var msg struct {
		Idle   bool   `json:"idle"`
		ID     string `json:"id"`
		Method string `json:"method"`
		Path   string `json:"path"`
		Body   string `json:"body"`
	}
	err = json.NewDecoder(res.Body).Decode(&msg)
	res.Body.Close()
	if err != nil || res.StatusCode >= 300 || msg.Idle || msg.ID == "" {
		return err == nil && res.StatusCode < 300
	}
	var raw []byte
	if msg.Body != "" {
		raw, err = base64.StdEncoding.DecodeString(msg.Body)
		if err != nil {
			return true
		}
	}
	in, err := http.NewRequest(msg.Method, msg.Path, bytes.NewReader(raw))
	if err != nil {
		return true
	}
	in.Header.Set("Authorization", "Bearer "+token)
	rec := &capture{header: http.Header{}, code: http.StatusOK}
	handler.ServeHTTP(rec, in)
	outBody, _ := json.Marshal(map[string]any{
		"id":     msg.ID,
		"status": rec.code,
		"type":   rec.header.Get("Content-Type"),
		"body":   base64.StdEncoding.EncodeToString(rec.buf.Bytes()),
	})
	req2, err := http.NewRequestWithContext(ctx, http.MethodPost, panelURL+"/api/agent/result", bytes.NewReader(outBody))
	if err != nil {
		return true
	}
	req2.Header.Set("Authorization", "Bearer "+token)
	req2.Header.Set("Content-Type", "application/json")
	res2, err := client.Do(req2)
	if err != nil {
		return true
	}
	io.Copy(io.Discard, res2.Body)
	res2.Body.Close()
	return true
}

type capture struct {
	header http.Header
	code   int
	buf    bytes.Buffer
}

func (c *capture) Header() http.Header { return c.header }

func (c *capture) WriteHeader(code int) { c.code = code }

func (c *capture) Write(b []byte) (int, error) {
	if c.code == 0 {
		c.code = http.StatusOK
	}
	return c.buf.Write(b)
}
