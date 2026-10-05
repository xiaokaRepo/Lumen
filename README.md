# Lumen

Lumen 是一个 Docker 管理面板，跑在任何装了 Docker 的 Linux 主机上。

它发现容器，显示状态、端口和图标，查看监控，执行启动、停止、重启和删除，读取日志。容器可以休眠，再次打开它的网页端口时再唤醒。告警通过 Bark、Telegram 或企业微信发出。主页用卡片列出要打开的服务。别的机器跑 `lumen-agent`，面板只负责列出、下发操作和显示状态。

镜像同时提供 linux/amd64 和 linux/arm64：

- 面板：`ghcr.io/xiaokarepo/lumen`
- Agent：`ghcr.io/xiaokarepo/lumen-agent`

## 部署

在要放面板的机器上保存下面的 `docker-compose.yml`，把 `LUMEN_AGENT_TOKEN` 换成至少 8 位的随机字符串，然后执行 `docker compose up -d`。

面板和本机 agent 是两个服务。面板不挂载 Docker 套接字，也不使用主机网络，只发布 7878。本机 agent 挂载 Docker 套接字，使用主机网络、主机进程命名空间，并以特权运行。这台机器上的容器由它管理。它监听 7879，并用 `LUMEN_PANEL=http://127.0.0.1:7878` 连出到本机已发布的面板端口。面板容器不在主机网络里，所以这里用的是主机上的 127.0.0.1，不是面板容器里的 127.0.0.1。

第一次打开会要求设置管理员密码，至少 10 位。忘记密码时执行 `docker exec lumen lumen reset-password`。然后打开「主机」，添加本机：名称自定，地址留空，令牌填成和 `LUMEN_AGENT_TOKEN` 相同的值。代码不会从环境变量自动写入主机，这一步是第一次使用时要做的。

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

  lumen-agent:
    image: ghcr.io/xiaokarepo/lumen-agent:latest
    container_name: lumen-agent
    restart: unless-stopped
    network_mode: host
    pid: host
    privileged: true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - lumen-agent-data:/data
    environment:
      LUMEN_DATA: /data
      LUMEN_ADDR: ":7879"
      LUMEN_AGENT_TOKEN: change-me-please
      LUMEN_PANEL: http://127.0.0.1:7878

volumes:
  lumen-data:
  lumen-agent-data:
```

另一台网络里的机器仍然单独运行 agent，不要把它写进上面的 compose。把 `LUMEN_PANEL` 设成那台机器能够访问到的面板地址，令牌换成另一串至少 8 位的随机字符串。面板上每台主机的令牌不能重复。在「主机」页再添加一台，地址留空，令牌与这台 agent 的 `LUMEN_AGENT_TOKEN` 相同。

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
  -e LUMEN_AGENT_TOKEN=change-me-remote \
  -e LUMEN_PANEL=http://203.0.113.10:7878 \
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
