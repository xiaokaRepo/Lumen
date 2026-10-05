import * as React from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import {
  IconArrowDown,
  IconDots,
  IconSearch,
  IconShieldLock,
} from "@tabler/icons-react"

import {
  ErrorState,
  PageHeader,
  TableSkeleton,
  useViewState,
} from "@/components/page-states"
import { ServiceIcon } from "@/components/service-icon"
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fmtMem, fmtPct } from "@/lib/format"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { host, processes, type Proc } from "@/mock/data"

const STATE_LABEL: Record<Proc["state"], string> = {
  R: "运行",
  S: "睡眠",
  D: "不可中断",
  T: "已停止",
  Z: "僵尸",
}
const PROTECTED = new Set([1, 1251, 1134, 412, 4102])

type SortKey = "cpu" | "memMB" | "pid"

function SortHead({
  k,
  sort,
  onSort,
  children,
  className,
}: {
  k: SortKey
  sort: SortKey
  onSort: (k: SortKey) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <TableHead className={className}>
      <button
        className={cn(
          "inline-flex items-center gap-1",
          sort === k ? "text-foreground" : ""
        )}
        onClick={() => onSort(k)}
      >
        {children}
        {sort === k && <IconArrowDown className="size-3" />}
      </button>
    </TableHead>
  )
}

export function ProcessesPage() {
  const state = useViewState()
  const { services } = useStore()
  const byId = Object.fromEntries(services.map((s) => [s.id, s]))
  const [q, setQ] = React.useState("")
  const [sort, setSort] = React.useState<SortKey>("cpu")
  const [onlyContainers, setOnlyContainers] = React.useState(false)
  const [kill, setKill] = React.useState<{ p: Proc; sig: string } | null>(null)
  const [renice, setRenice] = React.useState<Proc | null>(null)
  const [nice, setNice] = React.useState(0)

  const list = processes
    .filter(
      (p) =>
        (!onlyContainers || p.serviceId) &&
        (!q ||
          `${p.pid} ${p.name} ${p.command} ${p.user}`
            .toLowerCase()
            .includes(q.toLowerCase()))
    )
    .sort((a, b) => (sort === "pid" ? a.pid - b.pid : b[sort] - a[sort]))

  return (
    <>
      <PageHeader
        title="进程"
        description={`主机共 214 个进程，负载 ${host.load.join(" / ")}。通过 pid: host 读取，包含容器内进程。`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <InputGroup className="sm:w-80">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="搜索进程"
            placeholder="PID、进程名、命令或用户"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </InputGroup>
        <div className="flex items-center gap-2">
          <Switch
            id="only-c"
            checked={onlyContainers}
            onCheckedChange={setOnlyContainers}
          />
          <Label htmlFor="only-c" className="font-normal">
            只看属于服务的进程
          </Label>
        </div>
        <span className="text-xs text-muted-foreground sm:ml-auto">
          每 3 秒刷新，显示前 {list.length} 个
        </span>
      </div>

      {state === "loading" && <TableSkeleton rows={12} cols={6} />}
      {state === "error" && (
        <ErrorState message="无法读取 /proc。Lumen 需要 pid: host 才能看到主机进程。" />
      )}
      {(state === "ready" || state === "empty") && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHead sort={sort} onSort={setSort} k="pid" className="pl-4">
                  PID
                </SortHead>
                <TableHead>进程</TableHead>
                <TableHead className="hidden lg:table-cell">所属服务</TableHead>
                <TableHead className="hidden sm:table-cell">用户</TableHead>
                <SortHead
                  sort={sort}
                  onSort={setSort}
                  k="cpu"
                  className="text-right"
                >
                  CPU
                </SortHead>
                <SortHead
                  sort={sort}
                  onSort={setSort}
                  k="memMB"
                  className="text-right"
                >
                  内存
                </SortHead>
                <TableHead className="hidden text-right md:table-cell">
                  Nice
                </TableHead>
                <TableHead className="hidden md:table-cell">状态</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((p) => {
                const s = p.serviceId ? byId[p.serviceId] : undefined
                const prot = PROTECTED.has(p.pid)
                return (
                  <TableRow key={p.pid}>
                    <TableCell className="tabular pl-4 text-muted-foreground">
                      {p.pid}
                    </TableCell>
                    <TableCell className="max-w-[28rem]">
                      <div className="flex flex-col">
                        <span className="font-medium">{p.name}</span>
                        <span
                          className="tabular truncate text-xs text-muted-foreground"
                          title={p.command}
                        >
                          {p.command}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {s ? (
                        <Link
                          to={`/services/${s.id}`}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <ServiceIcon
                            match={s.iconMatch}
                            override={s.iconOverride}
                            kind={s.kind}
                            size="sm"
                          />
                          <span className="text-sm">{s.displayName}</span>
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          主机
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular hidden text-xs sm:table-cell">
                      {p.user}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "tabular text-right",
                        p.cpu > 20 && "font-semibold"
                      )}
                    >
                      {fmtPct(p.cpu)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {fmtMem(p.memMB)}
                    </TableCell>
                    <TableCell className="tabular hidden text-right text-muted-foreground md:table-cell">
                      {p.nice}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span
                        className={cn(
                          "text-xs",
                          p.state === "Z"
                            ? "text-destructive"
                            : p.state === "R"
                              ? "text-foreground"
                              : "text-muted-foreground"
                        )}
                      >
                        <span className="tabular mr-1">{p.state}</span>
                        {STATE_LABEL[p.state]}
                      </span>
                    </TableCell>
                    <TableCell className="pr-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="进程操作"
                          >
                            <IconDots />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuLabel className="tabular text-xs font-normal text-muted-foreground">
                            PID {p.pid} {p.name}
                          </DropdownMenuLabel>
                          {prot && (
                            <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                              <IconShieldLock className="size-3.5" />
                              系统关键进程，已禁止结束
                            </DropdownMenuLabel>
                          )}
                          <DropdownMenuItem
                            onSelect={() => {
                              setRenice(p)
                              setNice(p.nice)
                            }}
                          >
                            调整优先级 (renice)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={prot}
                            onSelect={() => setKill({ p, sig: "SIGHUP" })}
                          >
                            发送 SIGHUP (重载)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={prot}
                            onSelect={() => setKill({ p, sig: "SIGSTOP" })}
                          >
                            暂停 (SIGSTOP)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={prot}
                            onSelect={() => setKill({ p, sig: "SIGTERM" })}
                          >
                            结束 (SIGTERM)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={prot}
                            variant="destructive"
                            onSelect={() => setKill({ p, sig: "SIGKILL" })}
                          >
                            强制结束 (SIGKILL)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!kill} onOpenChange={(o) => !o && setKill(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              向 {kill?.p.name} 发送 {kill?.sig}？
            </AlertDialogTitle>
            <AlertDialogDescription>
              PID {kill?.p.pid}
              {kill?.p.serviceId
                ? `，属于 ${byId[kill.p.serviceId]?.displayName}。容器内主进程退出后，Docker 会按重启策略处理。`
                : "，主机进程。"}
              {kill?.sig === "SIGKILL" &&
                " SIGKILL 无法被进程捕获，未保存的数据会丢失。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant={
                kill?.sig === "SIGKILL" || kill?.sig === "SIGTERM"
                  ? "destructive"
                  : "default"
              }
              onClick={() => {
                toast.success(`已发送 ${kill?.sig}`, {
                  description: `kill -${kill?.sig.replace("SIG", "")} ${kill?.p.pid}`,
                })
                setKill(null)
              }}
            >
              发送
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!renice} onOpenChange={(o) => !o && setRenice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>调整优先级</DialogTitle>
            <DialogDescription>
              {renice?.name} (PID {renice?.pid})，当前 nice 值 {renice?.nice}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel>
              Nice 值{" "}
              <span className="tabular ml-auto text-base font-semibold">
                {nice}
              </span>
            </FieldLabel>
            <Slider
              min={-20}
              max={19}
              step={1}
              value={[nice]}
              onValueChange={([v]) => setNice(v)}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>-20 最高优先级</span>
              <span>19 最低优先级</span>
            </div>
            <FieldDescription>
              后台任务 (rsync、转码、相册识别) 设为 10 以上，可以让 SMB
              和网页更流畅。
            </FieldDescription>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenice(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                toast.success("优先级已调整", {
                  description: `renice -n ${nice} -p ${renice?.pid}`,
                })
                setRenice(null)
              }}
            >
              应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
