import { IconExternalLink } from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import {
  HOST_IP,
  type PortBinding,
  type Service,
  type ServiceStatus,
} from "@/mock/data"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const STATUS: Record<
  ServiceStatus,
  { label: string; dot: string; text: string }
> = {
  running: { label: "运行中", dot: "bg-success", text: "text-foreground" },
  paused: {
    label: "已暂停",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
  },
  exited: {
    label: "已停止",
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
  },
  restarting: {
    label: "重启中",
    dot: "bg-destructive",
    text: "text-destructive",
  },
}

/** The dot carries real container state, the only place dots are used. */
export function StatusLabel({
  s,
  className,
}: {
  s: Pick<Service, "status" | "health" | "exitCode">
  className?: string
}) {
  const st = STATUS[s.status]
  const unhealthy = s.health === "unhealthy"
  const error =
    unhealthy ||
    s.status === "restarting" ||
    (s.status === "exited" && s.exitCode !== undefined && s.exitCode !== 0)
  const breathe = s.status === "running" && !unhealthy
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-sm whitespace-nowrap transition-colors duration-200 ease-out",
        st.text,
        unhealthy && "text-destructive",
        className
      )}
    >
      <span
        key={error ? "error" : breathe ? "running" : s.status}
        className={cn(
          "size-1.5 rounded-full transition-colors duration-200 ease-out",
          st.dot,
          unhealthy && "bg-destructive",
          breathe && "lumen-breathe",
          error && "lumen-pulse-once"
        )}
        aria-hidden
      />
      {unhealthy ? "运行中 (不健康)" : st.label}
      {s.status === "exited" && s.exitCode !== undefined && (
        <span className="tabular text-xs text-muted-foreground">
          退出码 {s.exitCode}
        </span>
      )}
    </span>
  )
}

export function portHref(p: PortBinding) {
  const ip = p.ip && p.ip !== "0.0.0.0" ? p.ip : HOST_IP
  const scheme =
    p.host === 443 || p.host === 9443 || p.host === 8443 ? "https" : "http"
  return `${scheme}://${ip}:${p.host}`
}

export function PortChip({
  p,
  conflict,
}: {
  p: PortBinding
  conflict?: boolean
}) {
  const label = (
    <>
      <span className="tabular">{p.host}</span>
      {p.container !== undefined && p.container !== p.host && (
        <span className="tabular text-muted-foreground">:{p.container}</span>
      )}
      {p.proto === "udp" && (
        <span className="text-[10px] text-muted-foreground uppercase">udp</span>
      )}
    </>
  )
  const cls = cn(
    "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs transition-colors",
    conflict ? "border-destructive/40 text-destructive" : "border-border"
  )
  if (p.proto === "udp" || !p.web) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cls}>{label}</span>
        </TooltipTrigger>
        <TooltipContent>
          {p.container !== undefined
            ? `主机 ${p.host} 映射到容器 ${p.container}/${p.proto}`
            : `主机监听 ${p.host}/${p.proto}`}
          {conflict && "，端口冲突"}
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <a
      href={portHref(p)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(cls, "hover:border-foreground/30 hover:bg-muted")}
    >
      {label}
      <IconExternalLink className="size-3 text-muted-foreground" />
    </a>
  )
}
