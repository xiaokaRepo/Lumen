package dockermgr

import (
	"testing"

	"github.com/docker/docker/api/types"

	"github.com/xiaokaRepo/lumen/internal/store"
)

func TestKeepOrSummaryKeepsNameWhenInspectFails(t *testing.T) {
	const sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	known := indexServices([]Service{{
		ID:          "homeassistant",
		ContainerID: sha,
		Name:        "homeassistant",
		DisplayName: "Homeassistant",
		Kind:        "compose",
		Stack:       "home",
		Image:       "ghcr.io/home-assistant/home-assistant:stable",
		Status:      "running",
		Ports:       []PortBinding{{Host: 8123, Proto: "tcp"}},
	}})
	c := types.Container{
		ID:     sha,
		Names:  []string{"/homeassistant"},
		Image:  "ghcr.io/home-assistant/home-assistant:stable",
		State:  "running",
		Labels: map[string]string{"com.docker.compose.project": "home", "com.docker.compose.service": "homeassistant"},
	}
	got := keepOrSummary(c, known, nil, nil, "127.0.0.1")
	if got.ID != "homeassistant" || got.Name != "homeassistant" {
		t.Fatalf("identity changed to %q / %q", got.ID, got.Name)
	}
	if got.Kind != "compose" || got.Image == "" || len(got.Ports) != 1 {
		t.Fatalf("lost previous inspect: %+v", got)
	}
	if got.Status != "running" {
		t.Fatalf("status %q", got.Status)
	}
}

func TestSummaryWhenInspectNeverSucceeded(t *testing.T) {
	const sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	c := types.Container{
		ID:     sha,
		Names:  []string{"/danmu"},
		Image:  "danmu:latest",
		State:  "running",
		Status: "Up 3 hours",
		Labels: map[string]string{"com.docker.compose.project": "media", "com.docker.compose.service": "danmu"},
		Ports:  []types.Port{{PrivatePort: 80, PublicPort: 8080, Type: "tcp"}},
	}
	meta := map[string]store.Meta{}
	got := keepOrSummary(c, map[string]Service{}, meta, nil, "192.168.5.55")
	if got.ID != "danmu" || got.DisplayName != "Danmu" {
		t.Fatalf("name = %q display = %q", got.ID, got.DisplayName)
	}
	if got.Kind != "compose" || got.Stack != "media" || got.Status != "running" {
		t.Fatalf("summary %+v", got)
	}
	if got.Image != "danmu:latest" || len(got.Ports) != 1 || got.Ports[0].Host != 8080 {
		t.Fatalf("ports/image %+v", got)
	}
	if got.ID == sha || got.Name == sha {
		t.Fatal("used the container id as the service identity")
	}
}

func TestListFailureWouldNotReplaceKnownContainer(t *testing.T) {
	stub := Service{
		ID:     "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		Name:   "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		Status: "exited",
		Kind:   "container",
	}
	if stub.Image != "" && stub.ID != stub.Name {
		t.Fatal("fixture is not an inspect stub")
	}
	c := types.Container{
		ID:    stub.ID,
		Names: []string{"/lumen"},
		Image: "ghcr.io/xiaokarepo/lumen:latest",
		State: "running",
	}
	got := keepOrSummary(c, indexServices([]Service{stub}), nil, nil, "127.0.0.1")
	if got.ID != "lumen" || got.Image == "" || got.Status != "running" {
		t.Fatalf("stub was kept: %+v", got)
	}
}
