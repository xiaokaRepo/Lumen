# Lumen

Lumen 是一个 Docker 管理面板，跑在任何装了 Docker 的 Linux 主机上。

它发现容器，显示状态、端口和图标，查看监控，执行启动、停止、重启和删除，读取日志。容器可以休眠，再次打开它的网页端口时再唤醒。告警通过 Bark、Telegram 或企业微信发出。主页用卡片列出要打开的服务。别的机器跑 `lumen-agent`，面板只负责列出、下发操作和显示状态。

镜像同时提供 linux/amd64 和 linux/arm64：

- 面板：`ghcr.io/xiaokarepo/lumen`
- Agent：`ghcr.io/xiaokarepo/lumen-agent`

## 部署

面板不连接 Docker。把下面保存为 `docker-compose.yml` 后执行 `docker compose up -d`。第一次打开会要求设置管理员密码，至少 10 位。忘记密码时执行 `docker exec lumen lumen reset-password`。

```yaml
services:
  lumen:
    image: ghcr.io/xiaokarepo/lumen:latest
    container_name: lumen
    restart: unless-stopped
    ports:
      - "7878:7878"
    volumes:
      - lumen-data:/data
    environment:
      LUMEN_DATA: /data
      LUMEN_ADDR: ":7878"

volumes:
  lumen-data:
```

每台要管理的机器单独运行 agent。它使用这台机器的 Docker 套接字，用主机进程命名空间读取进程，并以主机网络监听端口，这样休眠代理才能占住容器的网页端口。`LUMEN_AGENT_TOKEN` 必填，并填到面板的「主机」页。同一局域网时，在「主机」页填写 agent 地址（例如 `http://192.168.1.20:7879`），面板会去连接它。Agent 在面板拨不进去的网络里时，设置 `LUMEN_PANEL`，由 agent 连出到面板。

把令牌换成至少 8 位的随机字符串，并把 `LUMEN_PANEL` 换成面板实际地址。同一局域网且面板能直接访问 agent 时，可以去掉 `LUMEN_PANEL`。

```bash
docker run -d \
  --name lumen-agent \
  --restart unless-stopped \
  --network host \
  --pid host \
  --privileged \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v lumen-agent-data:/data \
  -e LUMEN_DATA=/data \
  -e LUMEN_ADDR=:7879 \
  -e LUMEN_AGENT_TOKEN=change-me-please \
  -e LUMEN_PANEL=http://192.168.1.10:7878 \
  ghcr.io/xiaokarepo/lumen-agent:latest
```

## 本地开发

```bash
LUMEN_AGENT_TOKEN=change-me LUMEN_ADDR=:7879 go run ./cmd/lumen-agent
LUMEN_ADDR=:7878 go run ./cmd/lumen
npm install
npm run dev
```

开发服务器把 `/api` 代理到面板的 7878 端口。
