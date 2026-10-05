package alerteng

import (
	"testing"
	"time"

	"github.com/xiaokaRepo/lumen/internal/dockermgr"
	"github.com/xiaokaRepo/lumen/internal/hoststat"
	"github.com/xiaokaRepo/lumen/internal/store"
)

func TestSleepSkipsDownAndResolve(t *testing.T) {
	eng := New()
	rule := store.AlertRule{
		ID: "r", Kind: "service_down", Name: "容器停止", Enabled: true,
		Target: "all", Duration: "立即", Cooldown: "30 分钟", Resolve: true,
	}
	down := dockermgr.Service{ID: "nginx", DisplayName: "Nginx", Kind: "container", Status: "exited"}
	now := time.Now()
	fires := eng.Eval(now, []store.AlertRule{rule}, []dockermgr.Service{down}, hoststat.Snapshot{}, nil)
	if len(fires) != 1 || fires[0].Resolved {
		t.Fatalf("expected a down alert, got %#v", fires)
	}
	down.Sleeping = true
	fires = eng.Eval(now.Add(time.Second), []store.AlertRule{rule}, []dockermgr.Service{down}, hoststat.Snapshot{}, nil)
	if len(fires) != 0 {
		t.Fatalf("sleep should not resolve or re-fire, got %#v", fires)
	}
	down.Sleeping = false
	fires = eng.Eval(now.Add(2*time.Second), []store.AlertRule{rule}, []dockermgr.Service{down}, hoststat.Snapshot{}, nil)
	if len(fires) != 1 || fires[0].Resolved {
		t.Fatalf("a real stop after wake should alert again, got %#v", fires)
	}
}

func TestSleepingNeverMatches(t *testing.T) {
	eng := New()
	rules := []store.AlertRule{
		{ID: "d", Kind: "service_down", Enabled: true, Target: "all", Duration: "立即"},
		{ID: "u", Kind: "unhealthy", Enabled: true, Target: "all", Duration: "立即"},
	}
	svc := dockermgr.Service{
		ID: "nginx", DisplayName: "Nginx", Kind: "container",
		Status: "exited", Health: "unhealthy", Sleeping: true,
	}
	fires := eng.Eval(time.Now(), rules, []dockermgr.Service{svc}, hoststat.Snapshot{}, nil)
	if len(fires) != 0 {
		t.Fatalf("got %#v", fires)
	}
}
