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
