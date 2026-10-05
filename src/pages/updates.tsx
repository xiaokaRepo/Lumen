import * as React from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import {
  IconArrowRight,
  IconCheck,
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
import type { UpdateRow } from "@/lib/api"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

function UpdateDialog({
  row,
  onClose,
}: {
  row: UpdateRow | null
  onClose: () => void
}) {
  const { services } = useStore()
  const names = row?.serviceIds
    .map((id) => services.find((s) => s.id === id)?.displayName)
    .filter(Boolean)
    .join("、")
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{names || row?.image} 有新 digest</DialogTitle>
          <DialogDescription>
            本地 <span className="tabular">{row?.current}</span>，仓库{" "}
            <span className="tabular">{row?.latest}</span>
            。Lumen 只通知，不会拉取镜像，也不会重建容器。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>知道了</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function UpdatesPage() {
  const preview = useViewState()
  const { services, updates, updateChecked, updateError, checkUpdates } =
    useStore()
  const [active, setActive] = React.useState<UpdateRow | null>(null)
  const [checking, setChecking] = React.useState(false)
  const state =
    preview !== "ready"
      ? preview
      : updateError && updates.length === 0
        ? "error"
        : updates.length === 0
          ? "empty"
          : "ready"

  return (
    <>
      <PageHeader
        title="镜像更新"
        description={`对比本地镜像 digest 与仓库标签。${updateChecked ? `上次检查 ${updateChecked}。` : ""}每 6 小时自动检查，只通知，不自动更新。`}
        actions={
          <>
            <Button
              variant="outline"
              disabled={checking}
              onClick={() => {
                setChecking(true)
                checkUpdates()
                  .then(() => toast.success("检查完成"))
                  .catch((e: Error) => toast.error(e.message))
                  .finally(() => setChecking(false))
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
          </>
        }
      />

      {state === "loading" && <TableSkeleton rows={5} cols={4} />}
      {state === "error" && (
        <ErrorState message={updateError || "无法访问镜像仓库。"} />
      )}
      {state === "empty" && (
        <EmptyState
          icon={<IconCheck />}
          title="所有镜像都是最新"
          description={
            updateChecked
              ? `上次检查 ${updateChecked}。有新 digest 时会出现在这里，并按告警规则通知你。`
              : "还没有检查过。有新 digest 时会出现在这里。"
          }
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
                        onSelect={() =>
                          toast.info("Lumen 只通知，不会拉取或重建容器")
                        }
                      >
                        不自动更新
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="sm"
                    variant={u.pinned ? "outline" : "default"}
                    onClick={() => setActive(u)}
                  >
                    查看
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
