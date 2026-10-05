package dockermgr

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"

	"github.com/xiaokaRepo/lumen/internal/store"
)

const prevSuffix = ".lumen-prev"

// Brief is the bit of container state the wake proxy needs.
type Brief struct {
	Exists      bool
	Running     bool
	Health      string
	Error       string
	IP          string
	NetworkMode string
}

func applySleep(svc *Service, rec store.SleepRec) {
	svc.Sleeping = rec.Asleep
	if rec.LastError != "" {
		svc.LastError = rec.LastError
	}
	if svc.WebURL == "" && rec.WebURL != "" {
		svc.WebURL = rec.WebURL
	}
	if rec.HostPort <= 0 {
		return
	}
	proto := rec.Proto
	if proto == "" {
		proto = "tcp"
	}
	found := false
	for i := range svc.Ports {
		if svc.Ports[i].Host != rec.HostPort || svc.Ports[i].Proto != proto {
			continue
		}
		found = true
		if rec.Asleep {
			svc.Ports[i].Proxy = true
		}
		if svc.Ports[i].Container == 0 && rec.ContPort > 0 {
			svc.Ports[i].Container = rec.ContPort
		}
	}
	if found {
		return
	}
	ip := rec.BindIP
	if ip == "" {
		ip = "0.0.0.0"
	}
	svc.Ports = append(svc.Ports, PortBinding{
		Host:      rec.HostPort,
		Container: rec.ContPort,
		Proto:     proto,
		IP:        ip,
		Web:       proto == "tcp",
		Proxy:     rec.Asleep,
	})
	sort.Slice(svc.Ports, func(i, j int) bool { return svc.Ports[i].Host < svc.Ports[j].Host })
}

// RecoverName puts a container back if a port rewrite stopped halfway.
func (m *Manager) RecoverName(ctx context.Context, name string) error {
	prev := name + prevSuffix
	_, nameErr := m.cli.ContainerInspect(ctx, name)
	_, prevErr := m.cli.ContainerInspect(ctx, prev)
	switch {
	case nameErr == nil && prevErr == nil:
		return m.cli.ContainerRemove(ctx, prev, container.RemoveOptions{Force: true})
	case nameErr != nil && prevErr == nil:
		return m.cli.ContainerRename(ctx, prev, name)
	case nameErr != nil:
		return nameErr
	default:
		return nil
	}
}

// ReleaseWebBinding recreates the container without the web host port so
// Lumen can listen there while the container is awake and asleep.
func (m *Manager) ReleaseWebBinding(ctx context.Context, name string, hostPort int, proto string) error {
	if err := m.RecoverName(ctx, name); err != nil {
		return err
	}
	info, err := m.cli.ContainerInspect(ctx, name)
	if err != nil {
		return err
	}
	if info.HostConfig == nil || info.Config == nil {
		return fmt.Errorf("容器没有网络配置")
	}
	if info.HostConfig.NetworkMode.IsHost() || info.HostConfig.NetworkMode.IsContainer() {
		return fmt.Errorf("这种网络模式不能代听网页端口")
	}
	if proto == "" {
		proto = "tcp"
	}
	next, changed := dropHostPort(info.HostConfig.PortBindings, hostPort, proto)
	if !changed {
		return nil
	}
	if info.State != nil && (info.State.Running || info.State.Paused) {
		timeout := 10
		if err := m.cli.ContainerStop(ctx, name, container.StopOptions{Timeout: &timeout}); err != nil && !stoppedOK(err) {
			return err
		}
	}
	cfg := *info.Config
	cfg.Hostname = ""
	cfg.Domainname = ""
	cfg.MacAddress = ""
	host := *info.HostConfig
	host.PortBindings = next
	endpoints := map[string]*network.EndpointSettings{}
	if info.NetworkSettings != nil {
		for n, ep := range info.NetworkSettings.Networks {
			endpoints[n] = endpointForCreate(ep)
		}
	}
	var netCfg *network.NetworkingConfig
	if len(endpoints) > 0 {
		netCfg = &network.NetworkingConfig{EndpointsConfig: endpoints}
	}
	prev := name + prevSuffix
	if err := m.cli.ContainerRename(ctx, name, prev); err != nil {
		return err
	}
	if _, err := m.cli.ContainerCreate(ctx, &cfg, &host, netCfg, nil, name); err != nil {
		_ = m.cli.ContainerRename(ctx, prev, name)
		return err
	}
	return m.cli.ContainerRemove(ctx, prev, container.RemoveOptions{Force: true})
}

func endpointForCreate(ep *network.EndpointSettings) *network.EndpointSettings {
	if ep == nil {
		return &network.EndpointSettings{}
	}
	cp := ep.Copy()
	cp.NetworkID = ""
	cp.EndpointID = ""
	cp.Gateway = ""
	cp.IPAddress = ""
	cp.IPPrefixLen = 0
	cp.IPv6Gateway = ""
	cp.GlobalIPv6Address = ""
	cp.GlobalIPv6PrefixLen = 0
	cp.MacAddress = ""
	cp.DNSNames = nil
	cp.IPAMConfig = nil
	return cp
}

func dropHostPort(in nat.PortMap, hostPort int, proto string) (nat.PortMap, bool) {
	changed := false
	out := nat.PortMap{}
	for p, binds := range in {
		pproto := "tcp"
		parts := strings.Split(string(p), "/")
		if len(parts) == 2 {
			pproto = parts[1]
		}
		var kept []nat.PortBinding
		for _, b := range binds {
			if pproto == proto && atoi(b.HostPort) == hostPort {
				changed = true
				continue
			}
			kept = append(kept, b)
		}
		if len(kept) > 0 {
			out[p] = kept
		}
	}
	return out, changed
}

func (m *Manager) InspectBrief(ctx context.Context, name string) (Brief, error) {
	info, err := m.cli.ContainerInspect(ctx, name)
	if err != nil {
		if client.IsErrNotFound(err) {
			return Brief{}, nil
		}
		return Brief{}, err
	}
	b := Brief{Exists: true}
	if info.HostConfig != nil {
		b.NetworkMode = string(info.HostConfig.NetworkMode)
	}
	if info.State != nil {
		b.Running = info.State.Running
		b.Error = strings.TrimSpace(info.State.Error)
		if info.State.Health != nil {
			b.Health = info.State.Health.Status
			if b.Error == "" && b.Health == "unhealthy" && len(info.State.Health.Log) > 0 {
				b.Error = strings.TrimSpace(info.State.Health.Log[len(info.State.Health.Log)-1].Output)
			}
		}
	}
	if info.NetworkSettings != nil {
		names := make([]string, 0, len(info.NetworkSettings.Networks))
		for n := range info.NetworkSettings.Networks {
			names = append(names, n)
		}
		sort.Strings(names)
		for _, n := range names {
			ep := info.NetworkSettings.Networks[n]
			if ep != nil && ep.IPAddress != "" {
				b.IP = ep.IPAddress
				break
			}
		}
	}
	return b, nil
}

// PublishConflict returns a docker-style bind error when another container
// already holds a port this container would publish.
func (m *Manager) PublishConflict(name string, ports []PortBinding) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.services {
		if s.ID == name || s.Name == name {
			continue
		}
		for _, p := range s.Ports {
			held := (s.Status == "running" || s.Status == "paused") && !s.Sleeping
			if s.Sleeping && p.Proxy {
				held = true
			}
			if !held {
				continue
			}
			for _, mine := range ports {
				if mine.Host == p.Host && mine.Proto == p.Proto {
					ip := mine.IP
					if ip == "" {
						ip = "0.0.0.0"
					}
					return fmt.Sprintf("Bind for %s:%d failed: port is already allocated", ip, mine.Host)
				}
			}
		}
	}
	return ""
}

func (m *Manager) HostPorts(ctx context.Context, name string) ([]PortBinding, error) {
	info, err := m.cli.ContainerInspect(ctx, name)
	if err != nil {
		return nil, err
	}
	return portsOf(&info), nil
}

func stoppedOK(err error) bool {
	if err == nil {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "not running") || strings.Contains(msg, "already stopped")
}

func startedOK(err error) bool {
	if err == nil {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "already running") || strings.Contains(msg, "already started")
}
