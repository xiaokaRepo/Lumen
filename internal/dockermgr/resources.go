package dockermgr

import (
	"context"
	"io"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/volume"
)

type ImageRow struct {
	Repo    string   `json:"repo"`
	Tag     string   `json:"tag"`
	ID      string   `json:"id"`
	SizeMB  float64  `json:"sizeMB"`
	Created string   `json:"created"`
	UsedBy  []string `json:"usedBy"`
}

type NetworkRow struct {
	Name     string   `json:"name"`
	Driver   string   `json:"driver"`
	Subnet   string   `json:"subnet,omitempty"`
	Gateway  string   `json:"gateway,omitempty"`
	Scope    string   `json:"scope"`
	Members  []string `json:"members"`
	Internal bool     `json:"internal,omitempty"`
}

type VolumeRow struct {
	Name       string   `json:"name"`
	Driver     string   `json:"driver"`
	SizeMB     float64  `json:"sizeMB"`
	Mountpoint string   `json:"mountpoint"`
	UsedBy     []string `json:"usedBy"`
	Created    string   `json:"created"`
}

func (m *Manager) Images(ctx context.Context) ([]ImageRow, error) {
	list, err := m.cli.ImageList(ctx, image.ListOptions{})
	if err != nil {
		return nil, err
	}
	used := m.imageUsers()
	out := make([]ImageRow, 0, len(list))
	for _, img := range list {
		repo, tag := "<none>", "<none>"
		if len(img.RepoTags) > 0 && img.RepoTags[0] != "<none>:<none>" {
			repo, tag = splitRepoTag(img.RepoTags[0])
		}
		id := strings.TrimPrefix(img.ID, "sha256:")
		if len(id) > 12 {
			id = id[:12]
		}
		users := used[repo+":"+tag]
		if users == nil && len(img.RepoTags) > 0 {
			users = used[img.RepoTags[0]]
		}
		if users == nil {
			users = []string{}
		}
		out = append(out, ImageRow{
			Repo:    repo,
			Tag:     tag,
			ID:      id,
			SizeMB:  round1(float64(img.Size) / 1024 / 1024),
			Created: ago(time.Unix(img.Created, 0)),
			UsedBy:  users,
		})
	}
	return out, nil
}

func (m *Manager) imageUsers() map[string][]string {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string][]string{}
	for _, s := range m.services {
		if s.Image == "" {
			continue
		}
		// UsedBy is matched again after ImageList by repo; also record by image ref.
		out[s.Image] = append(out[s.Image], s.ID)
	}
	return out
}

func (m *Manager) LocalDigest(ctx context.Context, repo, tag string) (string, error) {
	list, err := m.cli.ImageList(ctx, image.ListOptions{})
	if err != nil {
		return "", err
	}
	want := repo + ":" + tag
	for _, img := range list {
		ok := false
		for _, t := range img.RepoTags {
			if t == want || strings.HasSuffix(t, "/"+want) {
				ok = true
				break
			}
		}
		if !ok {
			continue
		}
		for _, d := range img.RepoDigests {
			if i := strings.LastIndex(d, "@"); i >= 0 {
				return d[i+1:], nil
			}
		}
		return "", actionError(want + " 没有本地 digest")
	}
	return "", actionError("本地没有 " + want)
}

func (m *Manager) RemoveImage(ctx context.Context, id string) error {
	_, err := m.cli.ImageRemove(ctx, id, image.RemoveOptions{})
	return err
}

func (m *Manager) Networks(ctx context.Context) ([]NetworkRow, error) {
	list, err := m.cli.NetworkList(ctx, network.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]NetworkRow, 0, len(list))
	for _, n := range list {
		row := NetworkRow{
			Name:     n.Name,
			Driver:   n.Driver,
			Scope:    n.Scope,
			Internal: n.Internal,
			Members:  []string{},
		}
		if len(n.IPAM.Config) > 0 {
			row.Subnet = n.IPAM.Config[0].Subnet
			row.Gateway = n.IPAM.Config[0].Gateway
		}
		ins, err := m.cli.NetworkInspect(ctx, n.ID, network.InspectOptions{})
		if err == nil {
			for _, c := range ins.Containers {
				name := strings.TrimPrefix(c.Name, "/")
				row.Members = append(row.Members, name)
			}
		}
		out = append(out, row)
	}
	return out, nil
}

func (m *Manager) RemoveNetwork(ctx context.Context, id string) error {
	return m.cli.NetworkRemove(ctx, id)
}

func (m *Manager) Volumes(ctx context.Context) ([]VolumeRow, error) {
	sizes := map[string]int64{}
	if du, err := m.cli.DiskUsage(ctx, types.DiskUsageOptions{Types: []types.DiskUsageObject{types.VolumeObject}}); err == nil {
		for _, v := range du.Volumes {
			if v == nil || v.UsageData == nil || v.UsageData.Size <= 0 {
				continue
			}
			sizes[v.Name] = v.UsageData.Size
		}
	}
	list, err := m.cli.VolumeList(ctx, volume.ListOptions{})
	if err != nil {
		return nil, err
	}
	used := m.volumeUsers()
	out := make([]VolumeRow, 0, len(list.Volumes))
	for _, v := range list.Volumes {
		if v == nil {
			continue
		}
		users := used[v.Name]
		if users == nil {
			users = []string{}
		}
		created := v.CreatedAt
		if t, err := time.Parse(time.RFC3339Nano, v.CreatedAt); err == nil {
			created = ago(t)
		} else if t, err := time.Parse(time.RFC3339, v.CreatedAt); err == nil {
			created = ago(t)
		}
		size := sizes[v.Name]
		if size <= 0 && v.UsageData != nil && v.UsageData.Size > 0 {
			size = v.UsageData.Size
		}
		out = append(out, VolumeRow{
			Name:       v.Name,
			Driver:     v.Driver,
			SizeMB:     round1(float64(size) / 1024 / 1024),
			Mountpoint: v.Mountpoint,
			UsedBy:     users,
			Created:    created,
		})
	}
	return out, nil
}

func (m *Manager) volumeUsers() map[string][]string {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string][]string{}
	for _, s := range m.services {
		for _, mt := range s.Mounts {
			if mt.Type != "volume" {
				continue
			}
			name := mt.Name
			if name == "" {
				name = volumeName(mt.Source)
			}
			if name != "" {
				out[name] = append(out[name], s.ID)
			}
		}
	}
	return out
}

func (m *Manager) RemoveVolume(ctx context.Context, name string) error {
	return m.cli.VolumeRemove(ctx, name, false)
}

func (m *Manager) StackAction(ctx context.Context, project, action string) error {
	m.mu.Lock()
	var ids []string
	for _, s := range m.services {
		if s.Stack == project {
			ids = append(ids, s.Name)
		}
	}
	m.mu.Unlock()
	if len(ids) == 0 {
		return actionError("没有这个 compose 栈")
	}
	var first error
	for _, id := range ids {
		if err := m.Action(ctx, id, action, false); err != nil && first == nil {
			first = err
		}
	}
	m.RefreshSoon()
	return first
}

func (m *Manager) ContainerIDs() map[string]string {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string]string{}
	for _, s := range m.services {
		if s.ContainerID == "" {
			continue
		}
		out[s.ContainerID] = s.ID
		if len(s.ContainerID) >= 12 {
			out[s.ContainerID[:12]] = s.ID
		}
	}
	return out
}

func volumeName(source string) string {
	const mark = "/volumes/"
	i := strings.Index(source, mark)
	if i < 0 {
		return ""
	}
	rest := source[i+len(mark):]
	if j := strings.Index(rest, "/"); j > 0 {
		return rest[:j]
	}
	return rest
}

func (m *Manager) PruneImages(ctx context.Context) (int, error) {
	rows, err := m.Images(ctx)
	if err != nil {
		return 0, err
	}
	n := 0
	var first error
	for _, img := range rows {
		if len(img.UsedBy) > 0 {
			continue
		}
		if err := m.RemoveImage(ctx, img.ID); err != nil {
			if first == nil {
				first = err
			}
			continue
		}
		n++
	}
	return n, first
}

func (m *Manager) PruneVolumes(ctx context.Context) (int, error) {
	rows, err := m.Volumes(ctx)
	if err != nil {
		return 0, err
	}
	n := 0
	var first error
	for _, v := range rows {
		if len(v.UsedBy) > 0 {
			continue
		}
		if err := m.RemoveVolume(ctx, v.Name); err != nil {
			if first == nil {
				first = err
			}
			continue
		}
		n++
	}
	return n, first
}

func (m *Manager) Pull(ctx context.Context, ref string) error {
	rc, err := m.cli.ImagePull(ctx, ref, image.PullOptions{})
	if err != nil {
		return err
	}
	defer rc.Close()
	_, err = io.Copy(io.Discard, rc)
	return err
}

func (m *Manager) CreateNetwork(ctx context.Context, name, driver, subnet string) error {
	opts := network.CreateOptions{Driver: driver}
	if subnet != "" {
		opts.IPAM = &network.IPAM{Config: []network.IPAMConfig{{Subnet: subnet}}}
	}
	_, err := m.cli.NetworkCreate(ctx, name, opts)
	return err
}

func splitRepoTag(ref string) (string, string) {
	i := strings.LastIndex(ref, ":")
	if i <= 0 || strings.Contains(ref[i:], "/") {
		return ref, "latest"
	}
	return ref[:i], ref[i+1:]
}

func ago(t time.Time) string {
	d := time.Since(t)
	if d < 0 {
		d = 0
	}
	days := int(d.Hours()) / 24
	switch {
	case days >= 365:
		return itoa(days/365) + " 年前"
	case days >= 30:
		return itoa(days/30) + " 个月前"
	case days >= 1:
		return itoa(days) + " 天前"
	case d.Hours() >= 1:
		return itoa(int(d.Hours())) + " 小时前"
	default:
		return itoa(int(d.Minutes())) + " 分钟前"
	}
}
