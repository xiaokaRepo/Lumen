package hoststat

import (
	"net"
	"net/url"
	"strings"
)

// OpenAddr is the address people use to open a published port: a LAN IPv4,
// or the machine hostname when every address is a container or bridge range.
func (s *Sampler) OpenAddr() string {
	cur := s.Current()
	if usableIPv4(cur.IP) {
		return cur.IP
	}
	name := strings.TrimSpace(cur.Name)
	if name != "" && name != "主机" && !strings.EqualFold(name, "localhost") && !badOpenHost(name) {
		return name
	}
	return "localhost"
}

// RewriteWeb keeps a custom domain and replaces loopback or container-range
// hosts with the machine's open address. The port and scheme stay.
func RewriteWeb(raw, open string) string {
	raw = strings.TrimSpace(raw)
	open = strings.TrimSpace(open)
	if raw == "" || open == "" || badOpenHost(open) {
		return raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return raw
	}
	if !badOpenHost(u.Hostname()) {
		return raw
	}
	if p := u.Port(); p != "" {
		u.Host = net.JoinHostPort(open, p)
	} else {
		u.Host = open
	}
	return u.String()
}

// UsableBindIP reports whether a published bind address is the host's own
// LAN address. Container, bridge, and loopback addresses are not.
func UsableBindIP(ip string) bool {
	return usableIPv4(strings.TrimSpace(ip))
}

// DockerHost reports published addresses that belong to a container bridge.
func DockerHost(ip string) bool {
	parsed := net.ParseIP(strings.Trim(strings.TrimSpace(ip), "[]"))
	if parsed == nil {
		return false
	}
	return dockerRange(parsed)
}

func badOpenHost(host string) bool {
	h := strings.Trim(strings.ToLower(strings.TrimSpace(host)), "[]")
	switch h {
	case "", "localhost", "0.0.0.0", "::", "::1":
		return true
	}
	ip := net.ParseIP(h)
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsMulticast() {
		return true
	}
	return dockerRange(ip)
}

func usableIPv4(s string) bool {
	ip := net.ParseIP(strings.TrimSpace(s))
	if ip == nil || ip.To4() == nil {
		return false
	}
	return !badOpenHost(s)
}

// dockerRange is 172.16.0.0/12, the block Docker uses for bridges and
// container addresses such as 172.30.0.2. It is never a LAN open address.
func dockerRange(ip net.IP) bool {
	ip4 := ip.To4()
	if ip4 == nil {
		return false
	}
	return ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31
}

func lanRank(s string) int {
	ip := net.ParseIP(s).To4()
	if ip == nil {
		return 0
	}
	if ip[0] == 192 && ip[1] == 168 {
		return 3
	}
	if ip[0] == 10 {
		return 2
	}
	return 1
}

func virtualIface(name string) bool {
	n := strings.ToLower(strings.TrimSpace(name))
	if n == "" || n == "lo" {
		return true
	}
	for _, p := range []string{
		"docker", "br-", "veth", "cni", "flannel", "virbr", "podman",
		"tun", "tap", "dummy", "kube", "cali", "lxc", "vboxnet",
	} {
		if strings.HasPrefix(n, p) {
			return true
		}
	}
	return false
}
