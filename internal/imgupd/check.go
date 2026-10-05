package imgupd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/xiaokaRepo/lumen/internal/dockermgr"
	"github.com/xiaokaRepo/lumen/internal/store"
)

var client = &http.Client{Timeout: 20 * time.Second}

func Check(ctx context.Context, m *dockermgr.Manager) ([]store.UpdateRow, string) {
	images, err := m.Images(ctx)
	if err != nil {
		return nil, err.Error()
	}
	svcs, _ := m.Services()
	var rows []store.UpdateRow
	var fails []string
	seen := map[string]bool{}
	for _, img := range images {
		if img.Repo == "<none>" || img.Tag == "<none>" || len(img.UsedBy) == 0 {
			continue
		}
		ref := img.Repo + ":" + img.Tag
		if seen[ref] {
			continue
		}
		seen[ref] = true
		local, err := m.LocalDigest(ctx, img.Repo, img.Tag)
		if err != nil {
			fails = append(fails, ref+": "+err.Error())
			continue
		}
		remote, err := remoteDigest(ctx, img.Repo, img.Tag)
		if err != nil {
			fails = append(fails, ref+": "+err.Error())
			continue
		}
		if local == remote {
			continue
		}
		var ids []string
		var stack string
		for _, s := range svcs {
			if s.Image == ref || strings.HasPrefix(s.Image, img.Repo+":") {
				ids = append(ids, s.ID)
				if stack == "" {
					stack = s.Stack
				}
			}
		}
		if len(ids) == 0 {
			ids = img.UsedBy
		}
		rows = append(rows, store.UpdateRow{
			ServiceIDs: ids,
			Stack:      stack,
			Image:      ref,
			Current:    short(local),
			Latest:     short(remote),
			Published:  "标签未变，仓库 digest 已更新",
		})
	}
	if rows == nil {
		rows = []store.UpdateRow{}
	}
	note := ""
	if len(fails) > 0 {
		note = strings.Join(fails, "；")
	}
	return rows, note
}

func short(digest string) string {
	d := strings.TrimPrefix(digest, "sha256:")
	if len(d) > 12 {
		d = d[:12]
	}
	return d
}

func remoteDigest(ctx context.Context, repo, tag string) (string, error) {
	host, path := registryPath(repo)
	token, err := tokenFor(ctx, host, path)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://"+registryHost(host)+"/v2/"+path+"/manifests/"+url.PathEscape(tag), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", strings.Join([]string{
		"application/vnd.docker.distribution.manifest.list.v2+json",
		"application/vnd.oci.image.index.v1+json",
		"application/vnd.docker.distribution.manifest.v2+json",
	}, ", "))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, res.Body)
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("仓库返回 %s", res.Status)
	}
	digest := res.Header.Get("Docker-Content-Digest")
	if digest == "" {
		return "", fmt.Errorf("仓库没有返回 digest")
	}
	return digest, nil
}

func registryPath(repo string) (host, path string) {
	parts := strings.Split(repo, "/")
	if len(parts) == 1 || !strings.Contains(parts[0], ".") {
		return "docker.io", "library/" + repo
	}
	return parts[0], strings.Join(parts[1:], "/")
}

func registryHost(host string) string {
	if host == "docker.io" {
		return "registry-1.docker.io"
	}
	return host
}

func tokenFor(ctx context.Context, host, path string) (string, error) {
	var u string
	switch host {
	case "docker.io":
		u = "https://auth.docker.io/token?service=registry.docker.io&scope=repository:" + url.QueryEscape(path) + ":pull"
	case "ghcr.io":
		u = "https://ghcr.io/token?service=ghcr.io&scope=repository:" + url.QueryEscape(path) + ":pull"
	default:
		u = "https://" + host + "/token?service=" + url.QueryEscape(host) + "&scope=repository:" + url.QueryEscape(path) + ":pull"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", err
	}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	var body struct {
		Token       string `json:"token"`
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return "", err
	}
	if body.Token != "" {
		return body.Token, nil
	}
	return body.AccessToken, nil
}
