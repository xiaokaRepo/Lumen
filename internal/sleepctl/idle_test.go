package sleepctl

import (
	"strconv"
	"testing"

	"github.com/xiaokaRepo/lumen/internal/dockermgr"
)

func svc(id, stack, status, net string, idle bool, port int) dockermgr.Service {
	s := dockermgr.Service{
		ID: id, Name: id, Stack: stack, Status: status, NetworkMode: net,
		IdleSleep: idle, Kind: "container",
		WebURL: "http://127.0.0.1:" + strconv.Itoa(port),
	}
	if port > 0 {
		s.Ports = []dockermgr.PortBinding{{Host: port, Container: 80, Proto: "tcp", Web: true}}
	}
	if stack != "" {
		s.Kind = "compose"
	}
	return s
}

func TestPickIdle(t *testing.T) {
	quiet := map[string]bool{"web": true, "db": true, "nginx": true}
	q := func(id string) bool { return quiet[id] }
	list := []dockermgr.Service{
		svc("nginx", "", "running", "bridge", false, 8088),
		svc("solo", "", "running", "bridge", true, 8091),
		svc("hosty", "", "running", "host", true, 8092),
		svc("noweb", "", "running", "bridge", true, 0),
		svc("web", "lab", "running", "bridge", true, 8089),
		svc("db", "lab", "running", "bridge", false, 0),
	}
	got := pickIdle(list, q)
	if len(got) != 1 || got[0] != "web" {
		t.Fatalf("only the quiet stack should sleep, got %v", got)
	}
	quiet["solo"] = true
	got = pickIdle(list, q)
	if len(got) != 2 || got[0] != "web" || got[1] != "solo" {
		t.Fatalf("got %v", got)
	}
	quiet["db"] = false
	got = pickIdle(list, q)
	if len(got) != 1 || got[0] != "solo" {
		t.Fatalf("busy stack member blocks the project, got %v", got)
	}
}
