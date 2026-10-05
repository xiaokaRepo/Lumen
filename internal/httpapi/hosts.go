package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/xiaokaRepo/lumen/internal/hoststat"
	"github.com/xiaokaRepo/lumen/internal/store"
)

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	const p = "Bearer "
	if strings.HasPrefix(h, p) {
		return strings.TrimSpace(h[len(p):])
	}
	return ""
}

func (s *Server) agentWait(w http.ResponseWriter, r *http.Request) {
	if s.Hub == nil {
		writeErr(w, http.StatusNotFound, "面板没有打开 agent 接入")
		return
	}
	token := bearerToken(r)
	if _, ok := s.Store.AgentByToken(token); !ok {
		writeErr(w, http.StatusUnauthorized, "令牌无效")
		return
	}
	s.Hub.ServeWait(w, token)
}

func (s *Server) agentResult(w http.ResponseWriter, r *http.Request) {
	if s.Hub == nil {
		writeErr(w, http.StatusNotFound, "面板没有打开 agent 接入")
		return
	}
	if _, ok := s.Store.AgentByToken(bearerToken(r)); !ok {
		writeErr(w, http.StatusUnauthorized, "令牌无效")
		return
	}
	s.Hub.ServeResult(w, r)
}

func (s *Server) listHosts(w http.ResponseWriter, r *http.Request) {
	if s.Fleet == nil {
		writeJSON(w, http.StatusOK, map[string]any{"hosts": []any{}})
		return
	}
	active, _ := s.Store.ActiveAgent()
	rows := []map[string]any{}
	for _, a := range s.Store.Agents() {
		online, via := s.Fleet.Probe(r.Context(), a)
		rows = append(rows, map[string]any{
			"id":     a.ID,
			"name":   a.Name,
			"url":    a.URL,
			"token":  a.Token,
			"online": online,
			"via":    via,
			"active": a.ID == active.ID,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"hosts": rows})
}

func (s *Server) putHost(w http.ResponseWriter, r *http.Request) {
	var body store.Agent
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "无法读取请求")
		return
	}
	saved, err := s.Store.PutAgent(body)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) deleteHost(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.DeleteAgent(r.PathValue("id")); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) activateHost(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.SetActiveAgent(r.PathValue("id")); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) proxy(w http.ResponseWriter, r *http.Request) {
	if s.Fleet == nil {
		writeErr(w, http.StatusBadGateway, "面板没有连接 agent")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 4<<20))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "无法读取请求")
		return
	}
	status, hdr, resp, err := s.Fleet.Do(r.Context(), r.Method, r.URL.RequestURI(), body)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	if hdr != nil {
		if v := hdr.Get("Content-Type"); v != "" {
			w.Header().Set("Content-Type", v)
		}
		if v := hdr.Get("Content-Disposition"); v != "" {
			w.Header().Set("Content-Disposition", v)
		}
	}
	w.WriteHeader(status)
	_, _ = w.Write(resp)
}

func (s *Server) snapshotRemote(w http.ResponseWriter, r *http.Request) {
	blank := func(msg string) {
		writeJSON(w, http.StatusOK, map[string]any{
			"host":        s.Fleet.LastHost(),
			"services":    []any{},
			"dockerError": msg,
			"homeOrder":   s.Store.HomeOrder(),
			"cardFields":  s.Store.CardFields(),
			"homeLayout":  s.Store.HomeLayout(),
			"onLan":       ViewerOnLAN(r.Host),
		})
	}
	status, _, body, err := s.Fleet.Do(r.Context(), http.MethodGet, "/api/snapshot", nil)
	if err != nil {
		blank(err.Error())
		return
	}
	if status >= 300 {
		blank("agent 返回 " + http.StatusText(status))
		return
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		blank("agent 的状态无法解析")
		return
	}
	if host, ok := payload["host"]; ok {
		raw, _ := json.Marshal(host)
		var snap hoststat.Snapshot
		if json.Unmarshal(raw, &snap) == nil {
			s.Fleet.Remember(snap)
			payload["host"] = s.Fleet.LastHost()
		}
	}
	if payload["services"] == nil {
		payload["services"] = []any{}
	}
	payload["homeOrder"] = s.Store.HomeOrder()
	payload["cardFields"] = s.Store.CardFields()
	payload["homeLayout"] = s.Store.HomeLayout()
	payload["onLan"] = ViewerOnLAN(r.Host)
	if ag, ok := s.Store.ActiveAgent(); ok {
		payload["agent"] = map[string]any{"id": ag.ID, "name": ag.Name}
	}
	writeJSON(w, http.StatusOK, payload)
}
