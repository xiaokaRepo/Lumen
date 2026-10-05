# lumen-agent

面板留在绿联 DXP4800 上。它只列出服务、发送启动停止和休眠这类操作，并显示状态。它不连 SSH，也不调用 UGOS 的私有接口。

每台要管理的机器自己跑 `lumen-agent`。Agent 在那台机器上发现 Docker 容器，执行启动、停止、日志和镜像操作，读取进程和磁盘，并在那台机器的网页端口上做休眠和唤醒代理。面板和 agent 用一枚令牌互相确认。

## 同一局域网

在面板的「主机」页填写 agent 的地址，例如 `http://192.168.1.20:7879`，以及和 agent 相同的令牌。这种情况下由面板主动连接 agent。

```bash
# 在被管理的机器上
export LUMEN_AGENT_TOKEN='一串足够长的随机令牌'
export LUMEN_DATA=/var/lib/lumen-agent
export LUMEN_ADDR=:7879
lumen-agent
```

把 Docker 套接字给 agent。休眠代理要绑定那台机器上的网页端口，所以 agent 需要能监听这些端口。

## Agent 在另一层 NAT 后面

面板拨不进去。这时要让 agent 能访问到面板，并带上同一枚令牌：

```bash
export LUMEN_PANEL=http://面板的地址:7878
export LUMEN_AGENT_TOKEN='和面板里填写的相同'
lumen-agent
```

主机地址可以留空。Agent 会连出到面板，面板再把操作从这条连接送回去。

UGREENlink 只给人打开面板页面用。它不是 agent 的通道。人用浏览器打开 ug.link 或自己的域名时，看到的是面板；agent 不会走这条链接。

## 服务的两个地址

每个服务可以记两个打开地址：

- 局域网地址：在家里或同一局域网时使用。
- 远程地址：可选，填 ug.link 或自己的域名。

人从局域网地址打开面板时，卡片用局域网地址。人从公网名字打开面板时，卡片用远程地址。远程地址留空时，卡片始终用局域网地址。

卡片副标题仍是你写的描述。没有描述时，副标题是当前会打开的那个地址。
