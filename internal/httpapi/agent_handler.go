package httpapi

import (
	"crypto/subtle"
	"net/http"
)

// AgentHandler is the API lumen-agent serves on the machine that runs Docker.
// The panel is a client of this API. It does not talk to Docker itself.
func (s *Server) AgentHandler(token string) http.Handler {
	mux := http.NewServeMux()
	wrap := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if !bearerMatch(r, token) {
				writeErr(w, http.StatusUnauthorized, "令牌无效")
				return
			}
			next(w, r)
		}
	}
	mux.HandleFunc("GET /v1/health", wrap(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}))
	mux.HandleFunc("GET /api/snapshot", wrap(s.snapshot))
	s.mountOps(mux, wrap)
	return mux
}

func (s *Server) mountOps(mux *http.ServeMux, wrap func(http.HandlerFunc) http.HandlerFunc) {
	mux.HandleFunc("GET /api/services/{id}/logs", wrap(s.logs))
	mux.HandleFunc("POST /api/services/{id}/action", wrap(s.action))
	mux.HandleFunc("PUT /api/services/{id}", wrap(s.putMeta))
	mux.HandleFunc("GET /api/ports", wrap(s.ports))
	mux.HandleFunc("GET /api/processes", wrap(s.processes))
	mux.HandleFunc("POST /api/processes/{pid}/signal", wrap(s.signal))
	mux.HandleFunc("POST /api/processes/{pid}/nice", wrap(s.renice))
	mux.HandleFunc("GET /api/systemd", wrap(s.systemd))
	mux.HandleFunc("GET /api/metrics", wrap(s.metrics))
	mux.HandleFunc("GET /api/images", wrap(s.images))
	mux.HandleFunc("POST /api/images/pull", wrap(s.pullImage))
	mux.HandleFunc("POST /api/images/prune", wrap(s.pruneImages))
	mux.HandleFunc("DELETE /api/images/{id}", wrap(s.deleteImage))
	mux.HandleFunc("GET /api/networks", wrap(s.networks))
	mux.HandleFunc("POST /api/networks", wrap(s.createNetwork))
	mux.HandleFunc("DELETE /api/networks/{id}", wrap(s.deleteNetwork))
	mux.HandleFunc("GET /api/volumes", wrap(s.volumes))
	mux.HandleFunc("POST /api/volumes/prune", wrap(s.pruneVolumes))
	mux.HandleFunc("DELETE /api/volumes/{id}", wrap(s.deleteVolume))
	mux.HandleFunc("POST /api/stacks/{id}/action", wrap(s.stack))
	mux.HandleFunc("GET /api/updates", wrap(s.updates))
	mux.HandleFunc("POST /api/updates/check", wrap(s.checkUpdates))
}

func bearerMatch(r *http.Request, token string) bool {
	got := bearerToken(r)
	if len(got) != len(token) || token == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(token)) == 1
}
