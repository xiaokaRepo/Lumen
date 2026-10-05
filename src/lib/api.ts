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
    parse<{ host: HostInfo; services: Service[]; dockerError: string }>(
      await fetch("/api/snapshot", { credentials: "include" })
    ),
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
