package sleepctl

import (
	"runtime"
	"time"

	"github.com/xiaokaRepo/lumen/internal/dockermgr"
	"github.com/xiaokaRepo/lumen/internal/metrics"
)

const (
	idleFor    = 30 * time.Minute
	idleNetKBs = 32
)

func cpuLimit() float64 {
	n := runtime.NumCPU()
	if n < 1 {
		n = 1
	}
	// Docker reports 100 for one busy core. 2% of the whole machine is 2 per core.
	return 2 * float64(n)
}

func (c *Ctl) quiet(id string) bool {
	ok, enough := c.hist.Quiet(id, time.Now(), idleFor, metrics.SampleEvery, cpuLimit(), idleNetKBs, idleNetKBs)
	return ok && enough
}

// pickIdle returns one service id per container or compose project that should sleep.
// A compose project sleeps together, and only when every member is quiet.
func pickIdle(svcs []dockermgr.Service, quiet func(string) bool) []string {
	byStack := map[string][]dockermgr.Service{}
	var stacks []string
	for _, s := range svcs {
		if s.Stack == "" {
			continue
		}
		if _, ok := byStack[s.Stack]; !ok {
			stacks = append(stacks, s.Stack)
		}
		byStack[s.Stack] = append(byStack[s.Stack], s)
	}
	var out []string
	used := map[string]bool{}
	for _, stack := range stacks {
		id, ok := stackIdle(byStack[stack], quiet)
		if !ok {
			continue
		}
		out = append(out, id)
		for _, m := range byStack[stack] {
			used[m.ID] = true
		}
	}
	for _, s := range svcs {
		if used[s.ID] || s.Stack != "" {
			continue
		}
		if oneIdle(s, quiet) {
			out = append(out, s.ID)
		}
	}
	return out
}

func oneIdle(s dockermgr.Service, quiet func(string) bool) bool {
	if !s.IdleSleep || s.Sleeping || s.Status != "running" {
		return false
	}
	if blockedNet(s.NetworkMode) || !hasWeb(s) {
		return false
	}
	return quiet(s.ID)
}

func stackIdle(members []dockermgr.Service, quiet func(string) bool) (string, bool) {
	trigger := ""
	web := false
	for _, m := range members {
		if blockedNet(m.NetworkMode) || m.Status == "paused" || m.Status == "restarting" {
			return "", false
		}
		if hasWeb(m) {
			web = true
		}
		if m.IdleSleep && trigger == "" {
			trigger = m.ID
		}
	}
	if trigger == "" || !web {
		return "", false
	}
	for _, m := range members {
		if !quiet(m.ID) {
			return "", false
		}
	}
	return trigger, true
}
