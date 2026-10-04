export type IconSource = "dashboard-icons" | "selfhst" | "custom"

export interface IconRef {
  source: IconSource
  slug?: string
  url?: string
}

export const ICON_CDN = {
  "dashboard-icons": "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons",
  selfhst: "https://cdn.jsdelivr.net/gh/selfhst/icons",
} as const

export const ICON_INDEX = {
  "dashboard-icons": `${ICON_CDN["dashboard-icons"]}/tree.json`,
  selfhst: `${ICON_CDN.selfhst}/index.json`,
} as const

export const SOURCE_LABEL: Record<IconSource, string> = {
  "dashboard-icons": "Dashboard Icons",
  selfhst: "selfh.st",
  custom: "自定义 URL",
}

/** Image or unit names that do not share a slug with their icon. */
const ALIASES: Record<string, string> = {
  homeassistant: "home-assistant",
  adguardhome: "adguard-home",
  "pgvecto-rs": "postgresql",
  postgres: "postgresql",
  pgvector: "postgresql",
  "vaultwarden/server": "vaultwarden",
  "immich-server": "immich",
  "immich-machine-learning": "immich",
  "qbittorrent-nox": "qbittorrent",
  smbd: "samba",
  nmbd: "samba",
  sshd: "openssh",
  ssh: "openssh",
  tailscaled: "tailscale",
  dockerd: "docker",
  "ugos-web": "ugreen",
}

/** Path segments too generic to identify a product on their own. */
const GENERIC = new Set([
  "server",
  "app",
  "web",
  "core",
  "docker",
  "official",
  "latest",
])

const SUFFIXES = ["-server", "-app", "-web", "-docker", "-nox", "-service"]

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[_.\s]+/g, "-")
    .replace(/-+/g, "-")
}

/**
 * Turns an image reference or unit name into ordered slug candidates.
 * `lscr.io/linuxserver/jellyfin:10.10` -> ["jellyfin"]
 * `ghcr.io/immich-app/immich-server:v1` -> ["immich", "immich-server"]
 * `vaultwarden/server:1.32` -> ["vaultwarden"]
 */
export function slugCandidates(ref: string): string[] {
  const noDigest = ref.split("@")[0]
  const noTag = noDigest.replace(/:[^/]+$/, "").replace(/\.service$/, "")
  const parts = noTag.split("/").filter(Boolean)
  if (parts.length > 1 && /[.:]/.test(parts[0])) parts.shift()

  const out: string[] = []
  const push = (s?: string) => {
    if (!s) return
    const n = normalize(s)
    if (n && !out.includes(n)) out.push(n)
  }

  const joined = normalize(parts.slice(-2).join("/"))
  push(ALIASES[joined])

  const last = parts.at(-1) ?? ""
  const ns = parts.at(-2)
  const lastN = normalize(last)
  push(ALIASES[lastN])

  if (GENERIC.has(lastN) && ns) {
    push(ns.replace(/-app$/, ""))
  } else {
    for (const sfx of SUFFIXES) {
      if (lastN.endsWith(sfx)) push(lastN.slice(0, -sfx.length))
    }
    push(lastN)
    push(lastN.replace(/-/g, ""))
  }
  return out
}

export function iconUrl(ref: IconRef, ext: "svg" | "png" | "webp" = "svg") {
  if (ref.source === "custom") return ref.url ?? ""
  return `${ICON_CDN[ref.source]}/${ext}/${ref.slug}.${ext}`
}

/**
 * Ordered URL chain tried by <ServiceIcon>. The backend will resolve this
 * once against cached indexes; the client chain is the offline-safe fallback.
 */
export function resolveIconChain(match: string, override?: IconRef): string[] {
  if (override) {
    if (override.source === "custom") return [override.url ?? ""]
    return [iconUrl(override, "svg"), iconUrl(override, "png")]
  }
  const urls: string[] = []
  for (const slug of slugCandidates(match)) {
    urls.push(
      iconUrl({ source: "dashboard-icons", slug }, "svg"),
      iconUrl({ source: "dashboard-icons", slug }, "png"),
      iconUrl({ source: "selfhst", slug }, "svg"),
      iconUrl({ source: "selfhst", slug }, "png")
    )
  }
  return urls
}

export function sourceOfUrl(url: string): IconSource {
  if (url.startsWith(ICON_CDN["dashboard-icons"])) return "dashboard-icons"
  if (url.startsWith(ICON_CDN.selfhst)) return "selfhst"
  return "custom"
}

export function slugOfUrl(url: string) {
  return (
    url
      .split("/")
      .at(-1)
      ?.replace(/\.(svg|png|webp)$/, "") ?? ""
  )
}
