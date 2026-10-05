package dockermgr

import (
	"context"
	"net"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/xiaokaRepo/lumen/internal/store"
)

func TestReleaseWebBindingKeepsContainer(t *testing.T) {
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	m, err := New(st, func() string { return "127.0.0.1" })
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.InspectBrief(ctx, "lumen-nginx"); err != nil {
		t.Skip(err)
	}
	const name = "lumen-sleep-bind"
	_ = exec.Command("docker", "rm", "-f", name).Run()
	out, err := exec.Command("docker", "run", "-d", "--name", name, "-p", "18088:80", "nginx:alpine").CombinedOutput()
	if err != nil {
		t.Skipf("docker run: %v %s", err, out)
	}
	t.Cleanup(func() { _ = exec.Command("docker", "rm", "-f", name).Run() })

	if err := m.ReleaseWebBinding(ctx, name, 18088, "tcp"); err != nil {
		t.Fatal(err)
	}
	ports, err := m.HostPorts(ctx, name)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range ports {
		if p.Host == 18088 {
			t.Fatalf("host port still published: %+v", ports)
		}
	}
	brief, err := m.InspectBrief(ctx, name)
	if err != nil || !brief.Exists || brief.Running {
		t.Fatalf("brief=%+v err=%v", brief, err)
	}
	if err := m.Action(ctx, name, "start", false); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(15 * time.Second)
	var last error
	for time.Now().Before(deadline) {
		brief, err = m.InspectBrief(ctx, name)
		if err == nil && brief.Running && brief.IP != "" {
			conn, err := net.DialTimeout("tcp", net.JoinHostPort(brief.IP, "80"), time.Second)
			if err == nil {
				conn.Close()
				return
			}
			last = err
		}
		time.Sleep(200 * time.Millisecond)
	}
	t.Fatalf("container port not reachable: %v brief=%+v", last, brief)
}

func TestPublishConflictMessage(t *testing.T) {
	m := &Manager{services: []Service{
		{ID: "a", Name: "a", Status: "running", Ports: []PortBinding{{Host: 8088, Proto: "tcp", IP: "0.0.0.0"}}},
	}}
	msg := m.PublishConflict("b", []PortBinding{{Host: 8088, Proto: "tcp", IP: "0.0.0.0"}})
	if !strings.Contains(msg, "already allocated") {
		t.Fatal(msg)
	}
	if m.PublishConflict("a", []PortBinding{{Host: 8088, Proto: "tcp"}}) != "" {
		t.Fatal("a container should not conflict with itself")
	}
}
