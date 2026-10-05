import type { IconRef } from "@/lib/icons"
import type { Service } from "@/mock/data"

export interface HostDisk {
  mount: string
  label: string
  fs: string
  totalGB: number
  usedGB: number
}

export interface HostInfo {
  name: string
  model: string
  os: string
  base: string
  kernel: string
  cpu: string
  cores: string
  cpuMaxGHz: number
  cpuTempC: number
  cpuPercent: number
  load: number[]
  memTotalGB: number
  memUsedGB: number
  memCacheGB: number
  swapUsedGB: number
  swapTotalGB: number
  uptime: string
  netIface: string
  netRxMBs: number
  netTxMBs: number
  disks: HostDisk[]
  ip: string
}

export interface LogLine {
  ts: string
  level: "info" | "warn" | "error"
  msg: string
}

export interface ServiceMetaBody {
  displayName?: string
  group?: string
  webUrl?: string
  description?: string
  iconOverride?: IconRef
  hideOnHome?: boolean
  idleSleep?: boolean
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`)
  }
  return data
}

export const api = {
  session: async () =>
    parse<{ setupRequired: boolean; authed: boolean; host: HostInfo }>(
      await fetch("/api/session", { credentials: "include" })
    ),
  setup: async (password: string) =>
    parse<{ ok: boolean }>(
      await fetch("/api/setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
    ),
  login: async (password: string, remember: boolean) =>
    parse<{ ok: boolean }>(
      await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, remember }),
      })
    ),
  logout: async () =>
    parse<{ ok: boolean }>(
      await fetch("/api/logout", { method: "POST", credentials: "include" })
    ),
  snapshot: async () =>
    parse<{
      host: HostInfo
      services: Service[]
      dockerError: string
      systemdNote?: string
      homeOrder?: string[]
      cardFields?: CardFields
    }>(await fetch("/api/snapshot", { credentials: "include" })),
  logs: async (id: string) =>
    parse<{ lines: LogLine[] }>(
      await fetch(`/api/services/${encodeURIComponent(id)}/logs`, {
        credentials: "include",
      })
    ),
  action: async (id: string, action: string, removeVolumes = false) =>
    parse<{ ok: boolean }>(
      await fetch(`/api/services/${encodeURIComponent(id)}/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, removeVolumes }),
      })
    ),
  saveMeta: async (id: string, body: ServiceMetaBody) =>
    parse<{ ok: boolean }>(
      await fetch(`/api/services/${encodeURIComponent(id)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ),
  processes: async () =>
    parse<{ processes: Proc[] }>(
      await fetch("/api/processes", { credentials: "include" })
    ),
  signal: async (pid: number, signal: string) =>
    parse<{ ok: boolean }>(
      await fetch(`/api/processes/${pid}/signal`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal }),
      })
    ),
  renice: async (pid: number, nice: number) =>
    parse<{ ok: boolean }>(
      await fetch(`/api/processes/${pid}/nice`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nice }),
      })
    ),
  metrics: async (id: string, range: string) =>
    parse<MetricSeries>(
      await fetch(
        `/api/metrics?id=${encodeURIComponent(id)}&range=${encodeURIComponent(range)}`,
        { credentials: "include" }
      )
    ),
  images: async () =>
    parse<{ images: ImageRow[] }>(
      await fetch("/api/images", { credentials: "include" })
    ),
  deleteImage: async (id: string) =>
    parse<{ ok: boolean }>(
      await fetch(`/api/images/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      })
    ),
  pullImage: async (ref: string) =>
    parse<{ ok: boolean }>(
      await fetch("/api/images/pull", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref }),
      })
    ),
  pruneImages: async () =>
    parse<{ removed: number }>(
      await fetch("/api/images/prune", {
        method: "POST",
        credentials: "include",
      })
    ),
  networks: async () =>
    parse<{ networks: NetworkRow[] }>(
      await fetch("/api/networks", { credentials: "include" })
    ),
  createNetwork: async (name: string, driver: string, subnet: string) =>
    parse<{ ok: boolean }>(
      await fetch("/api/networks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, driver, subnet }),
      })
    ),
  deleteNetwork: async (id: string) =>
    parse<{ ok: boolean }>(
      await fetch(`/api/networks/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      })
    ),
  volumes: async () =>
    parse<{ volumes: VolumeRow[] }>(
      await fetch("/api/volumes", { credentials: "include" })
    ),
  deleteVolume: async (id: string) =>
    parse<{ ok: boolean }>(
      await fetch(`/api/volumes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      })
    ),
  pruneVolumes: async () =>
    parse<{ removed: number }>(
      await fetch("/api/volumes/prune", {
        method: "POST",
        credentials: "include",
      })
    ),
  stack: async (id: string, action: string) =>
    parse<{ ok: boolean }>(
      await fetch(`/api/stacks/${encodeURIComponent(id)}/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
    ),
  alerts: async () =>
    parse<{
      channels: Channel[]
      rules: AlertRule[]
      history: AlertEvent[]
    }>(await fetch("/api/alerts", { credentials: "include" })),
  saveChannel: async (
    body: Partial<Channel> & { type: Channel["type"]; name: string }
  ) =>
    parse<Channel>(
      await fetch("/api/channels", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ),
  testChannel: async (id: string) =>
    parse<{ ok: boolean }>(
      await fetch(`/api/channels/${encodeURIComponent(id)}/test`, {
        method: "POST",
        credentials: "include",
      })
    ),
  saveRule: async (
    body: Partial<AlertRule> & { kind: AlertRule["kind"]; name: string }
  ) =>
    parse<AlertRule>(
      await fetch("/api/rules", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ),
  updates: async () =>
    parse<{ updates: UpdateRow[]; checkedAt: string; error: string }>(
      await fetch("/api/updates", { credentials: "include" })
    ),
  checkUpdates: async () =>
    parse<{ updates: UpdateRow[]; checkedAt: string; error: string }>(
      await fetch("/api/updates/check", {
        method: "POST",
        credentials: "include",
      })
    ),
  saveHome: async (ids: string[]) =>
    parse<{ ok: boolean }>(
      await fetch("/api/home", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
    ),
  saveCardFields: async (cardFields: CardFields) =>
    parse<{ ok: boolean; cardFields: CardFields }>(
      await fetch("/api/home", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardFields }),
      })
    ),
}

export interface CardFields {
  status: boolean
  usage: boolean
  uptime: boolean
  update: boolean
}

export const DEFAULT_CARD_FIELDS: CardFields = {
  status: true,
  usage: true,
  uptime: true,
  update: true,
}

export interface Channel {
  id: string
  type: "bark" | "telegram" | "wecom"
  name: string
  enabled: boolean
  config: Record<string, string>
  lastTest?: { ok: boolean; at: string; msg?: string }
}

export interface AlertRule {
  id: string
  kind:
    | "service_down"
    | "cpu_high"
    | "mem_high"
    | "disk_full"
    | "update_available"
    | "unhealthy"
  name: string
  enabled: boolean
  target: string
  threshold?: number
  duration?: string
  channels: string[]
  cooldown: string
  resolve?: boolean
}

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
  protected?: boolean
}

export interface MetricPoint {
  t: string
  v: number
}

export interface MetricSeries {
  cpu: MetricPoint[]
  mem: MetricPoint[]
  rx: MetricPoint[]
  tx: MetricPoint[]
  rd: MetricPoint[]
  wr: MetricPoint[]
}

export interface ImageRow {
  repo: string
  tag: string
  id: string
  sizeMB: number
  created: string
  usedBy: string[]
  update?: string
}

export interface NetworkRow {
  name: string
  driver: string
  subnet?: string
  gateway?: string
  scope: string
  members: string[]
  internal?: boolean
}

export interface VolumeRow {
  name: string
  driver: string
  sizeMB: number
  mountpoint: string
  usedBy: string[]
  created: string
}

export const EMPTY_HOST: HostInfo = {
  name: "",
  model: "",
  os: "",
  base: "",
  kernel: "",
  cpu: "",
  cores: "",
  cpuMaxGHz: 0,
  cpuTempC: 0,
  cpuPercent: 0,
  load: [0, 0, 0],
  memTotalGB: 0,
  memUsedGB: 0,
  memCacheGB: 0,
  swapUsedGB: 0,
  swapTotalGB: 0,
  uptime: "",
  netIface: "",
  netRxMBs: 0,
  netTxMBs: 0,
  disks: [],
  ip: "",
}
