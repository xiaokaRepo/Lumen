package httpapi

import (
	"net"
	"strings"
)

// ViewerOnLAN reports whether the person opened the panel from the LAN.
// A private address, localhost, or a .local / .lan name counts. A public name
// such as ug.link does not: that visit should use each service's remote URL.
func ViewerOnLAN(hostport string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	if host == "" {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()
	}
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".local") || strings.HasSuffix(lower, ".lan") {
		return true
	}
	return false
}
