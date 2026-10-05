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
	"github.com/xiaokaRepo/lumen/internal/imgupd"
	"github.com/xiaokaRepo/lumen/internal/metrics"
	"github.com/xiaokaRepo/lumen/internal/notify"
	"github.com/xiaokaRepo/lumen/internal/sleepctl"
	"github.com/xiaokaRepo/lumen/internal/store"
)

type Server struct {
	Store   *store.Store
	Host    *hoststat.Sampler
	Docker  *dockermgr.Manager
	History *metrics.History
	Static  string
	Sleep   *sleepctl.Ctl
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
	mux.HandleFunc("GET /api/processes", s.authed(s.processes))
	mux.HandleFunc("POST /api/processes/{pid}/signal", s.authed(s.signal))
	mux.HandleFunc("POST /api/processes/{pid}/nice", s.authed(s.renice))
	mux.HandleFunc("GET /api/systemd", s.authed(s.systemd))
	mux.HandleFunc("GET /api/metrics", s.authed(s.metrics))
	mux.HandleFunc("GET /api/images", s.authed(s.images))
	mux.HandleFunc("POST /api/images/pull", s.authed(s.pullImage))
	mux.HandleFunc("POST /api/images/prune", s.authed(s.pruneImages))
	mux.HandleFunc("DELETE /api/images/{id}", s.authed(s.deleteImage))
	mux.HandleFunc("GET /api/networks", s.authed(s.networks))
	mux.HandleFunc("POST /api/networks", s.authed(s.createNetwork))
	mux.HandleFunc("DELETE /api/networks/{id}", s.authed(s.deleteNetwork))
	mux.HandleFunc("GET /api/volumes", s.authed(s.volumes))
	mux.HandleFunc("POST /api/volumes/prune", s.authed(s.pruneVolumes))
	mux.HandleFunc("DELETE /api/volumes/{id}", s.authed(s.deleteVolume))
	mux.HandleFunc("POST /api/stacks/{id}/action", s.authed(s.stack))
	mux.HandleFunc("GET /api/alerts", s.authed(s.alerts))
	mux.HandleFunc("PUT /api/channels", s.authed(s.putChannel))
	mux.HandleFunc("DELETE /api/channels/{id}", s.authed(s.deleteChannel))
	mux.HandleFunc("POST /api/channels/{id}/test", s.authed(s.testChannel))
	mux.HandleFunc("PUT /api/rules", s.authed(s.putRule))
	mux.HandleFunc("GET /api/updates", s.authed(s.updates))
	mux.HandleFunc("POST /api/updates/check", s.authed(s.checkUpdates))
	mux.HandleFunc("PUT /api/home", s.authed(s.putHome))
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
	out := make([]any, 0, len(services)+8)
	for _, svc := range services {
		out = append(out, svc)
	}
	units, note := hoststat.SystemdUnits()
	for _, u := range units {
		if !includeUnit(u) {
			continue
		}
		name := strings.TrimSuffix(u.Name, ".service")
		status := "exited"
		if u.Active == "active" && (u.Sub == "running" || u.Sub == "active") {
			status = "running"
		} else if u.Active == "activating" || u.Active == "reloading" {
			status = "restarting"
		}
		out = append(out, map[string]any{
			"id":          "unit:" + u.Name,
			"name":        name,
			"displayName": name,
			"kind":        "systemd",
			"group":       "系统",
			"status":      status,
			"iconMatch":   name,
			"ports":       []any{},
			"cpu":         0,
			"memMB":       0,
			"netRxKBs":    0,
			"netTxKBs":    0,
			"uptime":      "",
			"unit":        u.Name,
			"description": u.Description,
			"lastError":   unitError(u),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"host":        s.Host.Current(),
		"services":    out,
		"dockerError": errText,
		"systemdNote": note,
		"homeOrder":   s.Store.HomeOrder(),
	})
}

func includeUnit(u hoststat.Unit) bool {
	if u.Load != "loaded" {
		return false
	}
	if u.Active != "active" && u.Active != "failed" && u.Active != "activating" {
		return false
	}
	name := u.Name
	if strings.HasPrefix(name, "systemd-") || strings.Contains(name, "getty") {
		return false
	}
	switch name {
	case "docker.service", "containerd.service", "dbus.service", "cron.service", "rsyslog.service":
		return false
	}
	return true
}

func unitError(u hoststat.Unit) string {
	if u.Active == "failed" {
		return u.Description
	}
	return ""
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
	if strings.HasPrefix(id, "unit:") {
		if err := hoststat.SystemdAction(strings.TrimPrefix(id, "unit:"), body.Action); err != nil {
			writeErr(w, http.StatusBadGateway, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if err := s.runAction(r, id, body.Action, body.RemoveVolumes); err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) runAction(r *http.Request, id, action string, removeVolumes bool) error {
	if s.Sleep == nil {
		err := s.Docker.Action(r.Context(), id, action, removeVolumes)
		if err == nil {
			s.Docker.RefreshSoon()
		}
		return err
	}
	var err error
	switch action {
	case "sleep":
		err = s.Sleep.Sleep(r.Context(), id)
	case "wake":
		err = s.Sleep.Wake(r.Context(), id)
	case "start":
		err = s.Sleep.Start(r.Context(), id)
	case "stop":
		err = s.Sleep.Stop(r.Context(), id)
	case "restart":
		err = s.Sleep.Restart(r.Context(), id)
	case "remove":
		err = s.Sleep.Remove(r.Context(), id, removeVolumes)
	default:
		err = s.Docker.Action(r.Context(), id, action, removeVolumes)
		if err == nil {
			s.Docker.RefreshSoon()
		}
	}
	return err
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
		Proxy         bool   `json:"proxy,omitempty"`
	}
	rows := []row{}
	for _, svc := range services {
		bound := (svc.Status == "running" || svc.Status == "paused") && !svc.Sleeping
		for _, p := range svc.Ports {
			rows = append(rows, row{
				Port:          p.Host,
				Proto:         p.Proto,
				IP:            p.IP,
				ServiceID:     svc.ID,
				ContainerPort: p.Container,
				Bound:         bound,
				Proxy:         p.Proxy,
			})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"rows": rows})
}

func (s *Server) processes(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"processes": hoststat.Processes(s.Docker.ContainerIDs()),
	})
}

func (s *Server) signal(w http.ResponseWriter, r *http.Request) {
	pid := atoi(r.PathValue("pid"))
	var body struct {
		Signal string `json:"signal"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "无法读取请求")
		return
	}
	if err := hoststat.Signal(pid, body.Signal); err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) renice(w http.ResponseWriter, r *http.Request) {
	pid := atoi(r.PathValue("pid"))
	var body struct {
		Nice int `json:"nice"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "无法读取请求")
		return
	}
	if err := hoststat.Renice(pid, body.Nice); err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) systemd(w http.ResponseWriter, r *http.Request) {
	units, note := hoststat.SystemdUnits()
	writeJSON(w, http.StatusOK, map[string]any{"units": units, "note": note})
}

func (s *Server) metrics(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		id = "host"
	}
	if s.History == nil {
		empty := []any{}
		writeJSON(w, http.StatusOK, map[string]any{
			"cpu": empty, "mem": empty, "rx": empty, "tx": empty, "rd": empty, "wr": empty,
		})
		return
	}
	writeJSON(w, http.StatusOK, s.History.Series(id, r.URL.Query().Get("range")))
}

func (s *Server) images(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Docker.Images(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"images": rows})
}

func (s *Server) pullImage(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Ref string `json:"ref"`
	}
	if err := readJSON(r, &body); err != nil || strings.TrimSpace(body.Ref) == "" {
		writeErr(w, http.StatusBadRequest, "需要镜像名，例如 nginx:alpine")
		return
	}
	if err := s.Docker.Pull(r.Context(), strings.TrimSpace(body.Ref)); err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) pruneImages(w http.ResponseWriter, r *http.Request) {
	n, err := s.Docker.PruneImages(r.Context())
	if err != nil && n == 0 {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"removed": n})
}

func (s *Server) deleteImage(w http.ResponseWriter, r *http.Request) {
	if err := s.Docker.RemoveImage(r.Context(), r.PathValue("id")); err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) networks(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Docker.Networks(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"networks": rows})
}

func (s *Server) createNetwork(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name   string `json:"name"`
		Driver string `json:"driver"`
		Subnet string `json:"subnet"`
	}
	if err := readJSON(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
		writeErr(w, http.StatusBadRequest, "需要网络名称")
		return
	}
	driver := body.Driver
	if driver == "" {
		driver = "bridge"
	}
	if err := s.Docker.CreateNetwork(r.Context(), strings.TrimSpace(body.Name), driver, strings.TrimSpace(body.Subnet)); err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) deleteNetwork(w http.ResponseWriter, r *http.Request) {
	if err := s.Docker.RemoveNetwork(r.Context(), r.PathValue("id")); err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) volumes(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Docker.Volumes(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"volumes": rows})
}

func (s *Server) pruneVolumes(w http.ResponseWriter, r *http.Request) {
	n, err := s.Docker.PruneVolumes(r.Context())
	if err != nil && n == 0 {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"removed": n})
}

func (s *Server) deleteVolume(w http.ResponseWriter, r *http.Request) {
	if err := s.Docker.RemoveVolume(r.Context(), r.PathValue("id")); err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) stack(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Action string `json:"action"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "无法读取请求")
		return
	}
	var err error
	if s.Sleep != nil {
		err = s.Sleep.Stack(r.Context(), r.PathValue("id"), body.Action)
	} else {
		err = s.Docker.StackAction(r.Context(), r.PathValue("id"), body.Action)
	}
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) alerts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"channels": s.Store.Channels(),
		"rules":    s.Store.Rules(),
		"history":  s.Store.Events(),
	})
}

func (s *Server) putChannel(w http.ResponseWriter, r *http.Request) {
	var body store.Channel
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "无法读取请求")
		return
	}
	if body.Type != "bark" && body.Type != "telegram" && body.Type != "wecom" {
		writeErr(w, http.StatusBadRequest, "渠道只能是 Bark、Telegram 或企业微信")
		return
	}
	saved, err := s.Store.PutChannel(body)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) deleteChannel(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.DeleteChannel(r.PathValue("id")); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) testChannel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var ch store.Channel
	found := false
	for _, c := range s.Store.Channels() {
		if c.ID == id {
			ch = c
			found = true
			break
		}
	}
	if !found {
		writeErr(w, http.StatusNotFound, "没有这个渠道")
		return
	}
	err := notify.Send(ch, "Lumen 测试", "这是一条测试通知，面板可以连上这个渠道。")
	if err != nil {
		s.Store.MarkTest(id, false, err.Error())
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	s.Store.MarkTest(id, true, "测试成功")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) putRule(w http.ResponseWriter, r *http.Request) {
	var body store.AlertRule
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "无法读取请求")
		return
	}
	if strings.TrimSpace(body.Name) == "" || body.Kind == "" {
		writeErr(w, http.StatusBadRequest, "规则需要名称和类型")
		return
	}
	saved, err := s.Store.PutRule(body)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) updates(w http.ResponseWriter, r *http.Request) {
	rows, at, errText := s.Store.Updates()
	writeJSON(w, http.StatusOK, map[string]any{
		"updates": rows, "checkedAt": at, "error": errText,
	})
}

func (s *Server) checkUpdates(w http.ResponseWriter, r *http.Request) {
	rows, errText := imgupd.Check(r.Context(), s.Docker)
	if err := s.Store.SetUpdates(rows, errText); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"updates": rows, "checkedAt": "刚刚", "error": errText,
	})
}

func (s *Server) putHome(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "无法读取请求")
		return
	}
	if body.IDs == nil {
		body.IDs = []string{}
	}
	if err := s.Store.SetHomeOrder(body.IDs); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func atoi(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			break
		}
		n = n*10 + int(c-'0')
	}
	return n
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
