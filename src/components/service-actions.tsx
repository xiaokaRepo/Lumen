import * as React from "react"
import { toast } from "sonner"
import {
  IconCloudDownload,
  IconDots,
  IconExternalLink,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react"

import { EditServiceSheet } from "@/components/edit-service-sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { updateFor } from "@/mock/alerts"
import type { Service } from "@/mock/data"

type Confirm = "stop" | "remove" | null

export function useServiceActions(s: Service) {
  const [confirm, setConfirm] = React.useState<Confirm>(null)
  const [edit, setEdit] = React.useState(false)
  const [removeVolumes, setRemoveVolumes] = React.useState(false)
  const isNative = s.kind === "systemd" || s.kind === "process"
  const upd = updateFor(s.id)

  const run = (label: string) =>
    toast.success(`${label}：${s.displayName}`, {
      description: isNative
        ? `systemctl ${label === "重启" ? "restart" : "stop"} ${s.unit ?? s.name}`
        : `docker ${label === "重启" ? "restart" : label === "停止" ? "stop" : label === "暂停" ? "pause" : "start"} ${s.name}`,
    })

  const dialogs = (
    <>
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "remove"
                ? `删除 ${s.displayName}？`
                : `停止 ${s.displayName}？`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "remove"
                ? `将删除容器 ${s.name}。镜像和绑定目录会保留。${s.stack ? `它属于 compose 栈 ${s.stack}，下次 docker compose up 会重新创建。` : ""}`
                : isNative
                  ? `将执行 systemctl stop ${s.unit ?? s.name}。依赖它的功能 (例如文件共享) 会立即中断。`
                  : `依赖 ${s.displayName} 的服务可能无法访问。重启策略为 ${s.restartPolicy ?? "no"}，手动停止后不会自动拉起。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "remove" &&
            s.mounts?.some((m) => m.type === "volume") && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="rm-vol"
                  checked={removeVolumes}
                  onCheckedChange={(v) => setRemoveVolumes(!!v)}
                />
                <Label htmlFor="rm-vol" className="font-normal">
                  同时删除命名卷 (数据不可恢复)
                </Label>
              </div>
            )}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                run(confirm === "remove" ? "删除" : "停止")
                setConfirm(null)
              }}
            >
              {confirm === "remove" ? "删除" : "停止"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <EditServiceSheet
        key={String(edit)}
        service={s}
        open={edit}
        onOpenChange={setEdit}
      />
    </>
  )

  return { run, setConfirm, setEdit, dialogs, isNative, upd }
}

export function ServiceActionsMenu({
  s,
  align = "end",
  trigger,
}: {
  s: Service
  align?: "end" | "start"
  trigger?: React.ReactNode
}) {
  const { run, setConfirm, setEdit, dialogs, isNative, upd } =
    useServiceActions(s)
  const running = s.status === "running"
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          {trigger ?? (
            <Button variant="ghost" size="icon-sm" aria-label="更多操作">
              <IconDots />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          className="w-44"
          onClick={(e) => e.stopPropagation()}
        >
          {s.webUrl && (
            <DropdownMenuItem asChild>
              <a href={s.webUrl} target="_blank" rel="noreferrer">
                <IconExternalLink />
                打开 Web UI
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setEdit(true)}>
            <IconPencil />
            编辑信息
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {running ? (
            <DropdownMenuItem onSelect={() => setConfirm("stop")}>
              <IconPlayerStop />
              停止
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => run(s.status === "paused" ? "恢复" : "启动")}
            >
              <IconPlayerPlay />
              {s.status === "paused" ? "恢复" : "启动"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => run("重启")}>
            <IconRefresh />
            重启
          </DropdownMenuItem>
          {!isNative && running && (
            <DropdownMenuItem onSelect={() => run("暂停")}>
              <IconPlayerPause />
              暂停
            </DropdownMenuItem>
          )}
          {!isNative && (
            <DropdownMenuItem
              onSelect={() =>
                toast.info(`正在拉取 ${s.image}`, {
                  description: upd
                    ? `${upd.current} 更新到 ${upd.latest}，完成后自动重建容器`
                    : "检查是否有新版本",
                })
              }
            >
              <IconCloudDownload />
              {upd ? `更新到 ${upd.latest}` : "检查更新"}
            </DropdownMenuItem>
          )}
          {!isNative && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirm("remove")}
              >
                <IconTrash />
                删除容器
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  )
}
