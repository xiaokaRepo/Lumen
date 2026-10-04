import * as React from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import {
  IconArrowRight,
  IconCheck,
  IconCloudDownload,
  IconExternalLink,
  IconLoader2,
  IconPin,
  IconRefresh,
  IconStack2,
} from "@tabler/icons-react"

import {
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useViewState,
} from "@/components/page-states"
import { ServiceIcon } from "@/components/service-icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { updates, type UpdateRow } from "@/mock/alerts"

const STEPS = [
  "拉取新镜像",
  "停止旧容器",
  "按原配置重建",
  "等待健康检查",
  "清理旧镜像",
]

function UpdateDialog({
  row,
  onClose,
}: {
  row: UpdateRow | null
  onClose: () => void
}) {
  const { services } = useStore()
  const [done, setDone] = React.useState(0)
  const [backup, setBackup] = React.useState(true)
  const [started, setStarted] = React.useState(false)

  React.useEffect(() => {
    if (!started || done >= STEPS.length) return
    const t = setTimeout(() => setDone((d) => d + 1), 700)
    return () => clearTimeout(t)
  }, [started, done])

  const names = row?.serviceIds
    .map((id) => services.find((s) => s.id === id)?.displayName)
    .join("、")
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {row?.stack ? `重建 ${row.stack} 栈` : `更新 ${names}`}
          </DialogTitle>
          <DialogDescription>
            <span className="tabular">{row?.current}</span> 更新到{" "}
            <span className="tabular">{row?.latest}</span>
            {row?.stack
              ? `，将执行 docker compose pull && up -d，影响 ${names}。`
              : "，保留原有端口、环境变量和挂载。"}
          </DialogDescription>
        </DialogHeader>
        {!started ? (
          <div className="flex items-start gap-2">
            <Checkbox
              id="keep-old"
              checked={backup}
              onCheckedChange={(v) => setBackup(!!v)}
              className="mt-0.5"
            />
            <Label
              htmlFor="keep-old"
              className="flex flex-col items-start gap-0.5 font-normal"
            >
              保留旧镜像以便回滚
              <span className="text-xs text-muted-foreground">
                新版本健康检查失败时自动回滚到 {row?.current}
              </span>
            </Label>
          </div>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {STEPS.filter((s) => backup || s !== "清理旧镜像").map((s, i) => (
              <li
                key={s}
                className={cn(
                  "flex items-center gap-2.5 text-sm",
                  i > done && "text-muted-foreground"
                )}
              >
                {i < done ? (
                  <IconCheck className="size-4 text-success" />
                ) : i === done ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : (
                  <span className="size-4" />
                )}
                {s}
              </li>
            ))}
          </ol>
        )}
        <DialogFooter>
          {done >= STEPS.length ? (
            <Button onClick={onClose}>完成</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={started}>
                取消
              </Button>
              <Button onClick={() => setStarted(true)} disabled={started}>
                {started ? "更新中" : "开始更新"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function UpdatesPage() {
  const state = useViewState()
  const { services } = useStore()
  const [active, setActive] = React.useState<UpdateRow | null>(null)
  const [checking, setChecking] = React.useState(false)
  const actionable = updates.filter((u) => !u.pinned)

  return (
    <>
      <PageHeader
        title="镜像更新"
        description="对比本地镜像 digest 与仓库最新标签。上次检查今天 09:00，每 6 小时自动检查，不会自动更新。"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setChecking(true)
                setTimeout(() => {
                  setChecking(false)
                  toast.success("检查完成", {
                    description: `${updates.length} 个镜像有更新`,
                  })
                }, 1200)
              }}
            >
              {checking ? (
                <IconLoader2
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <IconRefresh data-icon="inline-start" />
              )}
              立即检查
            </Button>
            <Button
              onClick={() =>
                toast.info(`已加入队列：${actionable.length} 个更新`, {
                  description: "按顺序执行，单个失败不影响其他",
                })
              }
            >
              <IconCloudDownload data-icon="inline-start" />
              全部更新 ({actionable.length})
            </Button>
          </>
        }
      />

      {state === "loading" && <TableSkeleton rows={5} cols={4} />}
      {state === "error" && (
        <ErrorState message="无法访问 ghcr.io 和 lscr.io。请在设置中配置镜像加速或代理。" />
      )}
      {state === "empty" && (
        <EmptyState
          icon={<IconCheck />}
          title="所有镜像都是最新"
          description="上次检查今天 09:00。有新版本时会出现在这里，并按告警规则通知你。"
        />
      )}
      {state === "ready" && (
        <div className="flex flex-col gap-3">
          {updates.map((u) => {
            const list = u.serviceIds
              .map((id) => services.find((s) => s.id === id)!)
              .filter(Boolean)
            const first = list[0]
            return (
              <div
                key={u.image}
                className={cn(
                  "grid grid-cols-1 items-center gap-4 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]",
                  u.pinned && "bg-muted/40"
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ServiceIcon
                    match={first.iconMatch}
                    override={first.iconOverride}
                    kind={first.kind}
                    size="lg"
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/services/${first.id}`}
                        className="font-medium hover:underline"
                      >
                        {u.stack
                          ? list.map((s) => s.displayName).join("、")
                          : first.displayName}
                      </Link>
                      {u.stack && (
                        <Badge variant="outline" className="gap-1">
                          <IconStack2 />
                          {u.stack}
                        </Badge>
                      )}
                      {u.pinned && (
                        <Badge variant="secondary" className="gap-1">
                          <IconPin />
                          已固定版本
                        </Badge>
                      )}
                    </span>
                    <span className="tabular truncate text-xs text-muted-foreground">
                      {u.image}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="tabular flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{u.current}</span>
                    <IconArrowRight className="size-3.5 text-muted-foreground" />
                    <span className="font-semibold">{u.latest}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {u.published}发布，下载约 {u.sizeDeltaMB} MB
                  </span>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  {u.changelog && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={u.changelog} target="_blank" rel="noreferrer">
                        更新日志
                        <IconExternalLink data-icon="inline-end" />
                      </a>
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        更多
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => toast.success(`已忽略 ${u.latest}`)}
                      >
                        忽略此版本
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          toast.success(
                            u.pinned ? "已取消固定" : `已固定在 ${u.current}`
                          )
                        }
                      >
                        {u.pinned ? "取消固定" : "固定当前版本"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => toast.success("仅拉取镜像，不重建容器")}
                      >
                        只拉取镜像
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="sm"
                    variant={u.pinned ? "outline" : "default"}
                    onClick={() => setActive(u)}
                  >
                    {u.stack ? "重建栈" : "更新"}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <UpdateDialog
        key={active?.image ?? "none"}
        row={active}
        onClose={() => setActive(null)}
      />
    </>
  )
}
