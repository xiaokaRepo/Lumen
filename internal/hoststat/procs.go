package hoststat

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/shirou/gopsutil/v4/process"
)

type Proc struct {
	PID       int     `json:"pid"`
	Name      string  `json:"name"`
	User      string  `json:"user"`
	CPU       float64 `json:"cpu"`
	MemMB     float64 `json:"memMB"`
	Nice      int     `json:"nice"`
	State     string  `json:"state"`
	Threads   int     `json:"threads"`
	Started   string  `json:"started"`
	Command   string  `json:"command"`
	ServiceID string  `json:"serviceId,omitempty"`
	Protected bool    `json:"protected"`
}

func Processes(serviceByCID map[string]string) []Proc {
	list, err := process.Processes()
	if err != nil {
		return []Proc{}
	}
	out := make([]Proc, 0, len(list))
	for _, p := range list {
		name, _ := p.Name()
		if name == "" {
			continue
		}
		user, _ := p.Username()
		cpu := cpuPercent(p)
		mi, _ := p.MemoryInfo()
		nice, _ := p.Nice()
		threads, _ := p.NumThreads()
		cmd, _ := p.Cmdline()
		if cmd == "" {
			cmd = name
		}
		st, _ := p.Status()
		state := "S"
		if len(st) > 0 {
			state = procState(st[0])
		}
		created, _ := p.CreateTime()
		started := ""
		if created > 0 {
			started = time.UnixMilli(created).Format("01-02 15:04")
		}
		var mem float64
		if mi != nil {
			mem = float64(mi.RSS) / 1024 / 1024
		}
		pid := int(p.Pid)
		out = append(out, Proc{
			PID:       pid,
			Name:      name,
			User:      user,
			CPU:       round1(cpu),
			MemMB:     round1(mem),
			Nice:      int(nice),
			State:     state,
			Threads:   int(threads),
			Started:   started,
			Command:   cmd,
			ServiceID: matchService(pid, serviceByCID),
			Protected: isProtected(pid, name),
		})
	}
	return out
}

type cpuSnap struct {
	total float64
	at    time.Time
}

var (
	cpuMu   sync.Mutex
	cpuPrev = map[int]cpuSnap{}
)

func cpuPercent(p *process.Process) float64 {
	times, err := p.Times()
	if err != nil || times == nil {
		return 0
	}
	now := time.Now()
	pid := int(p.Pid)
	cpuMu.Lock()
	prev, ok := cpuPrev[pid]
	cpuPrev[pid] = cpuSnap{total: times.Total(), at: now}
	if len(cpuPrev) > 4000 {
		for id, snap := range cpuPrev {
			if now.Sub(snap.at) > 2*time.Minute {
				delete(cpuPrev, id)
			}
		}
	}
	cpuMu.Unlock()
	if !ok {
		return 0
	}
	dt := now.Sub(prev.at).Seconds()
	if dt <= 0.2 {
		return 0
	}
	delta := times.Total() - prev.total
	if delta < 0 {
		return 0
	}
	n := float64(runtime.NumCPU())
	if n < 1 {
		n = 1
	}
	return delta / dt / n * 100
}

func procState(s string) string {
	switch s {
	case "running", "R":
		return "R"
	case "blocked", "D":
		return "D"
	case "stop", "T", "tracing":
		return "T"
	case "zombie", "Z":
		return "Z"
	default:
		return "S"
	}
}

func isProtected(pid int, name string) bool {
	if pid <= 1 {
		return true
	}
	switch name {
	case "dockerd", "containerd", "containerd-shim", "systemd", "systemd-journald", "journald", "lumen":
		return true
	default:
		return strings.HasPrefix(name, "containerd")
	}
}

func matchService(pid int, byCID map[string]string) string {
	if len(byCID) == 0 {
		return ""
	}
	b, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/cgroup")
	if err != nil {
		return ""
	}
	text := string(b)
	for cid, name := range byCID {
		if cid != "" && strings.Contains(text, cid) {
			return name
		}
	}
	return ""
}

func Signal(pid int, sig string) error {
	p, err := process.NewProcess(int32(pid))
	if err != nil {
		return err
	}
	name, _ := p.Name()
	if isProtected(pid, name) {
		return errProtected
	}
	var s syscall.Signal
	switch sig {
	case "SIGHUP":
		s = syscall.SIGHUP
	case "SIGSTOP":
		s = syscall.SIGSTOP
	case "SIGCONT":
		s = syscall.SIGCONT
	case "SIGTERM":
		s = syscall.SIGTERM
	case "SIGKILL":
		s = syscall.SIGKILL
	default:
		return errSignal
	}
	return p.SendSignal(s)
}

func Renice(pid, nice int) error {
	if nice < -20 || nice > 19 {
		return errSignal
	}
	p, err := process.NewProcess(int32(pid))
	if err != nil {
		return err
	}
	name, _ := p.Name()
	if isProtected(pid, name) {
		return errProtected
	}
	return syscall.Setpriority(syscall.PRIO_PROCESS, pid, nice)
}

type procError string

func (e procError) Error() string { return string(e) }

var (
	errProtected = procError("这个进程受保护，不能结束或调整优先级")
	errSignal    = procError("不支持这个信号")
)
