package httpapi

import "testing"

func TestViewerOnLAN(t *testing.T) {
	yes := []string{
		"127.0.0.1:7878",
		"192.168.1.20:7878",
		"10.0.0.5",
		"[::1]:7878",
		"nas.local",
		"media.home.lan",
		"localhost:7878",
	}
	no := []string{
		"lumen.example.ug.link:7878",
		"dxp.example.com",
		"panel.ug.link",
	}
	for _, h := range yes {
		if !ViewerOnLAN(h) {
			t.Errorf("%s should be LAN", h)
		}
	}
	for _, h := range no {
		if ViewerOnLAN(h) {
			t.Errorf("%s should be remote", h)
		}
	}
}
