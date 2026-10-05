import * as React from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import {
  IconAlertTriangle,
  IconBell,
  IconBrandTelegram,
  IconBrandWechat,
  IconCheck,
  IconCircleCheck,
  IconInfoCircle,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconSend,
  IconX,
} from "@tabler/icons-react"

import { EmptyState, PageHeader } from "@/components/page-states"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  CHANNEL_META,
  RULE_META,
  type AlertEvent,
  type AlertRule,
  type Channel,
  type ChannelType,
  type RuleKind,
} from "@/mock/alerts"

const CHANNEL_ICON: Record<
  ChannelType,
  React.ComponentType<{ className?: string }>
> = {
  bark: IconBell,
  telegram: IconBrandTelegram,
  wecom: IconBrandWechat,
}

function ChannelGlyph({
  type,
  className,
}: {
  type: ChannelType
  className?: string
}) {
  const I = CHANNEL_ICON[type]
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted",
        className
      )}
    >
      <I className="size-4" />
    </span>
  )
}

interface Board {
  channels: Channel[]
  rules: AlertRule[]
  history: AlertEvent[]
  reload: () => void
}

const BoardCtx = React.createContext<Board | null>(null)

function useBoard() {
  const v = React.useContext(BoardCtx)
  if (!v) throw new Error("alerts board")
  return v
}

function History() {
  const { history, rules, channels } = useBoard()
  const chName = (id: string) => channels.find((c) => c.id === id)
  const [filter, setFilter] = React.useState("all")
  const list = history.filter((e) => filter === "all" || e.state === filter)
  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        type="single"
        variant="outline"
        value={filter}
        onValueChange={(v) => v && setFilter(v)}
        className="w-fit"
      >
        <ToggleGroupItem value="all">全部</ToggleGroupItem>
        <ToggleGroupItem value="firing">
          触发中{" "}
          <span className="tabular text-destructive">
            {history.filter((e) => e.state === "firing").length}
          </span>
        </ToggleGroupItem>
        <ToggleGroupItem value="resolved">已恢复</ToggleGroupItem>
      </ToggleGroup>
      <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
        {list.map((e) => {
          const Icon =
            e.severity === "info"
              ? IconInfoCircle
              : e.state === "resolved"
                ? IconCircleCheck
                : IconAlertTriangle
          return (
            <div
              key={e.id}
              className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 p-4 md:grid-cols-[auto_1fr_auto]"
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4",
                  e.state === "firing" && e.severity === "critical"
                    ? "text-destructive"
                    : e.state === "resolved"
                      ? "text-success"
                      : "text-muted-foreground"
                )}
              />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{e.title}</span>
                  <span
                    className={cn(
                      "text-xs",
                      e.state === "firing"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {e.state === "firing" ? "触发中" : `已恢复 ${e.resolvedAt}`}
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {e.detail}
                </span>
                <span className="text-xs text-muted-foreground">
                  规则：{rules.find((r) => r.id === e.ruleId)?.name}
                </span>
              </div>
              <div className="col-start-2 flex flex-wrap items-center gap-3 md:col-start-3 md:row-start-1 md:flex-col md:items-end md:gap-1.5">
                <span className="tabular text-xs text-muted-foreground">
                  {e.at}
                </span>
                <span className="flex gap-1.5">
                  {e.sent.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      仅记录
                    </span>
                  )}
                  {e.sent.map((s) => {
                    const c = chName(s.channel)
                    if (!c) return null
                    const I = CHANNEL_ICON[c.type]
                    return (
                      <span
                        key={s.channel}
                        title={`${c.name} ${s.ok ? "发送成功" : "发送失败"}`}
                        className={cn(
                          "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs",
                          !s.ok && "border-destructive/40 text-destructive"
                        )}
                      >
                        <I className="size-3" />
                        {s.ok ? (
                          <IconCheck className="size-3" />
                        ) : (
                          <IconX className="size-3" />
                        )}
                      </span>
                    )
                  })}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RuleSheet({
  rule,
  open,
  onOpenChange,
}: {
  rule?: AlertRule
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [kind, setKind] = React.useState<RuleKind>(rule?.kind ?? "cpu_high")
  const [threshold, setThreshold] = React.useState(
    String(rule?.threshold ?? 85)
  )
  const [picked, setPicked] = React.useState<string[]>(
    rule?.channels ?? ["bark-iphone"]
  )
  const { channels, reload } = useBoard()
  const unit = RULE_META[kind].unit
  const tNum = Number(threshold)
  const tErr =
    unit && (!tNum || tNum < 1 || tNum > 100)
      ? "请输入 1 到 100 之间的数值"
      : undefined
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{rule ? "编辑告警规则" : "新建告警规则"}</SheetTitle>
          <SheetDescription>
            满足条件并持续指定时间后，向所选渠道发送通知。
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="r-name">规则名称</FieldLabel>
              <Input
                id="r-name"
                defaultValue={rule?.name ?? ""}
                placeholder="例如：主机 CPU 持续过高"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="r-kind">类型</FieldLabel>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as RuleKind)}
              >
                <SelectTrigger id="r-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RULE_META) as RuleKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {RULE_META[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="r-target">监控对象</FieldLabel>
              <Select defaultValue={kind === "disk_full" ? "/volume1" : "host"}>
                <SelectTrigger id="r-target" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="host">主机 (N100)</SelectItem>
                  <SelectItem value="/volume1">存储池 /volume1</SelectItem>
                  <SelectItem value="all">全部容器</SelectItem>
                  <SelectItem value="pick">选择服务</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {unit && (
              <div className="grid grid-cols-2 gap-3">
                <Field data-invalid={!!tErr}>
                  <FieldLabel htmlFor="r-th">阈值</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="r-th"
                      inputMode="numeric"
                      className="tabular"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      aria-invalid={!!tErr}
                    />
                    <InputGroupAddon align="inline-end">{unit}</InputGroupAddon>
                  </InputGroup>
                  {tErr && (
                    <FieldDescription className="text-destructive">
                      {tErr}
                    </FieldDescription>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="r-dur">持续</FieldLabel>
                  <Select defaultValue="5">
                    <SelectTrigger id="r-dur" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["1", "5", "15", "30"].map((m) => (
                        <SelectItem key={m} value={m}>
                          {m} 分钟
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}
            <FieldSet>
              <FieldLegend variant="label">通知渠道</FieldLegend>
              <div className="flex flex-col gap-2">
                {channels.map((c) => (
                  <Label
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg border p-2.5 font-normal has-[[data-state=checked]]:border-foreground/40"
                  >
                    <Checkbox
                      checked={picked.includes(c.id)}
                      onCheckedChange={(v) =>
                        setPicked((p) =>
                          v ? [...p, c.id] : p.filter((x) => x !== c.id)
                        )
                      }
                    />
                    <ChannelGlyph type={c.type} className="size-7" />
                    <span className="flex flex-1 flex-col">
                      <span className="text-sm">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {CHANNEL_META[c.type].label}
                        {!c.enabled && "，已停用"}
                      </span>
                    </span>
                  </Label>
                ))}
              </div>
              {picked.length === 0 && (
                <FieldDescription>
                  不选择渠道时只记录到告警历史。
                </FieldDescription>
              )}
            </FieldSet>
            <Field>
              <FieldLabel htmlFor="r-cool">冷却时间</FieldLabel>
              <Select defaultValue="60">
                <SelectTrigger id="r-cool" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 分钟</SelectItem>
                  <SelectItem value="60">1 小时</SelectItem>
                  <SelectItem value="360">6 小时</SelectItem>
                  <SelectItem value="1440">1 天</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                同一条规则在冷却时间内不重复通知。
              </FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="r-resolve">恢复时通知</FieldLabel>
                <FieldDescription>指标回到正常后再发一条</FieldDescription>
              </FieldContent>
              <Switch id="r-resolve" defaultChecked />
            </Field>
          </FieldGroup>
        </div>
        <SheetFooter className="flex-row justify-end border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
            <Button
            disabled={!!tErr}
            onClick={() => {
              const name =
                (document.getElementById("r-name") as HTMLInputElement | null)
                  ?.value.trim() || RULE_META[kind].label
              api
                .saveRule({
                  id: rule?.id,
                  kind,
                  name,
                  enabled: true,
                  target: rule?.target || "all",
                  threshold: unit ? Number(threshold) : undefined,
                  duration: unit ? "5 分钟" : "立即",
                  channels: picked,
                  cooldown: "30 分钟",
                  resolve: true,
                })
                .then(() => {
                  toast.success("规则已保存")
                  reload()
                  onOpenChange(false)
                })
                .catch((e: Error) => toast.error(e.message))
            }}
          >
            保存规则
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Rules() {
  const { rules, channels, reload } = useBoard()
  const [editing, setEditing] = React.useState<AlertRule | undefined>()
  const [open, setOpen] = React.useState(false)
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>({})
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(undefined)
            setOpen(true)
          }}
        >
          <IconPlus data-icon="inline-start" />
          新建规则
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-14 pl-4">启用</TableHead>
              <TableHead>规则</TableHead>
              <TableHead>条件</TableHead>
              <TableHead className="hidden lg:table-cell">对象</TableHead>
              <TableHead className="hidden md:table-cell">通知</TableHead>
              <TableHead className="hidden md:table-cell">冷却</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r) => (
              <TableRow
                key={r.id}
                className={cn(
                  (enabled[r.id] ?? r.enabled) === false && "text-muted-foreground"
                )}
              >
                <TableCell className="pl-4">
                  <Switch
                    size="sm"
                    checked={enabled[r.id] ?? r.enabled}
                    onCheckedChange={(v) => {
                      setEnabled((e) => ({ ...e, [r.id]: v }))
                      api
                        .saveRule({ ...r, enabled: v })
                        .then(reload)
                        .catch((e: Error) => toast.error(e.message))
                    }}
                    aria-label={`启用 ${r.name}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {RULE_META[r.kind].label}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="tabular text-sm">
                  {r.threshold !== undefined
                    ? `> ${r.threshold}${RULE_META[r.kind].unit}`
                    : ""}
                  {r.duration && (
                    <span className="text-muted-foreground">
                      {" "}
                      {r.threshold !== undefined ? "持续 " : ""}
                      {r.duration}
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-56 truncate text-sm lg:table-cell">
                  {r.target}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="flex gap-1">
                    {r.channels.map((id) => {
                      const c = channels.find((x) => x.id === id)
                      if (!c) return null
                      const I = CHANNEL_ICON[c.type]
                      return (
                        <span
                          key={id}
                          title={c.name}
                          className="inline-flex size-6 items-center justify-center rounded-md bg-muted"
                        >
                          <I className="size-3.5" />
                        </span>
                      )
                    })}
                  </span>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {r.cooldown}
                </TableCell>
                <TableCell className="pr-3">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="编辑规则"
                    onClick={() => {
                      setEditing(r)
                      setOpen(true)
                    }}
                  >
                    <IconPencil />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <RuleSheet
        key={`${editing?.id ?? "new"}-${open}`}
        rule={editing}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  )
}

function ChannelCard({ c }: { c: Channel }) {
  const { reload } = useBoard()
  const meta = CHANNEL_META[c.type]
  const [on, setOn] = React.useState(c.enabled)
  const [test, setTest] = React.useState<"idle" | "sending" | "ok" | "fail">(
    c.lastTest ? (c.lastTest.ok ? "ok" : "fail") : "idle"
  )
  const [msg, setMsg] = React.useState(
    c.lastTest
      ? `${c.lastTest.at}${c.lastTest.msg ? `：${c.lastTest.msg}` : " 测试成功"}`
      : "尚未测试"
  )
  const send = () => {
    setTest("sending")
    api
      .testChannel(c.id)
      .then(() => {
        setTest("ok")
        setMsg("刚刚 测试成功")
        toast.success(`测试通知已发送到 ${c.name}`)
        reload()
      })
      .catch((e: Error) => {
        setTest("fail")
        setMsg(e.message)
        toast.error(e.message)
      })
  }
  return (
    <Card className={cn(!on && "opacity-70")}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <ChannelGlyph type={c.type} />
          <div className="flex flex-col">
            <CardTitle>{c.name}</CardTitle>
            <CardDescription>{meta.label}</CardDescription>
          </div>
        </div>
        <CardAction>
          <Switch
            checked={on}
            onCheckedChange={(v) => {
              setOn(v)
              api
                .saveChannel({ ...c, enabled: v })
                .then(reload)
                .catch((e: Error) => toast.error(e.message))
            }}
            aria-label="启用渠道"
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          {meta.fields.map((f) => (
            <Field key={f.key}>
              <FieldLabel htmlFor={`${c.id}-${f.key}`}>{f.label}</FieldLabel>
              <Input
                id={`${c.id}-${f.key}`}
                type={f.secret ? "password" : "text"}
                defaultValue={c.config[f.key]}
                placeholder={f.placeholder}
                className={f.secret ? "tabular" : undefined}
              />
              {f.help && <FieldDescription>{f.help}</FieldDescription>}
            </Field>
          ))}
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex-wrap gap-3 border-t">
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 text-xs",
            test === "fail" ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {test === "ok" && (
            <IconCircleCheck className="size-3.5 shrink-0 text-success" />
          )}
          {test === "fail" && (
            <IconAlertTriangle className="size-3.5 shrink-0" />
          )}
          <span className="truncate">
            {test === "sending" ? "正在发送测试通知" : msg}
          </span>
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={send}
          disabled={test === "sending" || !on}
        >
          {test === "sending" ? (
            <IconLoader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <IconSend data-icon="inline-start" />
          )}
          测试发送
        </Button>
        <Button
          size="sm"
          onClick={() => {
            const config = { ...c.config }
            for (const f of meta.fields) {
              const el = document.getElementById(
                `${c.id}-${f.key}`
              ) as HTMLInputElement | null
              if (el) config[f.key] = el.value
            }
            api
              .saveChannel({ ...c, enabled: on, config })
              .then(() => {
                toast.success("渠道已保存")
                reload()
              })
              .catch((e: Error) => toast.error(e.message))
          }}
        >
          保存
        </Button>
      </CardFooter>
    </Card>
  )
}

function Channels() {
  const { channels, reload } = useBoard()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <IconPlus data-icon="inline-start" />
              添加渠道
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(CHANNEL_META) as ChannelType[]).map((t) => {
              const I = CHANNEL_ICON[t]
              return (
                <DropdownMenuItem
                  key={t}
                  onSelect={() =>
                    api
                      .saveChannel({
                        type: t,
                        name: CHANNEL_META[t].label,
                        enabled: true,
                        config: {},
                      })
                      .then(() => {
                        toast.success(`已添加 ${CHANNEL_META[t].label}`)
                        reload()
                      })
                      .catch((e: Error) => toast.error(e.message))
                  }
                >
                  <I />
                  {CHANNEL_META[t].label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {channels.map((c) => (
          <ChannelCard key={c.id} c={c} />
        ))}
      </div>
    </div>
  )
}

export function AlertsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get("tab") ?? "history"
  const previewEmpty = params.get("state") === "empty"
  const [board, setBoard] = React.useState<Omit<Board, "reload">>({
    channels: [],
    rules: [],
    history: [],
  })
  const reload = React.useCallback(() => {
    api
      .alerts()
      .then((d) =>
        setBoard({
          channels: d.channels ?? [],
          rules: d.rules ?? [],
          history: d.history ?? [],
        })
      )
      .catch((e: Error) => toast.error(e.message))
  }, [])
  React.useEffect(() => {
    reload()
  }, [reload])
  const empty = previewEmpty || board.history.length === 0
  return (
    <BoardCtx.Provider value={{ ...board, reload }}>
      <PageHeader
        title="告警"
        description="服务停止、资源过高、磁盘将满和镜像更新时，通过 Bark、Telegram 或企业微信通知你。"
      />
      <Tabs
        value={tab}
        onValueChange={(v) => setParams({ tab: v })}
        className="gap-4"
      >
        <TabsList>
          <TabsTrigger value="history">告警记录</TabsTrigger>
          <TabsTrigger value="rules">
            规则{" "}
            <span className="tabular text-muted-foreground">
              {board.rules.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="channels">
            通知渠道{" "}
            <span className="tabular text-muted-foreground">
              {board.channels.length}
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          {empty ? (
            <EmptyState
              icon={<IconCircleCheck />}
              title="最近 30 天没有告警"
              description="规则触发后会记录在这里，包括每个渠道的发送结果。"
            />
          ) : (
            <History />
          )}
        </TabsContent>
        <TabsContent value="rules">
          <Rules />
        </TabsContent>
        <TabsContent value="channels">
          <Channels />
        </TabsContent>
      </Tabs>
    </BoardCtx.Provider>
  )
}
