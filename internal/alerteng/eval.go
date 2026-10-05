package alerteng

import (
	"strings"
	"sync"
	"time"

	"github.com/xiaokaRepo/lumen/internal/dockermgr"
	"github.com/xiaokaRepo/lumen/internal/hoststat"
	"github.com/xiaokaRepo/lumen/internal/store"
)

type Fire struct {
	Rule     store.AlertRule
	Key      string
	Title    string
	Detail   string
	Severity string
	Resolved bool
}

type Engine struct {
	mu     sync.Mutex
	since  map[string]time.Time
	firing map[string]bool
	last   map[string]time.Time
	rules  map[string]store.AlertRule
}

func New() *Engine {
	return &Engine{
		since:  map[string]time.Time{},
		firing: map[string]bool{},
		last:   map[string]time.Time{},
		rules:  map[string]store.AlertRule{},
	}
}

type hit struct {
	key      string
	rule     store.AlertRule
	title    string
	detail   string
	severity string
}

func (e *Engine) Eval(now time.Time, rules []store.AlertRule, svcs []dockermgr.Service, host hoststat.Snapshot, updates []store.UpdateRow) []Fire {
	var hits []hit
	for _, r := range rules {
		if !r.Enabled {
			continue
		}
		hits = append(hits, conditions(r, svcs, host, updates)...)
	}
	active := map[string]hit{}
	for _, h := range hits {
		active[h.key] = h
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	var out []Fire
	for _, h := range hits {
		e.rules[h.key] = h.rule
		started, ok := e.since[h.key]
		if !ok {
			e.since[h.key] = now
			started = now
		}
		if now.Sub(started) < parseSpan(h.rule.Duration) {
			continue
		}
		if e.firing[h.key] && now.Sub(e.last[h.key]) < parseSpan(h.rule.Cooldown) {
			continue
		}
		e.firing[h.key] = true
		e.last[h.key] = now
		out = append(out, Fire{Rule: h.rule, Key: h.key, Title: h.title, Detail: h.detail, Severity: h.severity})
	}
	for key, on := range e.firing {
		if !on {
			continue
		}
		if _, ok := active[key]; ok {
			continue
		}
		rule := e.rules[key]
		delete(e.since, key)
		e.firing[key] = false
		if rule.Resolve {
			out = append(out, Fire{
				Rule: rule, Key: key, Resolved: true, Severity: "info",
				Title: rule.Name + " 已恢复", Detail: "条件不再满足",
			})
		}
	}
	return out
}

func conditions(r store.AlertRule, svcs []dockermgr.Service, host hoststat.Snapshot, updates []store.UpdateRow) []hit {
	var out []hit
	switch r.Kind {
	case "service_down":
		for _, s := range svcs {
			if s.Kind == "systemd" || !matchService(r.Target, s) {
				continue
			}
			if s.Status == "exited" || s.Status == "restarting" {
				out = append(out, hit{
					key: r.ID + ":" + s.ID, rule: r, severity: "critical",
					title: s.DisplayName + " 已停止", detail: s.LastError,
				})
			}
		}
	case "unhealthy":
		for _, s := range svcs {
			if matchService(r.Target, s) && s.Health == "unhealthy" {
				out = append(out, hit{
					key: r.ID + ":" + s.ID, rule: r, severity: "warning",
					title: s.DisplayName + " 健康检查失败", detail: s.LastError,
				})
			}
		}
	case "cpu_high":
		if isHost(r.Target) && host.CPUPercent >= r.Threshold {
			out = append(out, hit{key: r.ID + ":host", rule: r, severity: "warning", title: "主机 CPU 过高"})
		}
		if !isHost(r.Target) {
			for _, s := range svcs {
				if matchService(r.Target, s) && s.CPU >= r.Threshold {
					out = append(out, hit{key: r.ID + ":" + s.ID, rule: r, severity: "warning", title: s.DisplayName + " CPU 过高"})
				}
			}
		}
	case "mem_high":
		if host.MemTotalGB > 0 {
			pct := host.MemUsedGB / host.MemTotalGB * 100
			if isHost(r.Target) && pct >= r.Threshold {
				out = append(out, hit{key: r.ID + ":host", rule: r, severity: "warning", title: "主机内存过高"})
			}
		}
	case "disk_full":
		for _, d := range host.Disks {
			if d.TotalGB <= 0 {
				continue
			}
			if r.Target != "" && r.Target != "all" && r.Target != "host" && r.Target != d.Mount && !strings.Contains(r.Target, d.Mount) {
				continue
			}
			if d.UsedGB/d.TotalGB*100 >= r.Threshold {
				out = append(out, hit{key: r.ID + ":" + d.Mount, rule: r, severity: "warning", title: d.Mount + " 空间不足"})
			}
		}
	case "update_available":
		if len(updates) > 0 {
			out = append(out, hit{
				key: r.ID + ":updates", rule: r, severity: "info",
				title: "有镜像可以更新", detail: updates[0].Image,
			})
		}
	}
	return out
}

func isHost(t string) bool {
	t = strings.TrimSpace(t)
	return t == "" || t == "host" || strings.Contains(t, "主机")
}

func matchService(target string, s dockermgr.Service) bool {
	t := strings.TrimSpace(target)
	if t == "" || t == "all" || t == "全部容器" || t == "全部" {
		return true
	}
	if isHost(t) {
		return false
	}
	return s.ID == t || s.Name == t || strings.Contains(s.DisplayName, t) || strings.Contains(s.Image, t)
}

func parseSpan(s string) time.Duration {
	s = strings.TrimSpace(s)
	if s == "" || strings.Contains(s, "立即") {
		return 0
	}
	n := 0
	seen := false
	for _, c := range s {
		if c >= '0' && c <= '9' {
			n = n*10 + int(c-'0')
			seen = true
		} else if seen {
			break
		}
	}
	if n == 0 {
		return 0
	}
	switch {
	case strings.Contains(s, "天"):
		return time.Duration(n) * 24 * time.Hour
	case strings.Contains(s, "小时"):
		return time.Duration(n) * time.Hour
	default:
		return time.Duration(n) * time.Minute
	}
}
