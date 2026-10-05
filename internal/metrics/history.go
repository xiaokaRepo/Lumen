package metrics

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

type Point struct {
	At  int64   `json:"at"`
	CPU float64 `json:"cpu"`
	Mem float64 `json:"mem"`
	Rx  float64 `json:"rx"`
	Tx  float64 `json:"tx"`
	Rd  float64 `json:"rd"`
	Wr  float64 `json:"wr"`
}

type Sample struct {
	ID  string
	CPU float64
	Mem float64
	Rx  float64
	Tx  float64
	Rd  float64
	Wr  float64
}

type History struct {
	mu    sync.Mutex
	path  string
	rows  map[string][]Point
	dirty bool
}

const maxPoints = 2000

func Open(path string) *History {
	h := &History{path: path, rows: map[string][]Point{}}
	b, err := os.ReadFile(path)
	if err == nil {
		_ = json.Unmarshal(b, &h.rows)
	}
	if h.rows == nil {
		h.rows = map[string][]Point{}
	}
	return h
}

func (h *History) Add(samples []Sample) {
	now := time.Now().Unix()
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, s := range samples {
		pts := append(h.rows[s.ID], Point{
			At: now, CPU: s.CPU, Mem: s.Mem, Rx: s.Rx, Tx: s.Tx, Rd: s.Rd, Wr: s.Wr,
		})
		if len(pts) > maxPoints {
			pts = pts[len(pts)-maxPoints:]
		}
		h.rows[s.ID] = pts
	}
	h.dirty = true
}

func (h *History) Flush() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if !h.dirty {
		return
	}
	b, err := json.Marshal(h.rows)
	if err != nil {
		return
	}
	tmp := h.path + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		_ = os.Rename(tmp, h.path)
		h.dirty = false
	}
}

func (h *History) Series(id, rng string) map[string][]map[string]any {
	h.mu.Lock()
	pts := append([]Point(nil), h.rows[id]...)
	h.mu.Unlock()
	step, keep := rangeSpec(rng)
	if step > 1 && len(pts) > step {
		var bucket []Point
		for i := 0; i < len(pts); i += step {
			end := i + step
			if end > len(pts) {
				end = len(pts)
			}
			bucket = append(bucket, avg(pts[i:end]))
		}
		pts = bucket
	}
	if keep > 0 && len(pts) > keep {
		pts = pts[len(pts)-keep:]
	}
	cpu := make([]map[string]any, 0, len(pts))
	mem := make([]map[string]any, 0, len(pts))
	rx := make([]map[string]any, 0, len(pts))
	tx := make([]map[string]any, 0, len(pts))
	rd := make([]map[string]any, 0, len(pts))
	wr := make([]map[string]any, 0, len(pts))
	for _, p := range pts {
		t := time.Unix(p.At, 0).Format("15:04:05")
		cpu = append(cpu, map[string]any{"t": t, "v": p.CPU})
		mem = append(mem, map[string]any{"t": t, "v": p.Mem})
		rx = append(rx, map[string]any{"t": t, "v": p.Rx})
		tx = append(tx, map[string]any{"t": t, "v": p.Tx})
		rd = append(rd, map[string]any{"t": t, "v": p.Rd})
		wr = append(wr, map[string]any{"t": t, "v": p.Wr})
	}
	return map[string][]map[string]any{
		"cpu": cpu, "mem": mem, "rx": rx, "tx": tx, "rd": rd, "wr": wr,
	}
}

func rangeSpec(rng string) (step, keep int) {
	switch rng {
	case "6h":
		return 4, 72
	case "24h":
		return 12, 96
	case "7d":
		return 48, 168
	default:
		return 1, 240
	}
}

func avg(pts []Point) Point {
	if len(pts) == 0 {
		return Point{}
	}
	var c, m, rx, tx, rd, wr float64
	for _, p := range pts {
		c += p.CPU
		m += p.Mem
		rx += p.Rx
		tx += p.Tx
		rd += p.Rd
		wr += p.Wr
	}
	n := float64(len(pts))
	return Point{At: pts[len(pts)-1].At, CPU: c / n, Mem: m / n, Rx: rx / n, Tx: tx / n, Rd: rd / n, Wr: wr / n}
}
