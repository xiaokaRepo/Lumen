package sleepctl

import (
	"net/url"
	"strconv"
	"strings"

	"github.com/xiaokaRepo/lumen/internal/dockermgr"
)

func blockedNet(mode string) bool {
	m := strings.TrimSpace(mode)
	return m == "host" || strings.HasPrefix(m, "container:")
}

func chooseWeb(svc dockermgr.Service) (host, cont int, ip, proto string, ok bool) {
	if blockedNet(svc.NetworkMode) {
		return
	}
	want := portFromURL(svc.WebURL)
	var first *dockermgr.PortBinding
	for i := range svc.Ports {
		p := &svc.Ports[i]
		if p.Proto != "tcp" || p.Host <= 0 {
			continue
		}
		if first == nil {
			first = p
		}
		if want > 0 && p.Host == want {
			return bindOf(p)
		}
	}
	if want > 0 {
		return
	}
	if first != nil {
		return bindOf(first)
	}
	return
}

func bindOf(p *dockermgr.PortBinding) (int, int, string, string, bool) {
	cont := p.Container
	if cont <= 0 {
		cont = p.Host
	}
	return p.Host, cont, p.IP, "tcp", true
}

func portFromURL(raw string) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return 0
	}
	if p := u.Port(); p != "" {
		n, _ := strconv.Atoi(p)
		return n
	}
	switch u.Scheme {
	case "https":
		return 443
	case "http":
		return 80
	default:
		return 0
	}
}

func hasWeb(svc dockermgr.Service) bool {
	_, _, _, _, ok := chooseWeb(svc)
	return ok
}
