package sleepctl

import (
	"testing"

	"github.com/xiaokaRepo/lumen/internal/store"
)

func TestListenAddrUsesHostLAN(t *testing.T) {
	if got := listenAddr(store.SleepRec{BindIP: "172.30.0.2", HostPort: 8088}); got != "0.0.0.0:8088" {
		t.Fatalf("container bind: %s", got)
	}
	if got := listenAddr(store.SleepRec{BindIP: "127.0.0.1", HostPort: 8088}); got != "0.0.0.0:8088" {
		t.Fatalf("loopback bind: %s", got)
	}
	if got := listenAddr(store.SleepRec{BindIP: "", HostPort: 9090}); got != "0.0.0.0:9090" {
		t.Fatalf("empty bind: %s", got)
	}
	if got := listenAddr(store.SleepRec{BindIP: "192.168.5.55", HostPort: 8089}); got != "192.168.5.55:8089" {
		t.Fatalf("lan bind: %s", got)
	}
}
