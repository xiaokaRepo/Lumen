package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/xiaokaRepo/lumen/internal/dockermgr"
	"github.com/xiaokaRepo/lumen/internal/hoststat"
	"github.com/xiaokaRepo/lumen/internal/store"
)

type Server struct {
	Store  *store.Store
	Host   *hoststat.Sampler
	Docker *dockermgr.Manager
	Static string
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/session", s.session)
	mux.HandleFunc("POST /api/setup", s.setup)
	mux.HandleFunc("POST /api/login", s.login)
	mux.HandleFunc("POST /api/logout", s.logout)
	mux.HandleFunc("GET /api/snapshot", s.authed(s.snapshot))
	mux.HandleFunc("GET /api/services/{id}/logs", s.authed(s.logs))
	mux.HandleFunc("POST /api/services/{id}/action", s.authed(s.action))
	mux.HandleFunc("PUT /api/services/{id}", s.authed(s.putMeta))
	mux.HandleFunc("GET /api/ports", s.authed(s.ports))
	if s.Static != "" {
		mux.Handle("/", s.spa())
	}
	return mux
}

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"setupRequired": s.Store.SetupRequired(),
		"authed":        s.Store.Valid(cookieToken(r)),
		"host":          s.Host.Current(),
	})
}

func (s *Server) setup(w http.ResponseWriter, r *http.Request) {
	if !s.Store.SetupRequired() {
		writeErr(w, http.StatusConflict, "已经设置过密码")
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "无法读取请求")
		return
	}
	if err := s.Store.SetPassword(body.Password); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	s.issue(w, r, body.Password, true)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if s.Store.SetupRequired() {
		writeErr(w, http.StatusConflict, "需要先设置密码")
		return
	}
	var body struct {
		Password string `json:"password"`
		Remember bool   `json:"remember"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "无法读取请求")
		return
	}
	s.issue(w, r, body.Password, body.Remember)
}

func (s *Server) issue(w http.ResponseWriter, r *http.Request, pw string, remember bool) {
	token, err := s.Store.Login(pw, remember)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	cookie := &http.Cookie{
		Name:     "lumen_session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	}
	if remember {
		cookie.MaxAge = 7 * 24 * 3600
		cookie.Expires = time.Now().Add(7 * 24 * time.Hour)
	}
	http.SetCookie(w, cookie)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	s.Store.Logout(cookieToken(r))
	http.SetCookie(w, &http.Cookie{Name: "lumen_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) snapshot(w http.ResponseWriter, r *http.Request) {
	services, errText := s.Docker.Services()
	if services == nil {
		services = []dockermgr.Service{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"host":        s.Host.Current(),
		"services":    services,
		"dockerError": errText,
	})
}

func (s *Server) logs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	lines, err := s.Docker.Logs(r.Context(), id, "500")
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	if r.URL.Query().Get("download") == "1" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Content-Disposition", "attachment; filename=\""+id+".log\"")
		for _, l := range lines {
			_, _ = io.WriteString(w, l.TS+" "+l.Msg+"\n")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"lines": lines})
}

func (s *Server) action(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		Action        string `json:"action"`
		RemoveVolumes bool   `json:"removeVolumes"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "无法读取请求")
		return
	}
	if err := s.Docker.Action(r.Context(), id, body.Action, body.RemoveVolumes); err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	s.Docker.RefreshSoon()
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) putMeta(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body store.Meta
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "无法读取请求")
		return
	}
	if strings.TrimSpace(body.DisplayName) == "" {
		writeErr(w, http.StatusBadRequest, "显示名称不能为空")
		return
	}
	if err := s.Store.PutMeta(id, body); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.Docker.RefreshSoon()
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) ports(w http.ResponseWriter, r *http.Request) {
	services, _ := s.Docker.Services()
	type row struct {
		Port          int    `json:"port"`
		Proto         string `json:"proto"`
		IP            string `json:"ip"`
		ServiceID     string `json:"serviceId"`
		ContainerPort int    `json:"containerPort,omitempty"`
		Bound         bool   `json:"bound"`
	}
	rows := []row{}
	for _, svc := range services {
		bound := svc.Status == "running" || svc.Status == "paused"
		for _, p := range svc.Ports {
			rows = append(rows, row{
				Port:          p.Host,
				Proto:         p.Proto,
				IP:            p.IP,
				ServiceID:     svc.ID,
				ContainerPort: p.Container,
				Bound:         bound,
			})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"rows": rows})
}

func (s *Server) authed(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.Store.SetupRequired() {
			writeErr(w, http.StatusConflict, "需要先设置密码")
			return
		}
		if !s.Store.Valid(cookieToken(r)) {
			writeErr(w, http.StatusUnauthorized, "未登录")
			return
		}
		next(w, r)
	}
}

func (s *Server) spa() http.Handler {
	root := s.Static
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		clean := filepath.Clean(r.URL.Path)
		if clean == "/" || clean == "." {
			http.ServeFile(w, r, filepath.Join(root, "index.html"))
			return
		}
		path := filepath.Join(root, clean)
		if st, err := os.Stat(path); err == nil && !st.IsDir() {
			http.ServeFile(w, r, path)
			return
		}
		http.ServeFile(w, r, filepath.Join(root, "index.html"))
	})
}

func cookieToken(r *http.Request) string {
	c, err := r.Cookie("lumen_session")
	if err != nil {
		return ""
	}
	return c.Value
}

func readJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	if err := dec.Decode(dst); err != nil {
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]any{"error": msg})
}

func IsSetup(err error) bool {
	return errors.Is(err, errSetup)
}

var errSetup = errors.New("setup")
