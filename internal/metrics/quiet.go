package metrics

import "time"

// SampleEvery is how often the host and service samplers append a point.
const SampleEvery = 15 * time.Second

// Quiet reports whether every sample in the window is under the limits.
// enough is false when the series does not cover the whole window.
// A sample at or over a limit is not quiet, and the caller starts the window over.
func (h *History) Quiet(id string, now time.Time, window, every time.Duration, cpuMax, rxMax, txMax float64) (quiet, enough bool) {
	if window <= 0 || every <= 0 {
		return false, false
	}
	h.mu.Lock()
	pts := append([]Point(nil), h.rows[id]...)
	h.mu.Unlock()
	if len(pts) == 0 {
		return false, false
	}
	cutoff := now.Add(-window).Unix()
	if pts[0].At > cutoff {
		return false, false
	}
	if now.Unix()-pts[len(pts)-1].At > int64(every.Seconds())*2 {
		return false, false
	}
	need := int(window / every)
	if need < 1 {
		need = 1
	}
	n := 0
	for _, p := range pts {
		if p.At < cutoff {
			continue
		}
		n++
		if p.CPU >= cpuMax || p.Rx >= rxMax || p.Tx >= txMax {
			return false, true
		}
	}
	if n < need {
		return false, false
	}
	return true, true
}
