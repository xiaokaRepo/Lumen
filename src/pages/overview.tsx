import * as React from "react"
import { Link } from "react-router-dom"
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconChevronRight,
  IconPlugConnectedX,
  IconRotateClockwise,
} from "@tabler/icons-react"

import { motion } from "motion/react"

import { MetricChart, Sparkline } from "@/components/metric-chart"
import { NumberRoll } from "@/components/number-roll"
import { ErrorState, PageHeader, useViewState } from "@/components/page-states"
import { ServiceIcon } from "@/components/service-icon"
import { StatusLabel } from "@/components/status"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { KIND_LABEL } from "@/lib/format"
import { portConflicts } from "@/lib/ports"
import { useStore } from "@/lib/store"
import { zip } from "@/mock/data"

function Metric({
  label,
  value,
  sub,
  spark,
}: {
  label: string
  value: React.ReactNode
  sub: React.ReactNode
  spark: { v: number }[]
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
      <span className="truncate text-xs text-muted-foreground">{sub}</span>
      <Sparkline data={spark} className="mt-1" />
    </div>
  )
}

export function OverviewPage() {
  const preview = useViewState()
  const { services, host, series, ready, error } = useStore()
  const [range, setRange] = React.useState("cpu")
  const conflicts = portConflicts(services)
  const disk = host.disks[0]
  const state = !ready
    ? "loading"
    : preview !== "ready"
      ? preview
      : error
        ? "error"
        : "ready"

  const attention = [
    ...services
      .filter((s) => s.status === "restarting" || s.health === "unhealthy")
      .map((s) => ({
        icon: IconRotateClockwise,
        title: `${s.displayName} ${s.status === "restarting" ? "反复重启" : "健康检查失败"}`,
        sub: s.lastError ?? "连续 3 次 HTTP 503",
        to: `/services/${s.id}`,
      })),
    ...conflicts.map((c) => ({
      icon: IconPlugConnectedX,
      title: `端口 ${c.key} 冲突`,
      sub: c.rows
        .map((r) => services.find((s) => s.id === r.serviceId)?.displayName)
        .join(" 与 "),
      to: "/ports",
    })),
    ...services
      .filter((s) => s.status === "exited" && !s.sleeping)
      .map((s) => ({
        icon: IconAlertTriangle,
        title: `${s.displayName} 已停止`,
        sub:
          s.lastError ||
          (s.exitCode !== undefined ? `退出码 ${s.exitCode}` : "容器已退出"),
        to: `/services/${s.id}`,
      })),
  ]

  const top = [...services].sort((a, b) => b.cpu - a.cpu).slice(0, 7)
  const kinds = (["container", "compose", "systemd", "process"] as const).map(
    (k) => {
      const list = services.filter((s) => s.kind === k)
      return {
        k,
        total: list.length,
        running: list.filter((s) => s.status === "running").length,
      }
    }
  )
  const stacks = new Set(services.filter((s) => s.stack).map((s) => s.stack))
    .size

  if (state === "error") return <ErrorState message={error} />

  return (
    <>
      <PageHeader
        title={host.name}
        description={`${host.os} (${host.base}) 内核 ${host.kernel}，已运行 ${host.uptime}`}
      />

      {state === "loading" ? (
        <Skeleton className="h-36 rounded-xl" />
      ) : (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4 [&>*]:bg-card">
          <Metric
            label="CPU"
            value={<NumberRoll value={host.cpuPercent} suffix="%" />}
            sub={`${host.cpu} ${host.cores}，${host.cpuTempC}°C，负载 ${host.load.join(" / ")}`}
            spark={series.cpu}
          />
          <Metric
            label="内存"
            value={
              <>
                <NumberRoll value={host.memUsedGB} />
                <span className="text-base text-muted-foreground">
                  {" "}
                  / {host.memTotalGB} GB
                </span>
              </>
            }
            sub={`缓存 ${host.memCacheGB} GB，交换 ${host.swapUsedGB} / ${host.swapTotalGB} GB`}
            spark={series.mem}
          />
          <Metric
            label={`存储 ${disk.mount}`}
            value={
              disk ? (
                <>
                  <NumberRoll value={disk.usedGB} />
                  <span className="text-base text-muted-foreground">
                    {" "}
                    / {disk.totalGB} GB
                  </span>
                </>
              ) : (
                "无"
              )
            }
            sub={
              disk
                ? `${disk.label} ${disk.fs}，剩余 ${Math.round((disk.totalGB - disk.usedGB) * 10) / 10} GB`
                : "没有读到磁盘"
            }
            spark={series.disk}
          />
          <Metric
            label="网络"
            value={
              <span className="flex items-baseline gap-3">
                <span className="inline-flex items-center gap-0.5">
                  <IconArrowDown className="size-4 text-muted-foreground" />
                  <NumberRoll value={host.netRxMBs} />
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <IconArrowUp className="size-4 text-muted-foreground" />
                  <NumberRoll value={host.netTxMBs} />
                </span>
                <span className="text-base text-muted-foreground">MB/s</span>
              </span>
            }
            sub={host.netIface}
            spark={series.rx}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>主机负载 (最近 1 小时)</CardTitle>
            <CardAction>
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={range}
                onValueChange={(v) => v && setRange(v)}
              >
                <ToggleGroupItem value="cpu">CPU</ToggleGroupItem>
                <ToggleGroupItem value="mem">内存</ToggleGroupItem>
                <ToggleGroupItem value="net">网络</ToggleGroupItem>
              </ToggleGroup>
            </CardAction>
          </CardHeader>
          <CardContent>
            {range === "cpu" && (
              <MetricChart
                data={zip(["cpu"], [series.cpu])}
                config={{ cpu: { label: "CPU %", color: "var(--foreground)" } }}
                max={100}
                height={220}
              />
            )}
            {range === "mem" && (
              <MetricChart
                data={zip(["mem"], [series.mem])}
                config={{
                  mem: { label: "内存 %", color: "var(--foreground)" },
                }}
                max={100}
                height={220}
              />
            )}
            {range === "net" && (
              <MetricChart
                data={zip(["rx", "tx"], [series.rx, series.tx])}
                config={{
                  rx: { label: "下行 MB/s", color: "var(--foreground)" },
                  tx: { label: "上行 MB/s", color: "var(--success)" },
                }}
                unit="MB/s"
                height={220}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>需要处理</CardTitle>
            <CardAction>
              <span className="tabular text-sm text-muted-foreground">
                {attention.length}
              </span>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 px-2">
            {attention.map((a, i) => (
              <Link
                key={i}
                to={a.to}
                className="group flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted"
              >
                <a.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground group-first:text-destructive" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{a.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {a.sub}
                  </span>
                </span>
                <IconChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">资源占用最高</h2>
            <Link
              to="/services"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              全部服务
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-[1fr_5rem_5.5rem] gap-4 border-b px-4 py-2 text-xs text-muted-foreground md:grid-cols-[1fr_6rem_6rem_7rem_7rem]">
              <span>服务</span>
              <span className="text-right">CPU</span>
              <span className="text-right">内存</span>
              <span className="hidden text-right md:block">下行</span>
              <span className="hidden text-right md:block">上行</span>
            </div>
            {top.map((s) => (
              <Link
                key={s.id}
                to={`/services/${s.id}`}
                className="group grid grid-cols-[1fr_5rem_5.5rem] items-center gap-4 px-4 py-2.5 transition-colors duration-200 ease-out hover:bg-muted/60 md:grid-cols-[1fr_6rem_6rem_7rem_7rem]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <ServiceIcon
                    match={s.iconMatch}
                    override={s.iconOverride}
                    kind={s.kind}
                    size="sm"
                    layoutId={`icon-${s.id}`}
                    className="transition-transform duration-200 ease-out group-hover:scale-105"
                  />
                  <span className="flex min-w-0 flex-col">
                    <motion.span
                      layoutId={`name-${s.id}`}
                      className="truncate text-sm font-medium"
                    >
                      {s.displayName}
                    </motion.span>
                    <span className="truncate text-xs text-muted-foreground">
                      {s.stack ? `${s.stack} / ` : ""}
                      {KIND_LABEL[s.kind]}
                    </span>
                  </span>
                </span>
                <span className="relative text-right">
                  <span className="text-sm">
                    <NumberRoll value={s.cpu} suffix="%" />
                  </span>
                  <span
                    className="absolute right-0 -bottom-1.5 h-0.5 rounded-full bg-foreground/60"
                    style={{ width: `${Math.min(100, s.cpu * 2)}%` }}
                  />
                </span>
                <span className="text-right text-sm">
                  <NumberRoll value={s.memMB} digits={0} suffix=" MB" />
                </span>
                <span className="hidden text-right text-sm text-muted-foreground md:block">
                  <NumberRoll
                    value={s.netRxKBs >= 1024 ? s.netRxKBs / 1024 : s.netRxKBs}
                    digits={s.netRxKBs >= 1024 ? 1 : 0}
                    suffix={s.netRxKBs >= 1024 ? " MB/s" : " KB/s"}
                  />
                </span>
                <span className="hidden text-right text-sm text-muted-foreground md:block">
                  <NumberRoll
                    value={s.netTxKBs >= 1024 ? s.netTxKBs / 1024 : s.netTxKBs}
                    digits={s.netTxKBs >= 1024 ? 1 : 0}
                    suffix={s.netTxKBs >= 1024 ? " MB/s" : " KB/s"}
                  />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-medium">正在运行</h2>
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            {kinds.map(({ k, total, running }) => (
              <div key={k} className="flex items-baseline justify-between">
                <span className="text-sm">
                  {KIND_LABEL[k]}
                  {k === "compose" && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({stacks} 个栈)
                    </span>
                  )}
                </span>
                <span className="tabular text-sm">
                  <span className="font-semibold">{running}</span>
                  <span className="text-muted-foreground"> / {total}</span>
                </span>
              </div>
            ))}
            <div className="border-t pt-4">
              <p className="mb-3 text-xs text-muted-foreground">未运行</p>
              <div className="flex flex-col gap-2">
                {services
                  .filter((s) => s.status !== "running")
                  .map((s) => (
                    <Link
                      key={s.id}
                      to={`/services/${s.id}`}
                      className="flex items-center gap-2.5 rounded-md hover:underline"
                    >
                      <ServiceIcon
                        match={s.iconMatch}
                        override={s.iconOverride}
                        kind={s.kind}
                        size="sm"
                      />
                      <span className="flex-1 truncate text-sm">
                        {s.displayName}
                      </span>
                      <StatusLabel s={s} className="text-xs" />
                    </Link>
                  ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
