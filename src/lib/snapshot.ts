import type { Service } from "@/mock/data"

/** JSON null and a missing field both become an empty list. */
export function asList<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

export function normalizeService(raw: Service): Service {
  return {
    ...raw,
    ports: asList(raw.ports),
    networks: asList(raw.networks),
    env: asList(raw.env),
    mounts: asList(raw.mounts),
  }
}

export function normalizeServices(
  raw: Service[] | null | undefined
): Service[] {
  return asList(raw).map(normalizeService)
}

const FULL_ID = /^[0-9a-f]{64}$/

/** An inspect that failed used to publish the container id as the whole row. */
export function isInspectStub(s: Service) {
  return (
    FULL_ID.test(s.id) &&
    (!s.name || s.name === s.id) &&
    !s.image &&
    !s.unit
  )
}

export function reconcileServices(prev: Service[], next: Service[]) {
  return next.map((s) => {
    if (!isInspectStub(s)) return s
    const old = prev.find(
      (p) =>
        !isInspectStub(p) &&
        (p.containerId === s.id ||
          p.id === s.id ||
          (s.containerId != null && p.containerId === s.containerId))
    )
    return old ?? s
  })
}
