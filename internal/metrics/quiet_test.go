package metrics

import (
	"path/filepath"
	"testing"
	"time"
)

func TestQuiet(t *testing.T) {
	h := Open(filepath.Join(t.TempDir(), "m.json"))
	now := time.Unix(10_000, 0)
	every := time.Second
	window := 5 * time.Second
	for i := 0; i <= 5; i++ {
		h.rows["a"] = append(h.rows["a"], Point{At: now.Unix() - 5 + int64(i), CPU: 0.2, Rx: 1, Tx: 1})
	}
	quiet, enough := h.Quiet("a", now, window, every, 2, 32, 32)
	if !quiet || !enough {
		t.Fatalf("quiet=%v enough=%v", quiet, enough)
	}

	h.rows["a"][3].CPU = 9
	quiet, enough = h.Quiet("a", now, window, every, 2, 32, 32)
	if quiet || !enough {
		t.Fatalf("spike quiet=%v enough=%v", quiet, enough)
	}

	h.rows["b"] = []Point{{At: now.Unix(), CPU: 0, Rx: 0, Tx: 0}}
	quiet, enough = h.Quiet("b", now, window, every, 2, 32, 32)
	if quiet || enough {
		t.Fatalf("short quiet=%v enough=%v", quiet, enough)
	}

	h.rows["c"] = append([]Point(nil), h.rows["a"]...)
	h.rows["c"][3].CPU = 0
	h.rows["c"][4].Rx = 32
	quiet, enough = h.Quiet("c", now, window, every, 2, 32, 32)
	if quiet || !enough {
		t.Fatalf("net quiet=%v enough=%v", quiet, enough)
	}
}
