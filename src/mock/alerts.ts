/* Mock sample data for alerts, notification channels and image updates. */

export type ChannelType = "bark" | "telegram" | "wecom"

export interface Channel {
  id: string
  type: ChannelType
  name: string
  enabled: boolean
  config: Record<string, string>
  lastTest?: { ok: boolean; at: string; msg?: string }
}

export const CHANNEL_META: Record<
  ChannelType,
  {
    label: string
    iconSlug: string
    fields: {
      key: string
      label: string
      placeholder: string
      help?: string
      secret?: boolean
    }[]
  }
> = {
  bark: {
    label: "Bark",
    iconSlug: "bark",
    fields: [
      {
        key: "server",
        label: "服务器地址",
        placeholder: "https://api.day.app",
        help: "自建 bark-server 时填写自己的地址",
      },
      {
        key: "key",
        label: "设备 Key",
        placeholder: "从 Bark App 首页复制",
        secret: true,
      },
      { key: "group", label: "分组", placeholder: "Lumen" },
      {
        key: "level",
        label: "中断级别",
        placeholder: "timeSensitive",
        help: "active / timeSensitive / passive / critical",
      },
    ],
  },
  telegram: {
    label: "Telegram",
    iconSlug: "telegram",
    fields: [
      {
        key: "token",
        label: "Bot Token",
        placeholder: "123456:ABC-DEF...",
        secret: true,
      },
      { key: "chatId", label: "Chat ID", placeholder: "-1001234567890" },
      {
        key: "proxy",
        label: "代理 (可选)",
        placeholder: "socks5://192.168.31.1:7890",
        help: "国内网络通常需要代理才能访问 api.telegram.org",
      },
    ],
  },
  wecom: {
    label: "企业微信",
    iconSlug: "wecom",
    fields: [
      {
        key: "webhook",
        label: "群机器人 Webhook",
        placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...",
        secret: true,
      },
      {
        key: "mention",
        label: "提醒成员 (可选)",
        placeholder: "手机号，用逗号分隔",
      },
    ],
  },
}

export const channels: Channel[] = [
  {
    id: "bark-iphone",
    type: "bark",
    name: "我的 iPhone",
    enabled: true,
    config: {
      server: "https://api.day.app",
      key: "Xq7n2kPzR4tVb9",
      group: "NAS",
      level: "timeSensitive",
    },
    lastTest: { ok: true, at: "今天 09:12" },
  },
  {
    id: "tg-home",
    type: "telegram",
    name: "家庭群",
    enabled: true,
    config: {
      token: "7012345678:AAH3k9",
      chatId: "-1002318874012",
      proxy: "socks5://192.168.31.1:7890",
    },
    lastTest: {
      ok: false,
      at: "昨天 22:40",
      msg: "连接 api.telegram.org 超时 (10s)",
    },
  },
  {
    id: "wecom-ops",
    type: "wecom",
    name: "运维群机器人",
    enabled: false,
    config: {
      webhook: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=4f1c",
      mention: "",
    },
  },
]

export type RuleKind =
  | "service_down"
  | "cpu_high"
  | "mem_high"
  | "disk_full"
  | "update_available"
  | "unhealthy"

export interface AlertRule {
  id: string
  kind: RuleKind
  name: string
  enabled: boolean
  target: string
  threshold?: number
  duration?: string
  channels: string[]
  cooldown: string
}

export const RULE_META: Record<RuleKind, { label: string; unit?: string }> = {
  service_down: { label: "服务停止" },
  unhealthy: { label: "健康检查失败" },
  cpu_high: { label: "CPU 过高", unit: "%" },
  mem_high: { label: "内存过高", unit: "%" },
  disk_full: { label: "磁盘将满", unit: "%" },
  update_available: { label: "镜像有更新" },
}

export const rules: AlertRule[] = [
  {
    id: "r1",
    kind: "service_down",
    name: "关键服务停止",
    enabled: true,
    target: "Jellyfin, Immich, Home Assistant, Vaultwarden",
    duration: "1 分钟",
    channels: ["bark-iphone", "tg-home"],
    cooldown: "30 分钟",
  },
  {
    id: "r2",
    kind: "unhealthy",
    name: "容器不健康",
    enabled: true,
    target: "全部容器",
    duration: "3 次检查",
    channels: ["bark-iphone"],
    cooldown: "1 小时",
  },
  {
    id: "r3",
    kind: "cpu_high",
    name: "主机 CPU 持续过高",
    enabled: true,
    target: "主机 (N100)",
    threshold: 85,
    duration: "5 分钟",
    channels: ["bark-iphone"],
    cooldown: "1 小时",
  },
  {
    id: "r4",
    kind: "mem_high",
    name: "主机内存不足",
    enabled: true,
    target: "主机",
    threshold: 90,
    duration: "5 分钟",
    channels: ["bark-iphone", "tg-home"],
    cooldown: "1 小时",
  },
  {
    id: "r5",
    kind: "disk_full",
    name: "存储池将满",
    enabled: true,
    target: "/volume1",
    threshold: 85,
    duration: "立即",
    channels: ["bark-iphone", "tg-home"],
    cooldown: "12 小时",
  },
  {
    id: "r6",
    kind: "cpu_high",
    name: "Immich 机器学习占用",
    enabled: false,
    target: "immich_machine_learning",
    threshold: 70,
    duration: "15 分钟",
    channels: ["tg-home"],
    cooldown: "6 小时",
  },
  {
    id: "r7",
    kind: "update_available",
    name: "每日镜像更新汇总",
    enabled: true,
    target: "全部容器",
    duration: "每天 09:00",
    channels: ["wecom-ops"],
    cooldown: "1 天",
  },
]

export interface AlertEvent {
  id: string
  at: string
  ruleId: string
  severity: "critical" | "warning" | "info"
  title: string
  detail: string
  state: "firing" | "resolved"
  resolvedAt?: string
  sent: { channel: string; ok: boolean }[]
}

export const history: AlertEvent[] = [
  {
    id: "e1",
    at: "今天 14:29",
    ruleId: "r1",
    severity: "critical",
    title: "nextcloud-db 反复重启",
    detail: "7 次重启，最近错误: InnoDB: Unable to lock ./ibdata1",
    state: "firing",
    sent: [
      { channel: "bark-iphone", ok: true },
      { channel: "tg-home", ok: false },
    ],
  },
  {
    id: "e2",
    at: "今天 14:03",
    ruleId: "r2",
    severity: "warning",
    title: "Nextcloud 健康检查失败",
    detail: "连续 3 次 HTTP 503",
    state: "firing",
    sent: [{ channel: "bark-iphone", ok: true }],
  },
  {
    id: "e3",
    at: "今天 12:31",
    ruleId: "r1",
    severity: "warning",
    title: "File Browser 启动失败",
    detail: "端口 8080 已被 qBittorrent 占用",
    state: "firing",
    sent: [{ channel: "bark-iphone", ok: true }],
  },
  {
    id: "e4",
    at: "今天 09:00",
    ruleId: "r7",
    severity: "info",
    title: "3 个镜像有可用更新",
    detail: "jellyfin 10.10.5, radarr 5.17.2, immich v1.123.0",
    state: "resolved",
    resolvedAt: "今天 09:00",
    sent: [],
  },
  {
    id: "e5",
    at: "昨天 21:16",
    ruleId: "r3",
    severity: "warning",
    title: "主机 CPU 91.3% 持续 6 分钟",
    detail: "主要占用: ffmpeg (Jellyfin 转码), python (Immich 机器学习)",
    state: "resolved",
    resolvedAt: "昨天 21:34",
    sent: [{ channel: "bark-iphone", ok: true }],
  },
  {
    id: "e6",
    at: "10月1日 02:10",
    ruleId: "r1",
    severity: "critical",
    title: "Nginx Proxy Manager 已停止",
    detail: "Bind for 0.0.0.0:80 failed: address already in use",
    state: "firing",
    sent: [
      { channel: "bark-iphone", ok: true },
      { channel: "tg-home", ok: true },
    ],
  },
  {
    id: "e7",
    at: "9月29日 03:45",
    ruleId: "r5",
    severity: "warning",
    title: "/volume1 使用率 86.2%",
    detail: "清理下载目录后恢复到 63.1%",
    state: "resolved",
    resolvedAt: "9月29日 10:20",
    sent: [
      { channel: "bark-iphone", ok: true },
      { channel: "tg-home", ok: true },
    ],
  },
]

export interface UpdateRow {
  serviceIds: string[]
  stack?: string
  image: string
  current: string
  latest: string
  published: string
  sizeDeltaMB: number
  changelog?: string
  pinned?: boolean
}

export const updates: UpdateRow[] = [
  {
    serviceIds: ["jellyfin"],
    image: "lscr.io/linuxserver/jellyfin",
    current: "10.10.3",
    latest: "10.10.5",
    published: "6 天前",
    sizeDeltaMB: 14,
    changelog: "https://github.com/jellyfin/jellyfin/releases",
  },
  {
    serviceIds: ["immich-server", "immich-ml"],
    stack: "immich",
    image: "ghcr.io/immich-app/immich-server",
    current: "v1.122.3",
    latest: "v1.123.0",
    published: "2 天前",
    sizeDeltaMB: 38,
    changelog: "https://github.com/immich-app/immich/releases",
  },
  {
    serviceIds: ["radarr"],
    stack: "arr",
    image: "lscr.io/linuxserver/radarr",
    current: "5.16.3",
    latest: "5.17.2",
    published: "9 天前",
    sizeDeltaMB: 6,
  },
  {
    serviceIds: ["nextcloud"],
    stack: "nextcloud",
    image: "nextcloud",
    current: "30.0.4-apache",
    latest: "30.0.5-apache",
    published: "4 天前",
    sizeDeltaMB: 21,
  },
  {
    serviceIds: ["homeassistant"],
    image: "ghcr.io/home-assistant/home-assistant",
    current: "2024.12.4",
    latest: "2025.1.0",
    published: "1 天前",
    sizeDeltaMB: 52,
    pinned: true,
  },
]

export function updateFor(serviceId: string) {
  return updates.find((u) => u.serviceIds.includes(serviceId))
}
