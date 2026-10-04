export function fmtMem(mb: number) {
  if (mb === 0) return "0"
  if (mb < 1) return `${Math.round(mb * 1024)} KB`
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${Math.round(mb)} MB`
}

export function fmtRate(kbs: number) {
  if (kbs >= 1024) return `${(kbs / 1024).toFixed(1)} MB/s`
  return `${Math.round(kbs)} KB/s`
}

export function fmtPct(v: number) {
  return `${v.toFixed(1)}%`
}

export const KIND_LABEL = {
  container: "容器",
  compose: "Compose",
  systemd: "系统服务",
  process: "进程",
} as const
