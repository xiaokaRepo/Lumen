import type { PortBinding, Proto, Service } from "@/mock/data"

export interface PortRow {
  port: number
  proto: Proto
  ip: string
  serviceId: string
  containerPort?: number
  bound: boolean
  proxy?: boolean
}

export function allPorts(services: Service[]): PortRow[] {
  const rows: PortRow[] = []
  for (const s of services) {
    const bound =
      (s.status === "running" || s.status === "paused") && !s.sleeping
    for (const p of s.ports) {
      rows.push(rowFrom(s.id, p, bound, !!p.proxy))
    }
  }
  return rows.sort((a, b) => a.port - b.port || a.proto.localeCompare(b.proto))
}

function rowFrom(
  serviceId: string,
  p: PortBinding,
  bound: boolean,
  proxy: boolean
): PortRow {
  return {
    port: p.host,
    proto: p.proto,
    ip: p.ip ?? "0.0.0.0",
    serviceId,
    containerPort: p.container,
    bound,
    proxy,
  }
}

export function portConflicts(services: Service[]) {
  const map = new Map<string, PortRow[]>()
  for (const r of allPorts(services)) {
    const k = `${r.port}/${r.proto}`
    map.set(k, [...(map.get(k) ?? []), r])
  }
  return [...map.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, rows]) => ({ key, rows }))
}

export function groupNames(
  services: { group: string }[],
  base: readonly string[]
) {
  const extra: string[] = []
  for (const s of services) {
    if (s.group && !base.includes(s.group) && !extra.includes(s.group)) {
      extra.push(s.group)
    }
  }
  return [...base, ...extra]
}
