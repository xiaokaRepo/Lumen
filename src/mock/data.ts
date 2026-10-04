import type { IconRef } from "@/lib/icons"

/* All values in this file are mock sample data for the UI prototype. */

export type ServiceKind = "container" | "compose" | "systemd" | "process"
export type ServiceStatus = "running" | "paused" | "exited" | "restarting"
export type Proto = "tcp" | "udp"

export interface PortBinding {
  host: number
  container?: number
  proto: Proto
  ip?: string
  web?: boolean
}

export interface EnvVar {
  key: string
  value: string
  secret?: boolean
}

export interface Mount {
  type: "bind" | "volume" | "device"
  source: string
  target: string
  mode: "rw" | "ro"
}

export interface Service {
  id: string
  name: string
  displayName: string
  kind: ServiceKind
  stack?: string
  group: string
  status: ServiceStatus
  health?: "healthy" | "unhealthy" | "starting"
  image?: string
  unit?: string
  pid?: number
  iconMatch: string
  iconOverride?: IconRef
  ports: PortBinding[]
  webUrl?: string
  cpu: number
  memMB: number
  memLimitMB?: number
  netRxKBs: number
  netTxKBs: number
  uptime: string
  updateAvailable?: string
  restartPolicy?: string
  networkMode?: string
  networks?: string[]
  env?: EnvVar[]
  mounts?: Mount[]
  description?: string
  exitCode?: number
  lastError?: string
  hideOnHome?: boolean
}

export const HOST_IP = "192.168.31.20"

export const host = {
  name: "DXP4800",
  model: "UGREEN DXP4800",
  os: "UGOS Pro 1.3.0",
  base: "Debian 12",
  kernel: "6.1.0-ugos",
  cpu: "Intel N100",
  cores: "4 核 4 线程",
  cpuMaxGHz: 3.4,
  cpuTempC: 51,
  cpuPercent: 27.4,
  load: [1.31, 1.08, 0.94],
  memTotalGB: 15.4,
  memUsedGB: 9.7,
  memCacheGB: 3.2,
  swapUsedGB: 0.3,
  swapTotalGB: 4,
  uptime: "23 天 7 小时",
  netIface: "eth0 · 2.5 GbE",
  netRxMBs: 4.82,
  netTxMBs: 1.37,
  disks: [
    {
      mount: "/volume1",
      label: "存储池 1",
      fs: "Btrfs",
      totalGB: 931,
      usedGB: 588,
    },
    { mount: "/", label: "系统分区", fs: "ext4", totalGB: 32, usedGB: 11.6 },
  ],
}

const env = (pairs: [string, string, boolean?][]): EnvVar[] =>
  pairs.map(([key, value, secret]) => ({ key, value, secret }))

export const services: Service[] = [
  {
    id: "jellyfin",
    name: "jellyfin",
    displayName: "Jellyfin",
    kind: "container",
    group: "媒体",
    status: "running",
    health: "healthy",
    image: "lscr.io/linuxserver/jellyfin:10.10.3",
    iconMatch: "lscr.io/linuxserver/jellyfin:10.10.3",
    ports: [
      { host: 8096, container: 8096, proto: "tcp", web: true },
      { host: 7359, container: 7359, proto: "udp" },
      { host: 1900, container: 1900, proto: "udp" },
    ],
    webUrl: `http://${HOST_IP}:8096`,
    cpu: 41.8,
    memMB: 1184,
    memLimitMB: 4096,
    netRxKBs: 312,
    netTxKBs: 3870,
    uptime: "6 天",
    updateAvailable: "10.10.5",
    restartPolicy: "unless-stopped",
    networkMode: "bridge",
    networks: ["bridge"],
    description: "家庭影音库，N100 核显硬件转码",
    env: env([
      ["PUID", "1000"],
      ["PGID", "10"],
      ["TZ", "Asia/Shanghai"],
      ["JELLYFIN_PublishedServerUrl", `http://${HOST_IP}:8096`],
    ]),
    mounts: [
      {
        type: "bind",
        source: "/volume1/docker/jellyfin/config",
        target: "/config",
        mode: "rw",
      },
      { type: "bind", source: "/volume1/media", target: "/media", mode: "ro" },
      { type: "device", source: "/dev/dri", target: "/dev/dri", mode: "rw" },
    ],
  },
  {
    id: "immich-server",
    name: "immich_server",
    displayName: "Immich",
    kind: "compose",
    stack: "immich",
    group: "照片",
    status: "running",
    health: "healthy",
    image: "ghcr.io/immich-app/immich-server:v1.122.3",
    iconMatch: "ghcr.io/immich-app/immich-server:v1.122.3",
    ports: [{ host: 2283, container: 2283, proto: "tcp", web: true }],
    webUrl: `http://${HOST_IP}:2283`,
    cpu: 3.6,
    memMB: 742,
    netRxKBs: 18,
    netTxKBs: 26,
    uptime: "11 天",
    restartPolicy: "always",
    networkMode: "immich_default",
    networks: ["immich_default"],
    env: env([
      ["DB_HOSTNAME", "immich_postgres"],
      ["DB_USERNAME", "postgres"],
      ["DB_PASSWORD", "k2v9-Tq4m-xR8w", true],
      ["REDIS_HOSTNAME", "immich_redis"],
      ["UPLOAD_LOCATION", "/volume1/photos/immich"],
    ]),
    mounts: [
      {
        type: "bind",
        source: "/volume1/photos/immich",
        target: "/usr/src/app/upload",
        mode: "rw",
      },
      {
        type: "bind",
        source: "/etc/localtime",
        target: "/etc/localtime",
        mode: "ro",
      },
    ],
  },
  {
    id: "immich-ml",
    name: "immich_machine_learning",
    displayName: "Immich 机器学习",
    kind: "compose",
    stack: "immich",
    group: "照片",
    status: "running",
    image: "ghcr.io/immich-app/immich-machine-learning:v1.122.3",
    iconMatch: "ghcr.io/immich-app/immich-machine-learning:v1.122.3",
    ports: [],
    cpu: 22.3,
    memMB: 1630,
    netRxKBs: 2,
    netTxKBs: 1,
    uptime: "11 天",
    restartPolicy: "always",
    networkMode: "immich_default",
    networks: ["immich_default"],
    mounts: [
      {
        type: "volume",
        source: "immich_model-cache",
        target: "/cache",
        mode: "rw",
      },
    ],
  },
  {
    id: "immich-postgres",
    name: "immich_postgres",
    displayName: "Immich 数据库",
    kind: "compose",
    stack: "immich",
    group: "照片",
    status: "running",
    health: "healthy",
    image: "docker.io/tensorchord/pgvecto-rs:pg14-v0.2.0",
    iconMatch: "docker.io/tensorchord/pgvecto-rs:pg14-v0.2.0",
    ports: [],
    cpu: 1.2,
    memMB: 214,
    netRxKBs: 9,
    netTxKBs: 11,
    uptime: "11 天",
    restartPolicy: "always",
    networks: ["immich_default"],
    mounts: [
      {
        type: "volume",
        source: "immich_pgdata",
        target: "/var/lib/postgresql/data",
        mode: "rw",
      },
    ],
  },
  {
    id: "immich-redis",
    name: "immich_redis",
    displayName: "Immich 缓存",
    kind: "compose",
    stack: "immich",
    group: "照片",
    status: "running",
    health: "healthy",
    image: "docker.io/valkey/valkey:8-bookworm",
    iconMatch: "docker.io/valkey/valkey:8-bookworm",
    ports: [],
    cpu: 0.3,
    memMB: 18,
    netRxKBs: 1,
    netTxKBs: 1,
    uptime: "11 天",
    restartPolicy: "always",
    networks: ["immich_default"],
  },
  {
    id: "qbittorrent",
    name: "qbittorrent",
    displayName: "qBittorrent",
    kind: "container",
    group: "下载",
    status: "running",
    image: "lscr.io/linuxserver/qbittorrent:5.0.2",
    iconMatch: "lscr.io/linuxserver/qbittorrent:5.0.2",
    ports: [
      { host: 8080, container: 8080, proto: "tcp", web: true },
      { host: 6881, container: 6881, proto: "tcp" },
      { host: 6881, container: 6881, proto: "udp" },
    ],
    webUrl: `http://${HOST_IP}:8080`,
    cpu: 4.7,
    memMB: 318,
    netRxKBs: 2840,
    netTxKBs: 640,
    uptime: "6 天",
    restartPolicy: "unless-stopped",
    networks: ["bridge"],
    env: env([
      ["PUID", "1000"],
      ["PGID", "10"],
      ["WEBUI_PORT", "8080"],
    ]),
    mounts: [
      {
        type: "bind",
        source: "/volume1/docker/qbittorrent",
        target: "/config",
        mode: "rw",
      },
      {
        type: "bind",
        source: "/volume1/downloads",
        target: "/downloads",
        mode: "rw",
      },
    ],
  },
  {
    id: "sonarr",
    name: "sonarr",
    displayName: "Sonarr",
    kind: "compose",
    stack: "arr",
    group: "下载",
    status: "running",
    image: "lscr.io/linuxserver/sonarr:4.0.11",
    iconMatch: "lscr.io/linuxserver/sonarr:4.0.11",
    ports: [{ host: 8989, container: 8989, proto: "tcp", web: true }],
    webUrl: `http://${HOST_IP}:8989`,
    cpu: 0.8,
    memMB: 201,
    netRxKBs: 3,
    netTxKBs: 2,
    uptime: "6 天",
    restartPolicy: "unless-stopped",
    networks: ["arr_default"],
  },
  {
    id: "radarr",
    name: "radarr",
    displayName: "Radarr",
    kind: "compose",
    stack: "arr",
    group: "下载",
    status: "running",
    image: "lscr.io/linuxserver/radarr:5.16.3",
    iconMatch: "lscr.io/linuxserver/radarr:5.16.3",
    ports: [{ host: 7878, container: 7878, proto: "tcp", web: true }],
    webUrl: `http://${HOST_IP}:7878`,
    cpu: 0.6,
    memMB: 187,
    netRxKBs: 2,
    netTxKBs: 1,
    uptime: "6 天",
    updateAvailable: "5.17.2",
    restartPolicy: "unless-stopped",
    networks: ["arr_default"],
  },
  {
    id: "prowlarr",
    name: "prowlarr",
    displayName: "Prowlarr",
    kind: "compose",
    stack: "arr",
    group: "下载",
    status: "running",
    image: "lscr.io/linuxserver/prowlarr:1.28.2",
    iconMatch: "lscr.io/linuxserver/prowlarr:1.28.2",
    ports: [{ host: 9696, container: 9696, proto: "tcp", web: true }],
    webUrl: `http://${HOST_IP}:9696`,
    cpu: 0.4,
    memMB: 142,
    netRxKBs: 1,
    netTxKBs: 1,
    uptime: "6 天",
    restartPolicy: "unless-stopped",
    networks: ["arr_default"],
  },
  {
    id: "filebrowser",
    name: "filebrowser",
    displayName: "File Browser",
    kind: "container",
    group: "工具",
    status: "exited",
    exitCode: 1,
    lastError: "Bind for 0.0.0.0:8080 failed: port is already allocated",
    image: "filebrowser/filebrowser:v2.31.2",
    iconMatch: "filebrowser/filebrowser:v2.31.2",
    ports: [{ host: 8080, container: 80, proto: "tcp", web: true }],
    webUrl: `http://${HOST_IP}:8080`,
    cpu: 0,
    memMB: 0,
    netRxKBs: 0,
    netTxKBs: 0,
    uptime: "2 小时前退出",
    restartPolicy: "no",
    networks: ["bridge"],
    mounts: [{ type: "bind", source: "/volume1", target: "/srv", mode: "rw" }],
  },
  {
    id: "homeassistant",
    name: "homeassistant",
    displayName: "Home Assistant",
    kind: "container",
    group: "智能家居",
    status: "running",
    health: "healthy",
    image: "ghcr.io/home-assistant/home-assistant:2024.12.4",
    iconMatch: "ghcr.io/home-assistant/home-assistant:2024.12.4",
    ports: [{ host: 8123, proto: "tcp", web: true }],
    webUrl: `http://${HOST_IP}:8123`,
    cpu: 2.9,
    memMB: 486,
    netRxKBs: 14,
    netTxKBs: 9,
    uptime: "23 天",
    restartPolicy: "unless-stopped",
    networkMode: "host",
    networks: ["host"],
    env: env([["TZ", "Asia/Shanghai"]]),
    mounts: [
      {
        type: "bind",
        source: "/volume1/docker/homeassistant",
        target: "/config",
        mode: "rw",
      },
      { type: "bind", source: "/run/dbus", target: "/run/dbus", mode: "ro" },
    ],
  },
  {
    id: "adguardhome",
    name: "adguardhome",
    displayName: "AdGuard Home",
    kind: "container",
    group: "网络",
    status: "running",
    image: "adguard/adguardhome:v0.107.55",
    iconMatch: "adguard/adguardhome:v0.107.55",
    ports: [
      { host: 53, container: 53, proto: "tcp" },
      { host: 53, container: 53, proto: "udp" },
      { host: 3000, container: 3000, proto: "tcp", web: true },
    ],
    webUrl: `http://${HOST_IP}:3000`,
    cpu: 0.7,
    memMB: 96,
    netRxKBs: 21,
    netTxKBs: 24,
    uptime: "23 天",
    restartPolicy: "unless-stopped",
    networks: ["bridge"],
  },
  {
    id: "npm",
    name: "nginx-proxy-manager",
    displayName: "Nginx Proxy Manager",
    kind: "container",
    group: "网络",
    status: "exited",
    exitCode: 128,
    lastError: "Bind for 0.0.0.0:80 failed: address already in use",
    image: "jc21/nginx-proxy-manager:2.12.1",
    iconMatch: "jc21/nginx-proxy-manager:2.12.1",
    ports: [
      { host: 80, container: 80, proto: "tcp" },
      { host: 443, container: 443, proto: "tcp" },
      { host: 81, container: 81, proto: "tcp", web: true },
    ],
    webUrl: `http://${HOST_IP}:81`,
    cpu: 0,
    memMB: 0,
    netRxKBs: 0,
    netTxKBs: 0,
    uptime: "3 天前退出",
    restartPolicy: "unless-stopped",
    networks: ["proxy"],
  },
  {
    id: "vaultwarden",
    name: "vaultwarden",
    displayName: "Vaultwarden",
    kind: "container",
    group: "工具",
    status: "running",
    health: "healthy",
    image: "vaultwarden/server:1.32.5",
    iconMatch: "vaultwarden/server:1.32.5",
    ports: [{ host: 8222, container: 80, proto: "tcp", web: true }],
    webUrl: `http://${HOST_IP}:8222`,
    cpu: 0.1,
    memMB: 38,
    netRxKBs: 1,
    netTxKBs: 1,
    uptime: "23 天",
    restartPolicy: "unless-stopped",
    networks: ["proxy"],
    env: env([
      ["DOMAIN", "https://vault.home.lan"],
      ["ADMIN_TOKEN", "$argon2id$v=19$m=65540", true],
      ["SIGNUPS_ALLOWED", "false"],
    ]),
  },
  {
    id: "uptime-kuma",
    name: "uptime-kuma",
    displayName: "Uptime Kuma",
    kind: "container",
    group: "工具",
    status: "paused",
    image: "louislam/uptime-kuma:1.23.16",
    iconMatch: "louislam/uptime-kuma:1.23.16",
    ports: [{ host: 3001, container: 3001, proto: "tcp", web: true }],
    webUrl: `http://${HOST_IP}:3001`,
    cpu: 0,
    memMB: 112,
    netRxKBs: 0,
    netTxKBs: 0,
    uptime: "已暂停 40 分钟",
    restartPolicy: "unless-stopped",
    networks: ["bridge"],
  },
  {
    id: "nextcloud",
    name: "nextcloud-app",
    displayName: "Nextcloud",
    kind: "compose",
    stack: "nextcloud",
    group: "工具",
    status: "running",
    health: "unhealthy",
    image: "nextcloud:30.0.4-apache",
    iconMatch: "nextcloud:30.0.4-apache",
    ports: [{ host: 8081, container: 80, proto: "tcp", web: true }],
    webUrl: `http://${HOST_IP}:8081`,
    cpu: 1.9,
    memMB: 268,
    netRxKBs: 6,
    netTxKBs: 12,
    uptime: "2 天",
    restartPolicy: "always",
    networks: ["nextcloud_default"],
  },
  {
    id: "nextcloud-db",
    name: "nextcloud-db",
    displayName: "Nextcloud 数据库",
    kind: "compose",
    stack: "nextcloud",
    group: "工具",
    status: "restarting",
    image: "mariadb:11.4",
    iconMatch: "mariadb:11.4",
    ports: [],
    cpu: 0,
    memMB: 0,
    netRxKBs: 0,
    netTxKBs: 0,
    uptime: "重启中 (第 7 次)",
    restartPolicy: "always",
    networks: ["nextcloud_default"],
    lastError: "InnoDB: Unable to lock ./ibdata1 error: 11",
  },
  {
    id: "docker-mm",
    name: "docker-mm",
    displayName: "Docker-MM",
    kind: "container",
    group: "系统",
    status: "running",
    image: "ghcr.io/local/docker-mm:0.1.0",
    iconMatch: "ghcr.io/local/docker-mm:0.1.0",
    ports: [{ host: 9420, proto: "tcp", web: true }],
    webUrl: `http://${HOST_IP}:9420`,
    cpu: 0.9,
    memMB: 41,
    netRxKBs: 4,
    netTxKBs: 18,
    uptime: "23 天",
    restartPolicy: "unless-stopped",
    networkMode: "host",
    networks: ["host"],
    description: "本面板 (privileged, pid: host)",
  },
  {
    id: "ugos-web",
    name: "ugos-web",
    displayName: "UGOS Pro 管理页",
    kind: "process",
    group: "系统",
    status: "running",
    pid: 1187,
    iconMatch: "ugos-web",
    ports: [
      { host: 80, proto: "tcp", web: true },
      { host: 9999, proto: "tcp" },
      { host: 9443, proto: "tcp" },
    ],
    webUrl: `http://${HOST_IP}:9999`,
    cpu: 0.4,
    memMB: 64,
    netRxKBs: 2,
    netTxKBs: 3,
    uptime: "23 天",
  },
  {
    id: "smbd",
    name: "smbd",
    displayName: "Samba 文件共享",
    kind: "systemd",
    unit: "smbd.service",
    group: "系统",
    status: "running",
    pid: 1402,
    iconMatch: "smbd",
    ports: [
      { host: 445, proto: "tcp" },
      { host: 139, proto: "tcp" },
    ],
    cpu: 1.1,
    memMB: 52,
    netRxKBs: 820,
    netTxKBs: 96,
    uptime: "23 天",
  },
  {
    id: "sshd",
    name: "ssh",
    displayName: "SSH",
    kind: "systemd",
    unit: "ssh.service",
    group: "系统",
    status: "running",
    pid: 988,
    iconMatch: "sshd",
    ports: [{ host: 22, proto: "tcp" }],
    cpu: 0,
    memMB: 7,
    netRxKBs: 0,
    netTxKBs: 0,
    uptime: "23 天",
  },
  {
    id: "tailscaled",
    name: "tailscaled",
    displayName: "Tailscale",
    kind: "systemd",
    unit: "tailscaled.service",
    group: "网络",
    status: "running",
    pid: 1033,
    iconMatch: "tailscaled",
    ports: [{ host: 41641, proto: "udp" }],
    cpu: 0.3,
    memMB: 46,
    netRxKBs: 11,
    netTxKBs: 8,
    uptime: "23 天",
  },
  {
    id: "docker",
    name: "docker",
    displayName: "Docker Engine",
    kind: "systemd",
    unit: "docker.service",
    group: "系统",
    status: "running",
    pid: 1251,
    iconMatch: "dockerd",
    ports: [],
    cpu: 1.4,
    memMB: 118,
    netRxKBs: 0,
    netTxKBs: 0,
    uptime: "23 天",
  },
  {
    id: "syncthing",
    name: "syncthing",
    displayName: "Syncthing",
    kind: "process",
    group: "工具",
    status: "running",
    pid: 2214,
    iconMatch: "syncthing",
    ports: [
      { host: 8384, proto: "tcp", ip: "127.0.0.1", web: true },
      { host: 22000, proto: "tcp" },
      { host: 22000, proto: "udp" },
      { host: 21027, proto: "udp" },
    ],
    webUrl: "http://127.0.0.1:8384",
    cpu: 0.6,
    memMB: 74,
    netRxKBs: 5,
    netTxKBs: 3,
    uptime: "23 天",
  },
]

export const GROUPS = [
  "媒体",
  "照片",
  "下载",
  "智能家居",
  "网络",
  "工具",
  "系统",
]

export function getService(id: string) {
  return services.find((s) => s.id === id)
}

/* ---------- ports ---------- */

export interface PortRow {
  port: number
  proto: Proto
  ip: string
  serviceId: string
  containerPort?: number
  bound: boolean
}

export function allPorts(): PortRow[] {
  const rows: PortRow[] = []
  for (const s of services) {
    for (const p of s.ports) {
      const bound =
        s.status === "running" || s.status === "paused"
          ? !(s.id === "filebrowser" || s.id === "npm")
          : false
      rows.push({
        port: p.host,
        proto: p.proto,
        ip: p.ip ?? "0.0.0.0",
        serviceId: s.id,
        containerPort: p.container,
        bound,
      })
    }
  }
  return rows.sort((a, b) => a.port - b.port || a.proto.localeCompare(b.proto))
}

export function portConflicts() {
  const map = new Map<string, PortRow[]>()
  for (const r of allPorts()) {
    const k = `${r.port}/${r.proto}`
    map.set(k, [...(map.get(k) ?? []), r])
  }
  return [...map.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([k, rows]) => ({ key: k, rows }))
}

/* ---------- processes ---------- */

export interface Proc {
  pid: number
  name: string
  user: string
  cpu: number
  memMB: number
  nice: number
  state: "R" | "S" | "D" | "T" | "Z"
  threads: number
  started: string
  command: string
  serviceId?: string
}

export const processes: Proc[] = [
  {
    pid: 48211,
    name: "ffmpeg",
    user: "abc",
    cpu: 38.6,
    memMB: 412,
    nice: 0,
    state: "R",
    threads: 9,
    started: "14:12",
    command:
      "/usr/lib/jellyfin-ffmpeg/ffmpeg -hwaccel qsv -i /media/movies/Dune.Part.Two.2024.mkv -c:v h264_qsv",
    serviceId: "jellyfin",
  },
  {
    pid: 3120,
    name: "python",
    user: "root",
    cpu: 21.9,
    memMB: 1544,
    nice: 0,
    state: "S",
    threads: 34,
    started: "9月23日",
    command: "python -m immich_ml",
    serviceId: "immich-ml",
  },
  {
    pid: 2876,
    name: "jellyfin",
    user: "abc",
    cpu: 3.2,
    memMB: 772,
    nice: 0,
    state: "S",
    threads: 51,
    started: "9月28日",
    command: "/usr/bin/jellyfin --ffmpeg=/usr/lib/jellyfin-ffmpeg/ffmpeg",
    serviceId: "jellyfin",
  },
  {
    pid: 2990,
    name: "qbittorrent-nox",
    user: "abc",
    cpu: 4.6,
    memMB: 309,
    nice: 0,
    state: "S",
    threads: 22,
    started: "9月28日",
    command: "/usr/bin/qbittorrent-nox --webui-port=8080",
    serviceId: "qbittorrent",
  },
  {
    pid: 3011,
    name: "immich",
    user: "root",
    cpu: 3.4,
    memMB: 701,
    nice: 0,
    state: "S",
    threads: 18,
    started: "9月23日",
    command: "node /usr/src/app/dist/main",
    serviceId: "immich-server",
  },
  {
    pid: 1251,
    name: "dockerd",
    user: "root",
    cpu: 1.4,
    memMB: 118,
    nice: 0,
    state: "S",
    threads: 27,
    started: "9月11日",
    command:
      "/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock",
    serviceId: "docker",
  },
  {
    pid: 1402,
    name: "smbd",
    user: "root",
    cpu: 1.1,
    memMB: 52,
    nice: 0,
    state: "S",
    threads: 1,
    started: "9月11日",
    command: "/usr/sbin/smbd --foreground --no-process-group",
    serviceId: "smbd",
  },
  {
    pid: 3244,
    name: "postgres",
    user: "999",
    cpu: 1.2,
    memMB: 206,
    nice: 0,
    state: "S",
    threads: 1,
    started: "9月23日",
    command: "postgres -c shared_preload_libraries=vectors.so",
    serviceId: "immich-postgres",
  },
  {
    pid: 2602,
    name: "python3",
    user: "root",
    cpu: 2.8,
    memMB: 471,
    nice: 0,
    state: "S",
    threads: 40,
    started: "9月11日",
    command: "python3 -m homeassistant --config /config",
    serviceId: "homeassistant",
  },
  {
    pid: 4410,
    name: "apache2",
    user: "www-data",
    cpu: 1.7,
    memMB: 92,
    nice: 0,
    state: "S",
    threads: 1,
    started: "10月2日",
    command: "apache2 -DFOREGROUND",
    serviceId: "nextcloud",
  },
  {
    pid: 3301,
    name: "Sonarr",
    user: "abc",
    cpu: 0.8,
    memMB: 196,
    nice: 0,
    state: "S",
    threads: 26,
    started: "9月28日",
    command: "/app/sonarr/bin/Sonarr -nobrowser -data=/config",
    serviceId: "sonarr",
  },
  {
    pid: 3305,
    name: "Radarr",
    user: "abc",
    cpu: 0.6,
    memMB: 181,
    nice: 0,
    state: "S",
    threads: 25,
    started: "9月28日",
    command: "/app/radarr/bin/Radarr -nobrowser -data=/config",
    serviceId: "radarr",
  },
  {
    pid: 3309,
    name: "Prowlarr",
    user: "abc",
    cpu: 0.4,
    memMB: 139,
    nice: 0,
    state: "S",
    threads: 21,
    started: "9月28日",
    command: "/app/prowlarr/bin/Prowlarr -nobrowser -data=/config",
    serviceId: "prowlarr",
  },
  {
    pid: 2471,
    name: "AdGuardHome",
    user: "root",
    cpu: 0.7,
    memMB: 91,
    nice: 0,
    state: "S",
    threads: 14,
    started: "9月11日",
    command:
      "/opt/adguardhome/AdGuardHome --no-check-update -c /opt/adguardhome/conf/AdGuardHome.yaml",
    serviceId: "adguardhome",
  },
  {
    pid: 2214,
    name: "syncthing",
    user: "nas",
    cpu: 0.6,
    memMB: 74,
    nice: 5,
    state: "S",
    threads: 15,
    started: "9月11日",
    command:
      "/usr/bin/syncthing serve --no-browser --gui-address=127.0.0.1:8384",
    serviceId: "syncthing",
  },
  {
    pid: 3412,
    name: "node",
    user: "root",
    cpu: 0,
    memMB: 108,
    nice: 0,
    state: "D",
    threads: 11,
    started: "9月28日",
    command: "node server/server.js",
    serviceId: "uptime-kuma",
  },
  {
    pid: 1187,
    name: "nginx",
    user: "root",
    cpu: 0.4,
    memMB: 64,
    nice: 0,
    state: "S",
    threads: 1,
    started: "9月11日",
    command: "nginx: master process /usr/sbin/nginx -c /etc/ugos/nginx.conf",
    serviceId: "ugos-web",
  },
  {
    pid: 1033,
    name: "tailscaled",
    user: "root",
    cpu: 0.3,
    memMB: 46,
    nice: 0,
    state: "S",
    threads: 12,
    started: "9月11日",
    command: "/usr/sbin/tailscaled --state=/var/lib/tailscale/tailscaled.state",
    serviceId: "tailscaled",
  },
  {
    pid: 4102,
    name: "docker-mm",
    user: "root",
    cpu: 0.9,
    memMB: 41,
    nice: 0,
    state: "S",
    threads: 10,
    started: "9月11日",
    command: "/app/docker-mm serve --addr :9420",
    serviceId: "docker-mm",
  },
  {
    pid: 1134,
    name: "containerd",
    user: "root",
    cpu: 0.5,
    memMB: 49,
    nice: 0,
    state: "S",
    threads: 16,
    started: "9月11日",
    command: "/usr/bin/containerd",
  },
  {
    pid: 988,
    name: "sshd",
    user: "root",
    cpu: 0,
    memMB: 7,
    nice: 0,
    state: "S",
    threads: 1,
    started: "9月11日",
    command: "sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups",
    serviceId: "sshd",
  },
  {
    pid: 412,
    name: "systemd-journald",
    user: "root",
    cpu: 0.1,
    memMB: 38,
    nice: 0,
    state: "S",
    threads: 1,
    started: "9月11日",
    command: "/lib/systemd/systemd-journald",
  },
  {
    pid: 1,
    name: "systemd",
    user: "root",
    cpu: 0.1,
    memMB: 12,
    nice: 0,
    state: "S",
    threads: 1,
    started: "9月11日",
    command: "/sbin/init",
  },
  {
    pid: 5521,
    name: "btrfs-transacti",
    user: "root",
    cpu: 0.2,
    memMB: 0,
    nice: 0,
    state: "D",
    threads: 1,
    started: "9月11日",
    command: "[btrfs-transaction]",
  },
  {
    pid: 6014,
    name: "rsync",
    user: "nas",
    cpu: 6.2,
    memMB: 23,
    nice: 10,
    state: "R",
    threads: 1,
    started: "14:02",
    command: "rsync -a --delete /volume1/photos/ /mnt/usb-backup/photos/",
  },
  {
    pid: 7731,
    name: "defunct-hook",
    user: "nas",
    cpu: 0,
    memMB: 0,
    nice: 0,
    state: "Z",
    threads: 1,
    started: "13:47",
    command: "[backup-hook.sh] <defunct>",
  },
]

/* ---------- images / networks / volumes ---------- */

export interface ImageRow {
  repo: string
  tag: string
  id: string
  sizeMB: number
  created: string
  usedBy: string[]
  update?: string
}

export const images: ImageRow[] = [
  {
    repo: "ghcr.io/immich-app/immich-machine-learning",
    tag: "v1.122.3",
    id: "a81f02c4e3d1",
    sizeMB: 1740,
    created: "5 周前",
    usedBy: ["immich-ml"],
  },
  {
    repo: "ghcr.io/immich-app/immich-server",
    tag: "v1.122.3",
    id: "3c9be7a10f55",
    sizeMB: 1310,
    created: "5 周前",
    usedBy: ["immich-server"],
  },
  {
    repo: "ghcr.io/home-assistant/home-assistant",
    tag: "2024.12.4",
    id: "e04d6b2a91c7",
    sizeMB: 1820,
    created: "3 周前",
    usedBy: ["homeassistant"],
  },
  {
    repo: "lscr.io/linuxserver/jellyfin",
    tag: "10.10.3",
    id: "77ad3e5c02b8",
    sizeMB: 812,
    created: "6 周前",
    usedBy: ["jellyfin"],
    update: "10.10.5",
  },
  {
    repo: "nextcloud",
    tag: "30.0.4-apache",
    id: "5be3f0d21c6a",
    sizeMB: 1240,
    created: "2 周前",
    usedBy: ["nextcloud"],
  },
  {
    repo: "docker.io/tensorchord/pgvecto-rs",
    tag: "pg14-v0.2.0",
    id: "c6620a7e4f13",
    sizeMB: 438,
    created: "11 个月前",
    usedBy: ["immich-postgres"],
  },
  {
    repo: "mariadb",
    tag: "11.4",
    id: "9d14c88e0b2f",
    sizeMB: 407,
    created: "4 周前",
    usedBy: ["nextcloud-db"],
  },
  {
    repo: "jc21/nginx-proxy-manager",
    tag: "2.12.1",
    id: "0f2c9b5d7e44",
    sizeMB: 1090,
    created: "2 个月前",
    usedBy: ["npm"],
  },
  {
    repo: "lscr.io/linuxserver/qbittorrent",
    tag: "5.0.2",
    id: "6a3e1f9c8d20",
    sizeMB: 196,
    created: "6 周前",
    usedBy: ["qbittorrent"],
  },
  {
    repo: "lscr.io/linuxserver/sonarr",
    tag: "4.0.11",
    id: "b19d4e07a6c3",
    sizeMB: 205,
    created: "6 周前",
    usedBy: ["sonarr"],
  },
  {
    repo: "lscr.io/linuxserver/radarr",
    tag: "5.16.3",
    id: "4e8a2c61f0b9",
    sizeMB: 211,
    created: "6 周前",
    usedBy: ["radarr"],
    update: "5.17.2",
  },
  {
    repo: "lscr.io/linuxserver/prowlarr",
    tag: "1.28.2",
    id: "d02b7f3a5e18",
    sizeMB: 178,
    created: "6 周前",
    usedBy: ["prowlarr"],
  },
  {
    repo: "louislam/uptime-kuma",
    tag: "1.23.16",
    id: "1c5f8e2d9a07",
    sizeMB: 433,
    created: "3 个月前",
    usedBy: ["uptime-kuma"],
  },
  {
    repo: "vaultwarden/server",
    tag: "1.32.5",
    id: "8b4d0e6f1a29",
    sizeMB: 247,
    created: "7 周前",
    usedBy: ["vaultwarden"],
  },
  {
    repo: "adguard/adguardhome",
    tag: "v0.107.55",
    id: "f3a19c0d6b72",
    sizeMB: 73,
    created: "8 周前",
    usedBy: ["adguardhome"],
  },
  {
    repo: "filebrowser/filebrowser",
    tag: "v2.31.2",
    id: "2e7c4b8a0f16",
    sizeMB: 32,
    created: "3 个月前",
    usedBy: ["filebrowser"],
  },
  {
    repo: "docker.io/valkey/valkey",
    tag: "8-bookworm",
    id: "7d0a3f5c9e21",
    sizeMB: 118,
    created: "2 个月前",
    usedBy: ["immich-redis"],
  },
  {
    repo: "ghcr.io/local/docker-mm",
    tag: "0.1.0",
    id: "aa41e9c37b05",
    sizeMB: 29,
    created: "23 天前",
    usedBy: ["docker-mm"],
  },
  {
    repo: "lscr.io/linuxserver/jellyfin",
    tag: "10.9.11",
    id: "54cf0b81d3e6",
    sizeMB: 798,
    created: "4 个月前",
    usedBy: [],
  },
  {
    repo: "ghcr.io/immich-app/immich-server",
    tag: "v1.119.1",
    id: "be2390fa7c41",
    sizeMB: 1290,
    created: "3 个月前",
    usedBy: [],
  },
  {
    repo: "<none>",
    tag: "<none>",
    id: "09e7d2c5a8b3",
    sizeMB: 486,
    created: "2 个月前",
    usedBy: [],
  },
]

export interface NetworkRow {
  name: string
  driver: "bridge" | "host" | "null" | "macvlan"
  subnet?: string
  gateway?: string
  scope: "local"
  members: string[]
  internal?: boolean
}

export const networks: NetworkRow[] = [
  {
    name: "bridge",
    driver: "bridge",
    subnet: "172.17.0.0/16",
    gateway: "172.17.0.1",
    scope: "local",
    members: [
      "jellyfin",
      "qbittorrent",
      "filebrowser",
      "adguardhome",
      "uptime-kuma",
    ],
  },
  {
    name: "host",
    driver: "host",
    scope: "local",
    members: ["homeassistant", "docker-mm"],
  },
  {
    name: "immich_default",
    driver: "bridge",
    subnet: "172.20.0.0/16",
    gateway: "172.20.0.1",
    scope: "local",
    members: ["immich-server", "immich-ml", "immich-postgres", "immich-redis"],
  },
  {
    name: "arr_default",
    driver: "bridge",
    subnet: "172.21.0.0/16",
    gateway: "172.21.0.1",
    scope: "local",
    members: ["sonarr", "radarr", "prowlarr"],
  },
  {
    name: "nextcloud_default",
    driver: "bridge",
    subnet: "172.22.0.0/16",
    gateway: "172.22.0.1",
    scope: "local",
    members: ["nextcloud", "nextcloud-db"],
  },
  {
    name: "proxy",
    driver: "bridge",
    subnet: "172.30.0.0/24",
    gateway: "172.30.0.1",
    scope: "local",
    members: ["npm", "vaultwarden"],
  },
  {
    name: "iot_macvlan",
    driver: "macvlan",
    subnet: "192.168.31.0/24",
    gateway: "192.168.31.1",
    scope: "local",
    members: [],
  },
  { name: "none", driver: "null", scope: "local", members: [] },
]

export interface VolumeRow {
  name: string
  driver: "local"
  sizeMB: number
  mountpoint: string
  usedBy: string[]
  created: string
}

export const volumes: VolumeRow[] = [
  {
    name: "immich_pgdata",
    driver: "local",
    sizeMB: 2310,
    mountpoint: "/var/lib/docker/volumes/immich_pgdata/_data",
    usedBy: ["immich-postgres"],
    created: "9 个月前",
  },
  {
    name: "immich_model-cache",
    driver: "local",
    sizeMB: 1780,
    mountpoint: "/var/lib/docker/volumes/immich_model-cache/_data",
    usedBy: ["immich-ml"],
    created: "9 个月前",
  },
  {
    name: "nextcloud_html",
    driver: "local",
    sizeMB: 912,
    mountpoint: "/var/lib/docker/volumes/nextcloud_html/_data",
    usedBy: ["nextcloud"],
    created: "5 个月前",
  },
  {
    name: "nextcloud_db",
    driver: "local",
    sizeMB: 403,
    mountpoint: "/var/lib/docker/volumes/nextcloud_db/_data",
    usedBy: ["nextcloud-db"],
    created: "5 个月前",
  },
  {
    name: "npm_data",
    driver: "local",
    sizeMB: 27,
    mountpoint: "/var/lib/docker/volumes/npm_data/_data",
    usedBy: ["npm"],
    created: "7 个月前",
  },
  {
    name: "portainer_data",
    driver: "local",
    sizeMB: 6,
    mountpoint: "/var/lib/docker/volumes/portainer_data/_data",
    usedBy: [],
    created: "1 年前",
  },
  {
    name: "8f3e1a0c9b7d2e4f",
    driver: "local",
    sizeMB: 0.2,
    mountpoint: "/var/lib/docker/volumes/8f3e1a0c9b7d2e4f/_data",
    usedBy: [],
    created: "2 个月前",
  },
]

/* ---------- time series ---------- */

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function series(
  seed: number,
  points: number,
  base: number,
  jitter: number,
  min = 0,
  max = 100
) {
  const r = rng(seed)
  let v = base
  const now = new Date(2026, 9, 4, 14, 30)
  return Array.from({ length: points }, (_, i) => {
    v += (r() - 0.5) * jitter
    v += (base - v) * 0.12
    v = Math.max(min, Math.min(max, v))
    const t = new Date(now.getTime() - (points - 1 - i) * 60_000)
    return {
      t: `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`,
      v: Math.round(v * 10) / 10,
    }
  })
}

export function zip<K extends string>(
  keys: K[],
  arrays: { t: string; v: number }[][]
): ({ t: string } & Record<K, number>)[] {
  return arrays[0].map((p, i) => {
    const row = { t: p.t } as { t: string } & Record<K, number>
    keys.forEach((k, j) => {
      ;(row as Record<string, number | string>)[k] = arrays[j][i].v
    })
    return row
  })
}

export function logsFor(
  s: Service
): { ts: string; level: "info" | "warn" | "error"; msg: string }[] {
  if (s.id === "nextcloud-db")
    return [
      {
        ts: "14:29:51",
        level: "info",
        msg: "Starting MariaDB 11.4.4 source revision 3b1ba5a",
      },
      { ts: "14:29:51", level: "info", msg: "InnoDB: Using liburing" },
      {
        ts: "14:29:52",
        level: "error",
        msg: "InnoDB: Unable to lock ./ibdata1 error: 11",
      },
      {
        ts: "14:29:52",
        level: "error",
        msg: "InnoDB: Check that you do not already have another mariadbd process using the same InnoDB data or log files.",
      },
      {
        ts: "14:29:53",
        level: "error",
        msg: "Plugin 'InnoDB' registration as a STORAGE ENGINE failed.",
      },
      { ts: "14:29:53", level: "error", msg: "Aborting" },
    ]
  if (s.status === "exited")
    return [
      { ts: "12:31:07", level: "info", msg: `Creating container ${s.name}` },
      {
        ts: "12:31:08",
        level: "error",
        msg: s.lastError ?? "exited with code 1",
      },
    ]
  return [
    {
      ts: "14:12:03",
      level: "info",
      msg: "[INF] [12] MediaBrowser.Controller.MediaEncoding.TranscodeManager: ffmpeg -hwaccel qsv -init_hw_device vaapi=va:/dev/dri/renderD128",
    },
    {
      ts: "14:12:03",
      level: "info",
      msg: "[INF] [12] Jellyfin.Api.Helpers.MediaInfoHelper: User policy for Lin Yuhang. EnablePlaybackRemuxing: True EnableVideoPlaybackTranscoding: True",
    },
    {
      ts: "14:15:40",
      level: "info",
      msg: "[INF] [44] Emby.Server.Implementations.ScheduledTasks.TaskManager: Extract Chapter Images Completed after 3 minute(s)",
    },
    {
      ts: "14:18:22",
      level: "warn",
      msg: "[WRN] [31] MediaBrowser.Providers.TV.SeriesMetadataService: Unable to find episode 7 in TMDB for series 'Shōgun'",
    },
    {
      ts: "14:21:09",
      level: "info",
      msg: "[INF] [8] Emby.Server.Implementations.Session.SessionManager: Playback start reported by app Jellyfin Android 2.6.2 playing Dune: Part Two",
    },
    {
      ts: "14:24:47",
      level: "error",
      msg: "[ERR] [27] Jellyfin.LiveTv.Guide.GuideManager: Error getting programs for channel CCTV-1: HttpRequestException (Connection refused)",
    },
    {
      ts: "14:26:15",
      level: "info",
      msg: "[INF] [12] Jellyfin.Api.Controllers.DynamicHlsController: Current HLS implementation doesn't support non-keyframe breaks",
    },
    {
      ts: "14:28:30",
      level: "info",
      msg: "[INF] [19] Emby.Server.Implementations.Library.LibraryManager: Validating media library",
    },
    {
      ts: "14:29:58",
      level: "info",
      msg: "[INF] [19] Emby.Server.Implementations.Library.LibraryManager: Library scan of 电影 finished, 3 new items",
    },
  ]
}
