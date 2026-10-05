export interface OpenHost {
  ip?: string
  name?: string
}

let cached: OpenHost = {}

export function rememberOpenHost(host: OpenHost | undefined) {
  cached = host ?? {}
}

export function badOpenHost(host: string) {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "")
  if (
    h === "" ||
    h === "localhost" ||
    h === "0.0.0.0" ||
    h === "::" ||
    h === "::1"
  ) {
    return true
  }
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!v4) return false
  const oct = v4.slice(1).map((n) => Number(n))
  if (oct.some((n) => n > 255)) return true
  if (oct[0] === 127 || oct[0] === 0) return true
  if (oct[0] === 169 && oct[1] === 254) return true
  if (oct[0] === 172 && oct[1] >= 16 && oct[1] <= 31) return true
  return false
}

export function currentOpenHost() {
  if (cached.ip && !badOpenHost(cached.ip)) return cached.ip
  const loc = typeof window !== "undefined" ? window.location.hostname : ""
  if (
    loc &&
    !badOpenHost(loc) &&
    loc !== "localhost" &&
    loc !== "127.0.0.1"
  ) {
    return loc
  }
  const name = cached.name?.trim() ?? ""
  if (name && name !== "主机" && !badOpenHost(name)) return name
  return loc || "localhost"
}

export function rewriteOpen(raw: string, open: string) {
  if (!raw || !open || badOpenHost(open)) return raw
  try {
    const u = new URL(raw)
    if (!badOpenHost(u.hostname)) return raw
    const port = u.port
    u.hostname = open
    if (port) u.port = port
    if ((u.pathname === "/" || u.pathname === "") && !raw.endsWith("/")) {
      return `${u.protocol}//${u.host}${u.search}${u.hash}`
    }
    return u.toString()
  } catch {
    return raw
  }
}

export function serviceOpenURL(
  s: { webUrl?: string; remoteUrl?: string },
  onLan: boolean
) {
  const raw = !onLan && s.remoteUrl ? s.remoteUrl : s.webUrl
  if (!raw) return undefined
  return rewriteOpen(raw, currentOpenHost())
}
