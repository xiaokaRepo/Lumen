package dockermgr

import (
	"context"
	"encoding/json"
	"io"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"

	"github.com/xiaokaRepo/lumen/internal/store"
)

type PortBinding struct {
	Host      int    `json:"host"`
	Container int    `json:"container,omitempty"`
	Proto     string `json:"proto"`
	IP        string `json:"ip,omitempty"`
	Web       bool   `json:"web,omitempty"`
	Proxy     bool   `json:"proxy,omitempty"`
}

type EnvVar struct {
	Key    string `json:"key"`
	Value  string `json:"value"`
	Secret bool   `json:"secret,omitempty"`
}

type Mount struct {
	Type   string `json:"type"`
	Source string `json:"source"`
	Target string `json:"target"`
	Mode   string `json:"mode"`
	Name   string `json:"name,omitempty"`
}

type Service struct {
	ID            string         `json:"id"`
	ContainerID   string         `json:"containerId,omitempty"`
	Name          string         `json:"name"`
	DisplayName   string         `json:"displayName"`
	Kind          string         `json:"kind"`
	Stack         string         `json:"stack,omitempty"`
	Group         string         `json:"group"`
	Status        string         `json:"status"`
	Health        string         `json:"health,omitempty"`
	Image         string         `json:"image,omitempty"`
	IconMatch     string         `json:"iconMatch"`
	IconOverride  *store.IconRef `json:"iconOverride,omitempty"`
	Ports         []PortBinding  `json:"ports"`
	WebURL        string         `json:"webUrl,omitempty"`
	RemoteURL     string         `json:"remoteUrl,omitempty"`
	CPU           float64        `json:"cpu"`
	MemMB         float64        `json:"memMB"`
	MemLimitMB    float64        `json:"memLimitMB,omitempty"`
	NetRxKBs      float64        `json:"netRxKBs"`
	NetTxKBs      float64        `json:"netTxKBs"`
	DiskReadKBs   float64        `json:"diskReadKBs"`
	DiskWriteKBs  float64        `json:"diskWriteKBs"`
	Uptime        string         `json:"uptime"`
	RestartPolicy string         `json:"restartPolicy,omitempty"`
	NetworkMode   string         `json:"networkMode,omitempty"`
	Networks      []string       `json:"networks,omitempty"`
	Env           []EnvVar       `json:"env,omitempty"`
	Mounts        []Mount        `json:"mounts,omitempty"`
	Description   string         `json:"description,omitempty"`
	ExitCode      *int           `json:"exitCode,omitempty"`
	LastError     string         `json:"lastError,omitempty"`
	HideOnHome    bool           `json:"hideOnHome,omitempty"`
	Sleeping      bool           `json:"sleeping,omitempty"`
	SleepFor      string         `json:"sleepFor,omitempty"`
	IdleSleep     bool           `json:"idleSleep,omitempty"`
}

type LogLine struct {
	TS    string `json:"ts"`
	Level string `json:"level"`
	Msg   string `json:"msg"`
}

type sample struct {
	at  time.Time
	rx  uint64
	tx  uint64
	rd  uint64
	wr  uint64
	cpu float64
	mem uint64
	lim uint64
}

type Manager struct {
	cli      *client.Client
	meta     *store.Store
	hostIP   func() string
	mu       sync.Mutex
	services []Service
	stats    map[string]sample
	errText  string
	busy     bool
}

func New(st *store.Store, hostIP func() string) (*Manager, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	m := &Manager{cli: cli, meta: st, hostIP: hostIP, stats: map[string]sample{}}
	m.refresh()
	go func() {
		t := time.NewTicker(2 * time.Second)
		defer t.Stop()
		for range t.C {
			m.refresh()
		}
	}()
	return m, nil
}

func (m *Manager) Services() ([]Service, string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := append([]Service(nil), m.services...)
	return out, m.errText
}

func (m *Manager) One(id string) (Service, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.services {
		if s.ID == id {
			return s, true
		}
	}
	return Service{}, false
}

func (m *Manager) refresh() {
	m.mu.Lock()
	if m.busy {
		m.mu.Unlock()
		return
	}
	m.busy = true
	previous := append([]Service(nil), m.services...)
	m.mu.Unlock()
	defer func() {
		m.mu.Lock()
		m.busy = false
		m.mu.Unlock()
	}()

	listCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	list, err := m.cli.ContainerList(listCtx, container.ListOptions{All: true})
	if err != nil {
		m.mu.Lock()
		m.errText = err.Error()
		m.mu.Unlock()
		return
	}
	meta := m.meta.AllMeta()
	sleeps := m.meta.SleepRecs()
	ip := "127.0.0.1"
	if m.hostIP != nil {
		ip = m.hostIP()
	}
	known := indexServices(previous)
	services := make([]Service, 0, len(list))
	nextStats := map[string]sample{}
	for _, c := range list {
		name := containerName(c)
		if name == "" || strings.HasSuffix(name, prevSuffix) {
			continue
		}
		itemCtx, itemCancel := context.WithTimeout(context.Background(), 3*time.Second)
		svc, stat, inspectErr := m.inspect(itemCtx, c.ID, meta, sleeps, ip)
		itemCancel()
		if inspectErr != nil {
			svc = keepOrSummary(c, known, meta, sleeps, ip)
			stat = sample{}
		}
		services = append(services, svc)
		if stat.at.Unix() != 0 {
			nextStats[svc.ID] = stat
		}
	}
	sort.SliceStable(services, func(i, j int) bool {
		return services[i].DisplayName < services[j].DisplayName
	})
	m.mu.Lock()
	m.services = services
	m.stats = nextStats
	m.errText = ""
	m.mu.Unlock()
}

func (m *Manager) RefreshNow() { m.refresh() }

func indexServices(list []Service) map[string]Service {
	out := make(map[string]Service, len(list)*2)
	for _, s := range list {
		if s.Name != "" {
			out[s.Name] = s
		}
		if s.ContainerID != "" {
			out["cid:"+s.ContainerID] = s
		}
	}
	return out
}

func containerName(c types.Container) string {
	for _, raw := range c.Names {
		name := strings.TrimPrefix(raw, "/")
		if i := strings.LastIndex(name, "/"); i >= 0 {
			name = name[i+1:]
		}
		if name != "" {
			return name
		}
	}
	if c.ID == "" {
		return ""
	}
	if len(c.ID) > 12 {
		return c.ID[:12]
	}
	return c.ID
}

func mapListState(state string) string {
	switch state {
	case "running":
		return "running"
	case "paused":
		return "paused"
	case "restarting":
		return "restarting"
	default:
		return "exited"
	}
}

// keepOrSummary keeps the last successful inspect for this container. A failed
// inspect must not replace it with a row named by the container id. With no
// previous inspect, the list summary still supplies the name, image, and state.
func keepOrSummary(c types.Container, known map[string]Service, meta map[string]store.Meta, sleeps map[string]store.SleepRec, hostIP string) Service {
	name := containerName(c)
	if old, ok := known[name]; ok && old.Image != "" && old.ID == name {
		old.Status = mapListState(c.State)
		old.ContainerID = c.ID
		return old
	}
	if old, ok := known["cid:"+c.ID]; ok && old.Image != "" && old.ID != "" && old.ID != c.ID {
		old.Status = mapListState(c.State)
		old.ContainerID = c.ID
		return old
	}
	return serviceFromSummary(c, meta, sleeps, hostIP)
}

func serviceFromSummary(c types.Container, meta map[string]store.Meta, sleeps map[string]store.SleepRec, hostIP string) Service {
	name := containerName(c)
	md := meta[name]
	project := ""
	if c.Labels != nil {
		project = c.Labels["com.docker.compose.project"]
	}
	kind := "container"
	if project != "" {
		kind = "compose"
	}
	display := md.DisplayName
	if display == "" {
		svc := ""
		if c.Labels != nil {
			svc = c.Labels["com.docker.compose.service"]
		}
		if svc != "" {
			display = title(svc)
		} else {
			display = title(name)
		}
	}
	group := md.Group
	if group == "" {
		group = "未分组"
	}
	ports := portsFromList(c.Ports)
	web := md.WebURL
	if web == "" {
		for _, p := range ports {
			if p.Web {
				web = "http://" + hostIP + ":" + itoa(p.Host)
				break
			}
		}
	}
	svc := Service{
		ID:           name,
		ContainerID:  c.ID,
		Name:         name,
		DisplayName:  display,
		Kind:         kind,
		Stack:        project,
		Group:        group,
		Status:       mapListState(c.State),
		Image:        c.Image,
		IconMatch:    c.Image,
		IconOverride: md.IconOverride,
		Ports:        ports,
		WebURL:       web,
		RemoteURL:    md.RemoteURL,
		NetworkMode:  c.HostConfig.NetworkMode,
		Description:  md.Description,
		HideOnHome:   md.HideOnHome,
		IdleSleep:    md.IdleSleep,
		Uptime:       c.Status,
	}
	if rec, ok := sleeps[name]; ok {
		applySleep(&svc, rec)
	}
	return svc
}

func portsFromList(in []types.Port) []PortBinding {
	out := make([]PortBinding, 0, len(in))
	for _, p := range in {
		if p.PublicPort == 0 {
			continue
		}
		proto := p.Type
		if proto == "" {
			proto = "tcp"
		}
		ip := p.IP
		if ip == "" {
			ip = "0.0.0.0"
		}
		out = append(out, PortBinding{
			Host:      int(p.PublicPort),
			Container: int(p.PrivatePort),
			Proto:     proto,
			IP:        ip,
			Web:       proto == "tcp",
		})
	}
	return out
}

func (m *Manager) inspect(ctx context.Context, id string, meta map[string]store.Meta, sleeps map[string]store.SleepRec, hostIP string) (Service, sample, error) {
	info, err := m.cli.ContainerInspect(ctx, id)
	if err != nil {
		return Service{}, sample{}, err
	}
	name := strings.TrimPrefix(info.Name, "/")
	md := meta[name]
	project := info.Config.Labels["com.docker.compose.project"]
	kind := "container"
	if project != "" {
		kind = "compose"
	}
	status := mapStatus(info.State)
	health := ""
	if info.State.Health != nil {
		health = info.State.Health.Status
	}
	ports := portsOf(&info)
	display := md.DisplayName
	if display == "" {
		if svc := info.Config.Labels["com.docker.compose.service"]; svc != "" {
			display = title(svc)
		} else {
			display = title(name)
		}
	}
	group := md.Group
	if group == "" {
		group = "未分组"
	}
	web := md.WebURL
	if web == "" {
		for _, p := range ports {
			if p.Web {
				web = "http://" + hostIP + ":" + itoa(p.Host)
				break
			}
		}
	}
	var exit *int
	if info.State != nil && status == "exited" {
		code := info.State.ExitCode
		exit = &code
	}
	lastErr := ""
	if info.State != nil {
		lastErr = info.State.Error
		if lastErr == "" && info.State.Health != nil && health == "unhealthy" && len(info.State.Health.Log) > 0 {
			lastErr = info.State.Health.Log[len(info.State.Health.Log)-1].Output
		}
	}
	nets := make([]string, 0, len(info.NetworkSettings.Networks))
	for n := range info.NetworkSettings.Networks {
		nets = append(nets, n)
	}
	sort.Strings(nets)
	svc := Service{
		ID:            name,
		ContainerID:   info.ID,
		Name:          name,
		DisplayName:   display,
		Kind:          kind,
		Stack:         project,
		Group:         group,
		Status:        status,
		Health:        health,
		Image:         info.Config.Image,
		IconMatch:     info.Config.Image,
		IconOverride:  md.IconOverride,
		Ports:         ports,
		WebURL:        web,
		RemoteURL:     md.RemoteURL,
		Uptime:        uptimeOf(info.State),
		RestartPolicy: string(info.HostConfig.RestartPolicy.Name),
		NetworkMode:   string(info.HostConfig.NetworkMode),
		Networks:      nets,
		Env:           envs(info.Config.Env),
		Mounts:        mountsOf(&info),
		Description:   md.Description,
		ExitCode:      exit,
		LastError:     strings.TrimSpace(lastErr),
		HideOnHome:    md.HideOnHome,
		IdleSleep:     md.IdleSleep,
	}
	if rec, ok := sleeps[name]; ok {
		applySleep(&svc, rec)
	}
	statCtx, statCancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	stat := m.stat(statCtx, name, status)
	statCancel()
	svc.CPU = round1(stat.cpu)
	svc.MemMB = round1(float64(stat.mem) / 1024 / 1024)
	if stat.lim > 0 {
		svc.MemLimitMB = round1(float64(stat.lim) / 1024 / 1024)
	}
	m.mu.Lock()
	prev := m.stats[name]
	m.mu.Unlock()
	if !prev.at.IsZero() && !stat.at.IsZero() {
		dt := stat.at.Sub(prev.at).Seconds()
		if dt > 0 {
			if stat.rx >= prev.rx {
				svc.NetRxKBs = round1(float64(stat.rx-prev.rx) / dt / 1024)
			}
			if stat.tx >= prev.tx {
				svc.NetTxKBs = round1(float64(stat.tx-prev.tx) / dt / 1024)
			}
			if stat.rd >= prev.rd {
				svc.DiskReadKBs = round1(float64(stat.rd-prev.rd) / dt / 1024)
			}
			if stat.wr >= prev.wr {
				svc.DiskWriteKBs = round1(float64(stat.wr-prev.wr) / dt / 1024)
			}
		}
	}
	return svc, stat, nil
}

func (m *Manager) stat(ctx context.Context, id, status string) sample {
	if status != "running" && status != "restarting" {
		return sample{}
	}
	resp, err := m.cli.ContainerStats(ctx, id, false)
	if err != nil {
		return sample{}
	}
	defer resp.Body.Close()
	var st types.StatsJSON
	if err := json.NewDecoder(resp.Body).Decode(&st); err != nil {
		return sample{}
	}
	var rx, tx uint64
	for _, n := range st.Networks {
		rx += n.RxBytes
		tx += n.TxBytes
	}
	rd, wr := blkioBytes(&st)
	return sample{
		at:  time.Now(),
		rx:  rx,
		tx:  tx,
		rd:  rd,
		wr:  wr,
		cpu: cpuPercent(&st),
		mem: memUsed(&st),
		lim: st.MemoryStats.Limit,
	}
}

func blkioBytes(s *types.StatsJSON) (read, write uint64) {
	for _, e := range s.BlkioStats.IoServiceBytesRecursive {
		switch strings.ToLower(e.Op) {
		case "read":
			read += e.Value
		case "write":
			write += e.Value
		}
	}
	return
}

func cpuPercent(s *types.StatsJSON) float64 {
	cpuDelta := float64(s.CPUStats.CPUUsage.TotalUsage) - float64(s.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(s.CPUStats.SystemUsage) - float64(s.PreCPUStats.SystemUsage)
	online := float64(s.CPUStats.OnlineCPUs)
	if online == 0 {
		online = float64(len(s.CPUStats.CPUUsage.PercpuUsage))
	}
	if cpuDelta <= 0 || sysDelta <= 0 || online == 0 {
		return 0
	}
	return (cpuDelta / sysDelta) * online * 100
}

func memUsed(s *types.StatsJSON) uint64 {
	usage := s.MemoryStats.Usage
	if v, ok := s.MemoryStats.Stats["inactive_file"]; ok && usage > v {
		return usage - v
	}
	if v, ok := s.MemoryStats.Stats["cache"]; ok && usage > v {
		return usage - v
	}
	return usage
}

func (m *Manager) Action(ctx context.Context, id, action string, removeVolumes bool) error {
	switch action {
	case "start":
		return m.cli.ContainerStart(ctx, id, container.StartOptions{})
	case "stop":
		timeout := 10
		return m.cli.ContainerStop(ctx, id, container.StopOptions{Timeout: &timeout})
	case "restart":
		timeout := 10
		return m.cli.ContainerRestart(ctx, id, container.StopOptions{Timeout: &timeout})
	case "pause":
		return m.cli.ContainerPause(ctx, id)
	case "unpause":
		return m.cli.ContainerUnpause(ctx, id)
	case "remove":
		return m.cli.ContainerRemove(ctx, id, container.RemoveOptions{Force: true, RemoveVolumes: removeVolumes})
	default:
		return errAction(action)
	}
}

func (m *Manager) Logs(ctx context.Context, id string, tail string) ([]LogLine, error) {
	if tail == "" {
		tail = "500"
	}
	rc, err := m.cli.ContainerLogs(ctx, id, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Timestamps: true,
		Tail:       tail,
	})
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	var buf strings.Builder
	if _, err := stdcopy.StdCopy(&buf, &buf, rc); err != nil && err != io.EOF {
		// Some drivers already demux. Fall back to the raw reader content we have.
		if buf.Len() == 0 {
			return nil, err
		}
	}
	return parseLogs(buf.String()), nil
}

func (m *Manager) RefreshSoon() {
	go m.refresh()
}

type actionError string

func (e actionError) Error() string { return string(e) }
func errAction(a string) error      { return actionError("未知操作: " + a) }

func mapStatus(st *types.ContainerState) string {
	if st == nil {
		return "exited"
	}
	switch st.Status {
	case "running":
		if st.Restarting {
			return "restarting"
		}
		return "running"
	case "paused":
		return "paused"
	case "restarting":
		return "restarting"
	default:
		return "exited"
	}
}

func portsOf(info *types.ContainerJSON) []PortBinding {
	var out []PortBinding
	if info.HostConfig != nil {
		for port, binds := range info.HostConfig.PortBindings {
			proto := "tcp"
			num := 0
			parts := strings.Split(string(port), "/")
			if len(parts) == 2 {
				num = atoi(parts[0])
				proto = parts[1]
			}
			if len(binds) == 0 {
				continue
			}
			for _, b := range binds {
				hostPort := atoi(b.HostPort)
				if hostPort == 0 {
					continue
				}
				ip := b.HostIP
				if ip == "" {
					ip = "0.0.0.0"
				}
				out = append(out, PortBinding{
					Host:      hostPort,
					Container: num,
					Proto:     proto,
					IP:        ip,
					Web:       proto == "tcp",
				})
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Host < out[j].Host })
	if out == nil {
		out = []PortBinding{}
	}
	return out
}

func envs(in []string) []EnvVar {
	out := make([]EnvVar, 0, len(in))
	for _, e := range in {
		k, v, ok := strings.Cut(e, "=")
		if !ok || k == "" || k == "PATH" || k == "HOME" {
			continue
		}
		out = append(out, EnvVar{Key: k, Value: v, Secret: secretKey(k)})
	}
	return out
}

func secretKey(k string) bool {
	u := strings.ToUpper(k)
	for _, n := range []string{"PASS", "SECRET", "TOKEN", "KEY", "PWD", "PRIVATE"} {
		if strings.Contains(u, n) && !strings.Contains(u, "KEYBOARD") {
			return true
		}
	}
	return false
}

func mountsOf(info *types.ContainerJSON) []Mount {
	var out []Mount
	for _, m := range info.Mounts {
		mode := "rw"
		if !m.RW {
			mode = "ro"
		}
		typ := string(m.Type)
		if typ == "" {
			typ = "bind"
		}
		out = append(out, Mount{Type: typ, Source: m.Source, Target: m.Destination, Mode: mode, Name: m.Name})
	}
	if out == nil {
		out = []Mount{}
	}
	return out
}

func uptimeOf(st *types.ContainerState) string {
	if st == nil || st.Status != "running" || st.StartedAt == "" {
		return ""
	}
	t, err := time.Parse(time.RFC3339Nano, st.StartedAt)
	if err != nil {
		return ""
	}
	d := time.Since(t)
	if d < 0 {
		d = 0
	}
	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	if days > 0 {
		return itoa(days) + " 天 " + itoa(hours) + " 小时"
	}
	if hours > 0 {
		return itoa(hours) + " 小时"
	}
	mins := int(d.Minutes())
	if mins < 1 {
		return "刚刚"
	}
	return itoa(mins) + " 分钟"
}

func parseLogs(raw string) []LogLine {
	lines := strings.Split(raw, "\n")
	out := make([]LogLine, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		ts := ""
		msg := line
		if len(line) > 30 && line[4] == '-' && line[10] == 'T' {
			if i := strings.IndexByte(line, ' '); i > 0 {
				ts = line[:i]
				msg = line[i+1:]
				if t, err := time.Parse(time.RFC3339Nano, ts); err == nil {
					ts = t.Local().Format("15:04:05")
				}
			}
		}
		level := "info"
		low := strings.ToLower(msg)
		switch {
		case strings.Contains(low, "error") || strings.Contains(low, "fatal") || strings.Contains(low, "panic"):
			level = "error"
		case strings.Contains(low, "warn"):
			level = "warn"
		}
		out = append(out, LogLine{TS: ts, Level: level, Msg: msg})
	}
	return out
}

func title(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }

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

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [16]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
