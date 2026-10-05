package hoststat

import (
	"math"
	"runtime"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	gnet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/sensors"
)

type Disk struct {
	Mount   string  `json:"mount"`
	Label   string  `json:"label"`
	FS      string  `json:"fs"`
	TotalGB float64 `json:"totalGB"`
	UsedGB  float64 `json:"usedGB"`
}

type Snapshot struct {
	Name        string    `json:"name"`
	Model       string    `json:"model"`
	OS          string    `json:"os"`
	Base        string    `json:"base"`
	Kernel      string    `json:"kernel"`
	CPU         string    `json:"cpu"`
	Cores       string    `json:"cores"`
	CPUMaxGHz   float64   `json:"cpuMaxGHz"`
	CPUTempC    int       `json:"cpuTempC"`
	CPUPercent  float64   `json:"cpuPercent"`
	Load        []float64 `json:"load"`
	MemTotalGB  float64   `json:"memTotalGB"`
	MemUsedGB   float64   `json:"memUsedGB"`
	MemCacheGB  float64   `json:"memCacheGB"`
	SwapUsedGB  float64   `json:"swapUsedGB"`
	SwapTotalGB float64   `json:"swapTotalGB"`
	Uptime      string    `json:"uptime"`
	NetIface    string    `json:"netIface"`
	NetRxMBs    float64   `json:"netRxMBs"`
	NetTxMBs    float64   `json:"netTxMBs"`
	Disks       []Disk    `json:"disks"`
	IP          string    `json:"ip"`
}

type Sampler struct {
	mu      sync.Mutex
	last    Snapshot
	prevNet map[string]gnet.IOCountersStat
	prevAt  time.Time
}

func New() *Sampler {
	s := &Sampler{prevNet: map[string]gnet.IOCountersStat{}}
	s.sample()
	go func() {
		t := time.NewTicker(2 * time.Second)
		defer t.Stop()
		for range t.C {
			s.sample()
		}
	}()
	return s
}

func (s *Sampler) Current() Snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.last
}

func (s *Sampler) sample() {
	info, _ := host.Info()
	cpus, _ := cpu.Info()
	pct, _ := cpu.Percent(0, false)
	vm, _ := mem.VirtualMemory()
	sw, _ := mem.SwapMemory()
	ld, _ := load.Avg()
	temps, _ := sensors.SensorsTemperatures()
	counters, _ := gnet.IOCounters(true)
	ifaces, _ := gnet.Interfaces()
	parts, _ := disk.Partitions(false)

	now := time.Now()
	snap := Snapshot{
		Name:   hostname(info),
		Model:  modelName(cpus),
		OS:     osName(info),
		Base:   runtime.GOOS,
		Kernel: kernel(info),
		CPU:    cpuName(cpus),
		Cores:  coresLabel(cpus),
		Load:   []float64{0, 0, 0},
		Disks:  []Disk{},
	}
	if len(cpus) > 0 {
		snap.CPUMaxGHz = round1(cpus[0].Mhz / 1000)
	}
	if len(pct) > 0 {
		snap.CPUPercent = round1(pct[0])
	}
	if ld != nil {
		snap.Load = []float64{round2(ld.Load1), round2(ld.Load5), round2(ld.Load15)}
	}
	if vm != nil {
		snap.MemTotalGB = round1(float64(vm.Total) / 1e9)
		snap.MemUsedGB = round1(float64(vm.Used) / 1e9)
		snap.MemCacheGB = round1(float64(vm.Cached) / 1e9)
	}
	if sw != nil {
		snap.SwapUsedGB = round1(float64(sw.Used) / 1e9)
		snap.SwapTotalGB = round1(float64(sw.Total) / 1e9)
	}
	if info != nil {
		snap.Uptime = formatUptime(info.Uptime)
	}
	snap.CPUTempC = tempC(temps)
	snap.IP, snap.NetIface = pickIface(ifaces)
	snap.NetRxMBs, snap.NetTxMBs = s.rates(counters, now)
	snap.Disks = diskUsage(parts)

	s.mu.Lock()
	s.last = snap
	s.mu.Unlock()
}

func (s *Sampler) rates(counters []gnet.IOCountersStat, now time.Time) (rx, tx float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	dt := now.Sub(s.prevAt).Seconds()
	var rxB, txB uint64
	var name string
	var best uint64
	for _, c := range counters {
		if c.Name == "lo" {
			continue
		}
		total := c.BytesRecv + c.BytesSent
		if total >= best {
			best = total
			name = c.Name
		}
		if prev, ok := s.prevNet[c.Name]; ok && dt > 0 && s.prevAt.Unix() != 0 {
			if c.BytesRecv >= prev.BytesRecv {
				rxB += c.BytesRecv - prev.BytesRecv
			}
			if c.BytesSent >= prev.BytesSent {
				txB += c.BytesSent - prev.BytesSent
			}
		}
	}
	next := map[string]gnet.IOCountersStat{}
	for _, c := range counters {
		next[c.Name] = c
	}
	s.prevNet = next
	s.prevAt = now
	if name != "" && s.last.NetIface == "" {
		_ = name
	}
	if dt <= 0 {
		return 0, 0
	}
	return round2(float64(rxB) / dt / 1e6), round2(float64(txB) / dt / 1e6)
}

func diskUsage(parts []disk.PartitionStat) []Disk {
	seen := map[string]bool{}
	var out []Disk
	for _, p := range parts {
		if p.Fstype == "" || p.Mountpoint == "" || seen[p.Mountpoint] {
			continue
		}
		if p.Fstype == "squashfs" || p.Fstype == "overlay" || p.Fstype == "tmpfs" || p.Fstype == "devtmpfs" {
			continue
		}
		u, err := disk.Usage(p.Mountpoint)
		if err != nil || u.Total == 0 {
			continue
		}
		seen[p.Mountpoint] = true
		label := p.Mountpoint
		if p.Mountpoint == "/" {
			label = "系统分区"
		}
		out = append(out, Disk{
			Mount:   p.Mountpoint,
			Label:   label,
			FS:      p.Fstype,
			TotalGB: round1(float64(u.Total) / 1e9),
			UsedGB:  round1(float64(u.Used) / 1e9),
		})
		if len(out) >= 4 {
			break
		}
	}
	if out == nil {
		out = []Disk{}
	}
	return out
}

func pickIface(ifaces []gnet.InterfaceStat) (ip, label string) {
	for _, ifc := range ifaces {
		if ifc.Name == "lo" {
			continue
		}
		for _, a := range ifc.Addrs {
			ip = stripCIDR(a.Addr)
			if ip == "" || ip == "127.0.0.1" || contains(ip, ':') {
				ip = ""
				continue
			}
			return ip, ifc.Name
		}
	}
	return "127.0.0.1", "lo"
}

func stripCIDR(s string) string {
	for i := 0; i < len(s); i++ {
		if s[i] == '/' {
			return s[:i]
		}
	}
	return s
}

func contains(s string, c byte) bool {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return true
		}
	}
	return false
}

func hostname(info *host.InfoStat) string {
	if info == nil || info.Hostname == "" {
		return "主机"
	}
	return info.Hostname
}

func modelName(cpus []cpu.InfoStat) string {
	if len(cpus) == 0 || cpus[0].ModelName == "" {
		return "主机"
	}
	return cpus[0].ModelName
}

func cpuName(cpus []cpu.InfoStat) string {
	return modelName(cpus)
}

func coresLabel(cpus []cpu.InfoStat) string {
	n := runtime.NumCPU()
	if len(cpus) > 0 && cpus[0].Cores > 0 {
		n = int(cpus[0].Cores)
	}
	return itoa(n) + " 核"
}

func osName(info *host.InfoStat) string {
	if info == nil {
		return runtime.GOOS
	}
	if info.Platform == "" {
		return info.OS
	}
	if info.PlatformVersion != "" {
		return info.Platform + " " + info.PlatformVersion
	}
	return info.Platform
}

func kernel(info *host.InfoStat) string {
	if info == nil {
		return ""
	}
	return info.KernelVersion
}

func tempC(temps []sensors.TemperatureStat) int {
	best := 0.0
	for _, t := range temps {
		if t.Temperature > best && t.Temperature < 150 {
			best = t.Temperature
		}
	}
	return int(math.Round(best))
}

func formatUptime(sec uint64) string {
	d := sec / 86400
	h := (sec % 86400) / 3600
	if d > 0 {
		return itoa(int(d)) + " 天 " + itoa(int(h)) + " 小时"
	}
	m := (sec % 3600) / 60
	if h > 0 {
		return itoa(int(h)) + " 小时 " + itoa(int(m)) + " 分钟"
	}
	return itoa(int(m)) + " 分钟"
}

func DiskBytes() (read, write uint64) {
	counters, err := disk.IOCounters()
	if err != nil {
		return 0, 0
	}
	for _, c := range counters {
		read += c.ReadBytes
		write += c.WriteBytes
	}
	return read, write
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }
func round2(v float64) float64 { return math.Round(v*100) / 100 }

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [16]byte
	i := len(buf)
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
