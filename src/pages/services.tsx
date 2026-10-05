import * as React from "react"
import { motion, useReducedMotion } from "motion/react"
import { useNavigate } from "react-router-dom"
import {
  IconCloudDownload,
  IconRefresh,
  IconSearch,
  IconStack2,
} from "@tabler/icons-react"

import { enterDelay, useEnterOnce } from "@/components/enter"
import { NumberRoll } from "@/components/number-roll"
import {
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useViewState,
} from "@/components/page-states"
import { ServiceActionsMenu } from "@/components/service-actions"
import { ServiceIcon } from "@/components/service-icon"
import { PortChip, StatusLabel } from "@/components/status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { KIND_LABEL } from "@/lib/format"
import { useStore } from "@/lib/store"
import { GROUPS, portConflicts, type Service } from "@/mock/data"
import { updateFor } from "@/mock/alerts"

export function UpdateBadge({ id }: { id: string }) {
  const u = updateFor(id)
  if (!u) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="gap-1 border-success/40 text-success"
        >
          <IconCloudDownload />
          可更新
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {u.current} 有新版本 {u.latest}
        {u.pinned ? "，已固定版本，不自动更新" : ""}
      </TooltipContent>
    </Tooltip>
  )
}

export function ServicesPage() {
  const state = useViewState()
  const nav = useNavigate()
  const { services } = useStore()
  const enter = useEnterOnce("services")
  const reduce = useReducedMotion()
  const [q, setQ] = React.useState("")
  const [kind, setKind] = React.useState("all")
  const [status, setStatus] = React.useState("all")
  const [groupBy, setGroupBy] = React.useState<"group" | "stack">("group")

  const conflictPorts = new Set(
    portConflicts().flatMap((c) =>
      c.rows.map((r) => `${r.serviceId}:${r.port}/${r.proto}`)
    )
  )

  const filtered = services.filter((s) => {
    if (kind !== "all" && s.kind !== kind) return false
    if (
      status !== "all" &&
      (status === "running" ? s.status !== "running" : s.status === "running")
    )
      return false
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return [
      s.displayName,
      s.name,
      s.image,
      s.unit,
      s.stack,
      ...s.ports.map((p) => String(p.host)),
    ].some((v) => v?.toLowerCase().includes(needle))
  })

  const groups: [string, Service[]][] =
    groupBy === "group"
      ? GROUPS.map(
          (g) =>
            [g, filtered.filter((s) => s.group === g)] as [string, Service[]]
        ).filter(([, l]) => l.length)
      : [
          ...[
            ...new Set(filtered.filter((s) => s.stack).map((s) => s.stack!)),
          ].map(
            (st) =>
              [`${st}`, filtered.filter((s) => s.stack === st)] as [
                string,
                Service[],
              ]
          ),
          [
            "独立容器",
            filtered.filter((s) => !s.stack && s.kind === "container"),
          ] as [string, Service[]],
          [
            "主机服务与进程",
            filtered.filter(
              (s) => s.kind === "systemd" || s.kind === "process"
            ),
          ] as [string, Service[]],
        ].filter(([, l]) => l.length)

  const rowIndex = new Map<string, number>()
  {
    let n = 0
    for (const [, list] of groups) {
      for (const s of list) rowIndex.set(s.id, n++)
    }
  }

  const counts = {
    all: services.length,
    container: services.filter((s) => s.kind === "container").length,
    compose: services.filter((s) => s.kind === "compose").length,
    systemd: services.filter((s) => s.kind === "systemd").length,
    process: services.filter((s) => s.kind === "process").length,
  }

  return (
    <>
      <PageHeader
        title="服务"
        description="自动发现的 Docker 容器、Compose 栈、systemd 服务和监听端口的主机进程。"
        actions={
          <Button variant="outline">
            <IconRefresh data-icon="inline-start" />
            重新扫描
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <InputGroup className="lg:w-72">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="搜索服务"
            placeholder="名称、镜像或端口"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </InputGroup>
        <ToggleGroup
          type="single"
          variant="outline"
          value={kind}
          onValueChange={(v) => v && setKind(v)}
          className="flex-wrap"
        >
          <ToggleGroupItem value="all">
            全部{" "}
            <span className="tabular text-muted-foreground">{counts.all}</span>
          </ToggleGroupItem>
          {(["container", "compose", "systemd", "process"] as const).map(
            (k) => (
              <ToggleGroupItem key={k} value={k}>
                {KIND_LABEL[k]}{" "}
                <span className="tabular text-muted-foreground">
                  {counts[k]}
                </span>
              </ToggleGroupItem>
            )
          )}
        </ToggleGroup>
        <div className="flex gap-2 lg:ml-auto">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-32" aria-label="状态筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="running">运行中</SelectItem>
              <SelectItem value="other">未运行</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={groupBy}
            onValueChange={(v) => setGroupBy(v as "group" | "stack")}
          >
            <SelectTrigger className="w-36" aria-label="分组方式">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="group">按自定义分组</SelectItem>
              <SelectItem value="stack">按 Compose 栈</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {state === "loading" && <TableSkeleton rows={10} cols={6} />}
      {state === "error" && <ErrorState />}
      {(state === "empty" || (state === "ready" && groups.length === 0)) && (
        <EmptyState
          icon={<IconStack2 />}
          title={state === "empty" ? "还没有发现服务" : "没有匹配的服务"}
          description={
            state === "empty"
              ? "Lumen 会自动扫描容器和监听端口的进程。确认已挂载 docker.sock 并启用 pid: host。"
              : "换个关键词，或清除类型和状态筛选。"
          }
          action={
            state === "empty" ? (
              <Button variant="outline" size="sm">
                重新扫描
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQ("")
                  setKind("all")
                  setStatus("all")
                }}
              >
                清除筛选
              </Button>
            )
          }
        />
      )}

      {state === "ready" && groups.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">服务</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="hidden md:table-cell">端口</TableHead>
                <TableHead className="hidden xl:table-cell">
                  镜像 / 单元
                </TableHead>
                <TableHead className="text-right">CPU</TableHead>
                <TableHead className="text-right">内存</TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  运行时间
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(([g, list]) => (
                <React.Fragment key={g}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell
                      colSpan={8}
                      className="py-1.5 pl-4 text-xs font-medium text-muted-foreground"
                    >
                      {groupBy === "stack" && list[0]?.stack ? (
                        <span className="inline-flex items-center gap-1.5">
                          <IconStack2 className="size-3.5" />
                          {g}
                        </span>
                      ) : (
                        g
                      )}
                      <span className="tabular ml-2 font-normal">
                        {list.length}
                      </span>
                    </TableCell>
                  </TableRow>
                  {list.map((s) => {
                    const i = rowIndex.get(s.id) ?? 0
                    const play = enter && !reduce && !q
                    return (
                      <motion.tr
                        key={s.id}
                        data-slot="table-row"
                        className="cursor-pointer border-b transition-colors duration-200 ease-out hover:bg-muted/50 data-[state=selected]:bg-muted"
                        onClick={() => nav(`/services/${s.id}`)}
                        initial={play ? { opacity: 0, y: 6 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.22,
                          delay: play ? enterDelay(i) : 0,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-3">
                            <ServiceIcon
                              match={s.iconMatch}
                              override={s.iconOverride}
                              kind={s.kind}
                              layoutId={`icon-${s.id}`}
                              className="transition-transform duration-200 ease-out group-hover:scale-105"
                            />
                            <div className="flex min-w-0 flex-col">
                              <span className="flex items-center gap-2 font-medium">
                                <motion.span layoutId={`name-${s.id}`}>
                                  {s.displayName}
                                </motion.span>
                                <UpdateBadge id={s.id} />
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {KIND_LABEL[s.kind]}
                                {s.stack && groupBy === "group"
                                  ? ` / ${s.stack}`
                                  : ""}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusLabel s={s} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-nowrap gap-1">
                            {s.ports.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                无
                              </span>
                            )}
                            {s.ports.slice(0, 2).map((p) => (
                              <PortChip
                                key={`${p.host}${p.proto}`}
                                p={p}
                                conflict={conflictPorts.has(
                                  `${s.id}:${p.host}/${p.proto}`
                                )}
                              />
                            ))}
                            {s.ports.length > 2 && (
                              <span className="tabular self-center text-xs text-muted-foreground">
                                +{s.ports.length - 2}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden max-w-72 xl:table-cell">
                          <span className="tabular block truncate text-xs text-muted-foreground">
                            {s.image ?? s.unit ?? `PID ${s.pid}`}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {s.status === "running" ? (
                            <NumberRoll value={s.cpu} suffix="%" />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.memMB ? (
                            <NumberRoll
                              value={s.memMB}
                              digits={0}
                              suffix=" MB"
                            />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-right text-muted-foreground lg:table-cell">
                          {s.uptime}
                        </TableCell>
                        <TableCell
                          className="pr-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ServiceActionsMenu s={s} />
                        </TableCell>
                      </motion.tr>
                    )
                  })}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
