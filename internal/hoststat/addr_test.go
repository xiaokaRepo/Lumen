package hoststat

import (
	"testing"

	gnet "github.com/shirou/gopsutil/v4/net"
)

func iface(name, addr string) gnet.InterfaceStat {
	return gnet.InterfaceStat{Name: name, Addrs: []gnet.InterfaceAddr{{Addr: addr}}}
}

func TestPickIfaceSkipsContainerRange(t *testing.T) {
	ip, name := pickIface([]gnet.InterfaceStat{
		iface("lo", "127.0.0.1/8"),
		iface("docker0", "172.17.0.1/16"),
		iface("br-lan", "172.18.0.1/16"),
		iface("enp0s3", "172.30.0.2/24"),
		iface("eno1", "192.168.5.55/24"),
		iface("eth1", "10.1.2.3/8"),
	})
	if ip != "192.168.5.55" || name != "eno1" {
		t.Fatalf("got %s %s", ip, name)
	}
}

func TestPickIfaceFallsBackWhenOnlyContainerIPs(t *testing.T) {
	ip, name := pickIface([]gnet.InterfaceStat{
		iface("lo", "127.0.0.1/8"),
		iface("docker0", "172.17.0.1/16"),
		iface("enp0s3", "172.30.0.2/24"),
	})
	if ip != "" || name != "" {
		t.Fatalf("got %q %q", ip, name)
	}
}

func TestRewriteWeb(t *testing.T) {
	cases := []struct {
		raw, open, want string
	}{
		{"http://172.30.0.2:8089", "192.168.5.55", "http://192.168.5.55:8089"},
		{"http://172.30.0.2:9090/app", "cursor", "http://cursor:9090/app"},
		{"http://127.0.0.1:8088", "cursor", "http://cursor:8088"},
		{"http://[::1]:8443", "nas.local", "http://nas.local:8443"},
		{"https://photos.example.com", "192.168.5.55", "https://photos.example.com"},
		{"http://192.168.5.55:8080", "cursor", "http://192.168.5.55:8080"},
		{"http://172.30.0.2:8089", "172.17.0.1", "http://172.30.0.2:8089"},
		{"", "cursor", ""},
	}
	for _, c := range cases {
		if got := RewriteWeb(c.raw, c.open); got != c.want {
			t.Fatalf("RewriteWeb(%q, %q) = %q, want %q", c.raw, c.open, got, c.want)
		}
	}
}

func TestUsableBindIP(t *testing.T) {
	if UsableBindIP("172.30.0.2") || UsableBindIP("127.0.0.1") || UsableBindIP("0.0.0.0") {
		t.Fatal("container and loopback addresses are not bind targets")
	}
	if !UsableBindIP("192.168.5.55") || !UsableBindIP("10.0.0.8") {
		t.Fatal("LAN addresses should bind")
	}
}
