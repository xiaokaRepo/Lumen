import * as React from "react"
import { Link, useParams } from "react-router-dom"
import { motion } from "motion/react"
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconDots,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconSearch,
} from "@tabler/icons-react"

import { CopyButton } from "@/components/copy-button"
import { MetricChart } from "@/components/metric-chart"
import { NumberRoll } from "@/components/number-roll"
import { EmptyState } from "@/components/page-states"
import {
  RestartButton,
  ServiceActionsMenu,
  useServiceActions,
} from "@/components/service-actions"
import { ServiceIcon } from "@/components/service-icon"
import { PortChip, portHref, StatusLabel } from "@/components/status"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { KIND_LABEL } from "@/lib/format"
import { useService, useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { api, type LogLine } from "@/lib/api"
import { portConflicts } from "@/lib/ports"
import { zip, type Service } from "@/mock/data"
import { UpdateBadge } from "@/pages/services"

function Stat({
  label,
  value,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
      {sub && (
        <span className="tabular text-xs text-muted-foreground">{sub}</span>
      )}
    </div>
  )
}

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function useFollow(value: number) {
  const [data, setData] = React.useState(() => [{ t: stamp(), v: value }])
  const prev = React.useRef(value)
  React.useEffect(() => {
    if (prev.current === value) return
    prev.current = value
    setData((d) => [...d, { t: stamp(), v }].slice(-60))
  }, [value])
  return data
}

function Monitor({ s }: { s: Service }) {
  const { host } = useStore()
  const [range, setRange] = React.useState("1h")
  const cpu = useFollow(s.cpu)
  const mem = useFollow(s.memMB)
  const rx = useFollow(s.netRxKBs)
  const tx = useFollow(s.netTxKBs)
  const rd = useFollow((s.diskReadKBs ?? 0) / 1024)
  const wr = useFollow((s.diskWriteKBs ?? 0) / 1024)
  const limit =
    s.memLimitMB &&
    host.memTotalGB > 0 &&
    s.memLimitMB < host.memTotalGB * 1024 * 0.9
      ? `限制 ${Math.round(s.memLimitMB)} MB`
      : "未设限制"

  if (s.status !== "running")
    return (
      <EmptyState
        icon={<IconPlayerStop />}
        title="服务未运行"
        description="启动后开始采集 CPU、内存、网络和磁盘数据，历史数据保留 7 天。"
      />
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-4 [&>*]:bg-card">
        <Stat
          label="CPU"
          value={<NumberRoll value={s.cpu} suffix="%" />}
          sub="占 N100 4 线程"
        />
        <Stat
          label="内存"
          value={<NumberRoll value={s.memMB} digits={0} suffix=" MB" />}
          sub={limit}
        />
        <Stat
          label="网络"
          value={<NumberRoll value={s.netTxKBs} digits={0} suffix=" KB/s" />}
          sub={
            <>
              接收 <NumberRoll value={s.netRxKBs} digits={0} suffix=" KB/s" />
            </>
          }
        />
        <Stat
          label="磁盘读写"
          value={
            <NumberRoll value={(s.diskReadKBs ?? 0) / 1024} suffix=" MB/s" />
          }
          sub={
            <>
              写入{" "}
              <NumberRoll value={(s.diskWriteKBs ?? 0) / 1024} suffix=" MB/s" />
            </>
          }
        />
      </div>
      <div className="flex justify-end">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={range}
          onValueChange={(v) => v && setRange(v)}
        >
          {["1h", "6h", "24h", "7d"].map((r) => (
            <ToggleGroupItem key={r} value={r}>
              {r.replace("h", " 小时").replace("d", " 天")}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>CPU %</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricChart
              data={zip(["cpu"], [cpu])}
              config={{ cpu: { label: "CPU %", color: "var(--foreground)" } }}
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>内存 MB</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricChart
              data={zip(["mem"], [mem])}
              config={{ mem: { label: "内存 MB", color: "var(--foreground)" } }}
              unit="MB"
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>网络 KB/s</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricChart
              data={zip(["tx", "rx"], [tx, rx])}
              config={{
                tx: { label: "发送", color: "var(--foreground)" },
                rx: { label: "接收", color: "var(--success)" },
              }}
              unit="KB/s"
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>磁盘 MB/s</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricChart
              data={zip(["rd", "wr"], [rd, wr])}
              config={{
                rd: { label: "读取", color: "var(--foreground)" },
                wr: { label: "写入", color: "var(--success)" },
              }}
              unit="MB/s"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Logs({ s }: { s: Service }) {
  const [follow, setFollow] = React.useState(true)
  const [ts, setTs] = React.useState(true)
  const [q, setQ] = React.useState("")
  const [raw, setRaw] = React.useState<LogLine[]>([])
  const [logError, setLogError] = React.useState("")
  const box = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    let stop = false
    const load = () => {
      api
        .logs(s.id)
        .then((d) => {
          if (!stop) {
            setRaw(d.lines)
            setLogError("")
          }
        })
        .catch((e: Error) => {
          if (!stop) setLogError(e.message)
        })
    }
    load()
    if (!follow)
      return () => {
        stop = true
      }
    const id = window.setInterval(load, 2000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [s.id, follow])

  React.useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [raw, follow])

  const lines = raw.filter(
    (l) => !q || l.msg.toLowerCase().includes(q.toLowerCase())
  )
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-3 border-b p-3">
        <InputGroup className="w-64">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="过滤日志"
            placeholder="过滤日志"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </InputGroup>
        <div className="flex items-center gap-2">
          <Switch id="follow" checked={follow} onCheckedChange={setFollow} />
          <Label htmlFor="follow" className="font-normal">
            实时跟随
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="ts" checked={ts} onCheckedChange={setTs} />
          <Label htmlFor="ts" className="font-normal">
            时间戳
          </Label>
        </div>
        <span className="text-xs text-muted-foreground">
          {s.kind === "systemd"
            ? `journalctl -u ${s.unit}`
            : `docker logs ${s.name}`}
          ，最近 500 行
        </span>
        <Button variant="outline" size="sm" className="ml-auto" asChild>
          <a href={`/api/services/${encodeURIComponent(s.id)}/logs?download=1`}>
            <IconDownload data-icon="inline-start" />
            下载
          </a>
        </Button>
      </div>
      <div
        ref={box}
        className="max-h-[420px] overflow-auto bg-muted/30 p-3 font-mono text-xs leading-6"
      >
        {logError && (
          <p className="py-8 text-center font-sans text-destructive">
            {logError}
          </p>
        )}
        {lines.length === 0 && (
          <p className="py-8 text-center font-sans text-muted-foreground">
            没有匹配 “{q}” 的日志
          </p>
        )}
        {lines.map((l, i) => (
          <div
            key={i}
            className={cn(
              "flex gap-3 rounded px-1 hover:bg-muted",
              l.level === "error" && "text-destructive",
              l.level === "warn" && "text-foreground"
            )}
          >
            {ts && (
              <span className="shrink-0 text-muted-foreground">{l.ts}</span>
            )}
            <span className="break-all whitespace-pre-wrap">{l.msg}</span>
          </div>
        ))}
        {follow && s.status === "running" && (
          <div className="px-1 text-muted-foreground">等待新日志</div>
        )}
      </div>
    </Card>
  )
}

function EnvTab({ s }: { s: Service }) {
  const [reveal, setReveal] = React.useState<Record<string, boolean>>({})
  if (!s.env?.length)
    return (
      <EmptyState
        icon={<IconEyeOff />}
        title={
          s.kind === "systemd" || s.kind === "process"
            ? "主机进程不显示环境变量"
            : "没有环境变量"
        }
        description={
          s.kind === "systemd" || s.kind === "process"
            ? "出于安全考虑，主机进程的 /proc/<pid>/environ 默认不读取，可在设置中开启。"
            : "这个容器没有设置自定义环境变量。"
        }
      />
    )
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-64 pl-4">变量</TableHead>
            <TableHead>值</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {s.env.map((e) => (
            <TableRow key={e.key}>
              <TableCell className="tabular pl-4 text-xs font-medium">
                {e.key}
              </TableCell>
              <TableCell className="tabular text-xs break-all whitespace-normal">
                {e.secret && !reveal[e.key] ? (
                  <span className="text-muted-foreground">••••••••••••</span>
                ) : (
                  e.value
                )}
              </TableCell>
              <TableCell className="pr-3 text-right">
                {e.secret && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="显示"
                    onClick={() =>
                      setReveal((r) => ({ ...r, [e.key]: !r[e.key] }))
                    }
                  >
                    {reveal[e.key] ? <IconEyeOff /> : <IconEye />}
                  </Button>
                )}
                <CopyButton
                  text={e.value}
                  label={`复制 ${e.key}`}
                  toastLabel={`已复制 ${e.key}`}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function ServiceDetailPage() {
  const { id } = useParams()
  const s = useService(id)
  if (!s)
    return (
      <EmptyState
        icon={<IconAlertTriangle />}
        title="找不到这个服务"
        description="容器可能已被删除或重命名。"
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/services">返回服务列表</Link>
          </Button>
        }
      />
    )
  return <Detail s={s} />
}

function Detail({ s }: { s: Service }) {
  const { run, restart, restarting, setConfirm, setEdit, dialogs, isNative } =
    useServiceActions(s)
  const { services } = useStore()
  const conflicts = portConflicts(services).filter((c) =>
    c.rows.some((r) => r.serviceId === s.id)
  )
  const running = s.status === "running"

  return (
    <>
      <Link
        to="/services"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <IconArrowLeft className="size-4" />
        服务
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <ServiceIcon
            match={s.iconMatch}
            override={s.iconOverride}
            kind={s.kind}
            size="xl"
            layoutId={`icon-${s.id}`}
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <motion.h1
                layoutId={`name-${s.id}`}
                className="text-xl font-semibold tracking-tight"
              >
                {s.displayName}
              </motion.h1>
              <UpdateBadge id={s.id} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <StatusLabel s={s} />
              <span>
                {KIND_LABEL[s.kind]}
                {s.stack ? ` / ${s.stack}` : ""}
              </span>
              <span>{s.group}</span>
              <span>{s.uptime}</span>
            </div>
            <span className="tabular truncate text-xs text-muted-foreground">
              {s.image ?? s.unit ?? `PID ${s.pid}`}
            </span>
            {s.description && (
              <p className="max-w-[65ch] text-sm">{s.description}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.webUrl && (
            <Button asChild>
              <a href={s.webUrl} target="_blank" rel="noreferrer">
                <IconExternalLink data-icon="inline-start" />
                打开 Web UI
              </a>
            </Button>
          )}
          <ButtonGroup>
            {running ? (
              <Button variant="outline" onClick={() => setConfirm("stop")}>
                <IconPlayerStop data-icon="inline-start" />
                停止
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => run(s.status === "paused" ? "恢复" : "启动")}
              >
                <IconPlayerPlay data-icon="inline-start" />
                {s.status === "paused" ? "恢复" : "启动"}
              </Button>
            )}
            <RestartButton busy={restarting} onClick={restart} />
            {!isNative && running && (
              <Button variant="outline" onClick={() => run("暂停")}>
                <IconPlayerPause data-icon="inline-start" />
                暂停
              </Button>
            )}
          </ButtonGroup>
          <Button variant="outline" onClick={() => setEdit(true)}>
            <IconPencil data-icon="inline-start" />
            编辑
          </Button>
          <ServiceActionsMenu
            s={s}
            trigger={
              <Button variant="outline" size="icon" aria-label="更多">
                <IconDots />
              </Button>
            }
          />
        </div>
      </div>

      {(s.lastError || conflicts.length > 0) && (
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>
            {s.status === "restarting"
              ? "容器反复重启"
              : conflicts.length
                ? "端口冲突"
                : "上次运行出错"}
          </AlertTitle>
          <AlertDescription>
            <p className="tabular">{s.lastError}</p>
            {conflicts.length > 0 && (
              <p>
                {conflicts.map((c) => c.key).join("、")} 同时被多个服务声明。
                <Link to="/ports" className="underline underline-offset-4">
                  在端口页查看
                </Link>
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="monitor" className="gap-4">
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto border-b [&>button]:flex-none [&>button]:px-3"
        >
          <TabsTrigger value="monitor">监控</TabsTrigger>
          <TabsTrigger value="logs">日志</TabsTrigger>
          <TabsTrigger value="ports">
            端口{" "}
            <span className="tabular text-muted-foreground">
              {s.ports.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="env">环境变量</TabsTrigger>
          <TabsTrigger value="mounts">存储</TabsTrigger>
          <TabsTrigger value="info">信息</TabsTrigger>
        </TabsList>
        <TabsContent value="monitor">
          <Monitor s={s} />
        </TabsContent>
        <TabsContent value="logs">
          <Logs s={s} />
        </TabsContent>
        <TabsContent value="ports">
          {s.ports.length === 0 ? (
            <EmptyState
              icon={<IconExternalLink />}
              title="没有暴露端口"
              description={
                s.stack
                  ? `只在 compose 网络 ${s.networks?.[0]} 内部通信。`
                  : "这个服务没有映射到主机的端口。"
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">主机端口</TableHead>
                    <TableHead>容器端口</TableHead>
                    <TableHead>协议</TableHead>
                    <TableHead>监听地址</TableHead>
                    <TableHead className="pr-4 text-right">访问</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.ports.map((p) => {
                    const c = conflicts.some(
                      (x) => x.key === `${p.host}/${p.proto}`
                    )
                    return (
                      <TableRow key={`${p.host}${p.proto}`}>
                        <TableCell className="pl-4">
                          <PortChip p={p} conflict={c} />
                        </TableCell>
                        <TableCell className="tabular">
                          {p.container ??
                            (s.networkMode === "host" ? "host 网络" : "-")}
                        </TableCell>
                        <TableCell className="text-muted-foreground uppercase">
                          {p.proto}
                        </TableCell>
                        <TableCell className="tabular text-muted-foreground">
                          {p.ip ?? "0.0.0.0"}
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          {p.proto === "tcp" && (
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={portHref(p)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <span className="tabular">{portHref(p)}</span>
                                <IconExternalLink data-icon="inline-end" />
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="env">
          <EnvTab s={s} />
        </TabsContent>
        <TabsContent value="mounts">
          {!s.mounts?.length ? (
            <EmptyState
              icon={<IconDownload />}
              title="没有挂载"
              description="容器数据只在容器层，删除容器后会丢失。"
            />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">类型</TableHead>
                    <TableHead>主机路径 / 卷</TableHead>
                    <TableHead>容器路径</TableHead>
                    <TableHead className="pr-4">模式</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.mounts.map((m) => (
                    <TableRow key={m.target}>
                      <TableCell className="pl-4">
                        <Badge variant="outline">
                          {
                            { bind: "绑定", volume: "命名卷", device: "设备" }[
                              m.type
                            ]
                          }
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular text-xs">
                        {m.source}
                      </TableCell>
                      <TableCell className="tabular text-xs">
                        {m.target}
                      </TableCell>
                      <TableCell className="pr-4">
                        <span
                          className={cn(
                            "text-xs",
                            m.mode === "ro" ? "text-muted-foreground" : ""
                          )}
                        >
                          {m.mode === "ro" ? "只读" : "读写"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>{isNative ? "进程信息" : "容器信息"}</CardTitle>
              <CardAction>
                <CopyButton
                  variant="ghost"
                  size="sm"
                  text={isNative ? (s.unit ?? s.name) : (s.image ?? s.name)}
                  label={isNative ? "复制单元文件" : "复制 docker inspect"}
                >
                  {isNative ? "复制单元文件" : "复制 docker inspect"}
                </CopyButton>
              </CardAction>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {(isNative
                  ? [
                      ["名称", s.name],
                      ["单元", s.unit ?? "非 systemd 进程"],
                      ["主 PID", s.pid],
                      ["启动时长", s.uptime],
                      [
                        "发现方式",
                        s.kind === "systemd"
                          ? "systemd 单元 + 监听端口"
                          : "/proc 扫描监听端口",
                      ],
                    ]
                  : [
                      ["容器名", s.name],
                      ["镜像", s.image],
                      ["Compose 项目", s.stack ?? "无"],
                      ["重启策略", s.restartPolicy],
                      ["网络", s.networks?.join(", ")],
                      [
                        "健康检查",
                        s.health
                          ? {
                              healthy: "健康",
                              unhealthy: "不健康",
                              starting: "启动中",
                            }[s.health]
                          : "未配置",
                      ],
                    ]
                ).map(([k, v]) => (
                  <div key={String(k)} className="flex flex-col gap-1">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="tabular break-all">{v ?? "-"}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {dialogs}
    </>
  )
}
