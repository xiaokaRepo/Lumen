import * as React from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import {
  IconBox,
  IconCloudDownload,
  IconDatabase,
  IconDots,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"

import {
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useViewState,
  type ViewState,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
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
  api,
  type ImageRow,
  type NetworkRow,
  type VolumeRow,
} from "@/lib/api"
import { fmtMem } from "@/lib/format"
import { useStore } from "@/lib/store"

function useResource<T>(load: () => Promise<T[]>) {
  const preview = useViewState()
  const [rows, setRows] = React.useState<T[] | null>(null)
  const [err, setErr] = React.useState("")
  const reload = React.useCallback(() => {
    load()
      .then((list) => {
        setRows(list)
        setErr("")
      })
      .catch((e: Error) => setErr(e.message))
  }, [load])
  React.useEffect(() => {
    reload()
  }, [reload])
  const state: ViewState =
    preview !== "ready"
      ? preview
      : err
        ? "error"
        : rows === null
          ? "loading"
          : rows.length === 0
            ? "empty"
            : "ready"
  return { rows: rows ?? [], state, err, reload }
}

function UsedBy({ ids }: { ids: string[] }) {
  const { services } = useStore()
  if (!ids.length)
    return <span className="text-xs text-muted-foreground">未使用</span>
  return (
    <div className="flex items-center -space-x-1.5">
      {ids.slice(0, 5).map((id) => {
        const s = services.find((x) => x.id === id)
        if (!s)
          return (
            <span key={id} className="pl-2 text-xs text-muted-foreground">
              {id}
            </span>
          )
        return (
          <Link
            key={id}
            to={`/services/${id}`}
            title={s.displayName}
            className="rounded-md ring-2 ring-card"
          >
            <ServiceIcon
              match={s.iconMatch}
              override={s.iconOverride}
              kind={s.kind}
              size="sm"
            />
          </Link>
        )
      })}
      {ids.length > 5 && (
        <span className="tabular pl-3 text-xs text-muted-foreground">
          +{ids.length - 5}
        </span>
      )}
      {ids.length === 1 && (
        <span className="pl-3 text-sm">
          {services.find((x) => x.id === ids[0])?.displayName ?? ids[0]}
        </span>
      )}
    </div>
  )
}

function RowMenu({
  items,
}: {
  items: {
    label: string
    danger?: boolean
    disabled?: boolean
    onSelect?: () => void
  }[]
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="操作">
          <IconDots />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((it, i) => (
          <React.Fragment key={it.label}>
            {it.danger && i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant={it.danger ? "destructive" : "default"}
              disabled={it.disabled}
              onSelect={() => it.onSelect?.()}
            >
              {it.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function fail(e: unknown) {
  toast.error(e instanceof Error ? e.message : "操作失败")
}

async function copyText(text: string, label: string) {
  await navigator.clipboard.writeText(text)
  toast.success(`已复制${label}`)
}

export function ImagesPage() {
  const loadImages = React.useCallback(
    () => api.images().then((d) => d.images),
    []
  )
  const { rows: images, state, err, reload } = useResource<ImageRow>(loadImages)
  const [filter, setFilter] = React.useState("all")
  const [pullOpen, setPullOpen] = React.useState(false)
  const [ref, setRef] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const unused = images.filter((i) => !i.usedBy.length)
  const reclaim = unused.reduce((a, b) => a + b.sizeMB, 0)
  const total = images.reduce((a, b) => a + b.sizeMB, 0)
  const list =
    filter === "unused"
      ? unused
      : filter === "update"
        ? images.filter((i) => i.update)
        : images

  const pull = (name: string) => {
    setBusy(true)
    api
      .pullImage(name)
      .then(() => {
        toast.success("已拉取镜像", { description: name })
        setPullOpen(false)
        setRef("")
        reload()
      })
      .catch(fail)
      .finally(() => setBusy(false))
  }

  return (
    <>
      <PageHeader
        title="镜像"
        description={`${images.length} 个镜像，共 ${fmtMem(total)}。未使用的镜像可释放 ${fmtMem(reclaim)}。`}
        actions={
          <>
            <Button variant="outline" onClick={() => setPullOpen(true)}>
              <IconCloudDownload data-icon="inline-start" />
              拉取镜像
            </Button>
            <Button
              variant="outline"
              disabled={!unused.length}
              onClick={() =>
                api
                  .pruneImages()
                  .then((d) => {
                    toast.success(`已清理 ${d.removed} 个未使用镜像`)
                    reload()
                  })
                  .catch(fail)
              }
            >
              <IconTrash data-icon="inline-start" />
              清理未使用
            </Button>
          </>
        }
      />
      <ToggleGroup
        type="single"
        variant="outline"
        value={filter}
        onValueChange={(v) => v && setFilter(v)}
        className="w-fit"
      >
        <ToggleGroupItem value="all">
          全部{" "}
          <span className="tabular text-muted-foreground">{images.length}</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="update">
          可更新{" "}
          <span className="tabular text-muted-foreground">
            {images.filter((i) => i.update).length}
          </span>
        </ToggleGroupItem>
        <ToggleGroupItem value="unused">
          未使用{" "}
          <span className="tabular text-muted-foreground">{unused.length}</span>
        </ToggleGroupItem>
      </ToggleGroup>
      {state === "loading" && <TableSkeleton />}
      {state === "error" && <ErrorState message={err} />}
      {state === "empty" && (
        <EmptyState
          icon={<IconBox />}
          title="没有镜像"
          description="拉取镜像或部署 compose 栈后会显示在这里。"
        />
      )}
      {state === "ready" && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">仓库</TableHead>
                <TableHead>标签</TableHead>
                <TableHead className="hidden md:table-cell">镜像 ID</TableHead>
                <TableHead className="text-right">大小</TableHead>
                <TableHead className="hidden lg:table-cell">创建</TableHead>
                <TableHead>使用者</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((i) => (
                <TableRow key={i.id + i.repo + i.tag}>
                  <TableCell className="tabular max-w-[22rem] truncate pl-4 text-xs">
                    {i.repo}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span className="tabular text-xs">{i.tag}</span>
                      {i.update && (
                        <Badge
                          variant="outline"
                          className="border-success/40 text-success"
                        >
                          新版本 {i.update}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="tabular hidden text-xs text-muted-foreground md:table-cell">
                    {i.id}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {fmtMem(i.sizeMB)}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {i.created}
                  </TableCell>
                  <TableCell>
                    <UsedBy ids={i.usedBy} />
                  </TableCell>
                  <TableCell className="pr-3">
                    <RowMenu
                      items={[
                        {
                          label: "拉取最新",
                          disabled: i.repo === "<none>",
                          onSelect: () => pull(`${i.repo}:${i.tag}`),
                        },
                        {
                          label: "复制镜像 ID",
                          onSelect: () => void copyText(i.id, "镜像 ID"),
                        },
                        {
                          label: "删除镜像",
                          danger: true,
                          disabled: i.usedBy.length > 0,
                          onSelect: () =>
                            api
                              .deleteImage(i.id)
                              .then(() => {
                                toast.success("已删除镜像")
                                reload()
                              })
                              .catch(fail),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={pullOpen} onOpenChange={setPullOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>拉取镜像</DialogTitle>
            <DialogDescription>
              写入仓库和标签，例如 nginx:alpine。只下载镜像，不创建容器。
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="img-ref">镜像</FieldLabel>
            <Input
              id="img-ref"
              value={ref}
              placeholder="nginx:alpine"
              onChange={(e) => setRef(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPullOpen(false)}>
              取消
            </Button>
            <Button disabled={busy || !ref.trim()} onClick={() => pull(ref.trim())}>
              拉取
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const BUILTIN_NETS = new Set(["bridge", "host", "none"])

export function NetworksPage() {
  const loadNets = React.useCallback(
    () => api.networks().then((d) => d.networks),
    []
  )
  const { rows: networks, state, err, reload } =
    useResource<NetworkRow>(loadNets)
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [subnet, setSubnet] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  return (
    <>
      <PageHeader
        title="网络"
        description="Docker 网络和接入的服务。默认网络 bridge、host、none 不能删除。"
        actions={
          <Button variant="outline" onClick={() => setOpen(true)}>
            <IconPlus data-icon="inline-start" />
            创建网络
          </Button>
        }
      />
      {state === "loading" && <TableSkeleton />}
      {state === "error" && <ErrorState message={err} />}
      {(state === "ready" || state === "empty") && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">名称</TableHead>
                <TableHead>驱动</TableHead>
                <TableHead className="hidden md:table-cell">子网</TableHead>
                <TableHead className="hidden md:table-cell">网关</TableHead>
                <TableHead>接入服务</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {networks.map((n) => (
                <TableRow key={n.name}>
                  <TableCell className="pl-4 font-medium">{n.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{n.driver}</Badge>
                  </TableCell>
                  <TableCell className="tabular hidden text-xs md:table-cell">
                    {n.subnet ?? (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular hidden text-xs md:table-cell">
                    {n.gateway ?? (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <UsedBy ids={n.members} />
                  </TableCell>
                  <TableCell className="pr-3">
                    <RowMenu
                      items={[
                        {
                          label: "复制名称",
                          onSelect: () => void copyText(n.name, "网络名"),
                        },
                        {
                          label: "删除网络",
                          danger: true,
                          disabled:
                            BUILTIN_NETS.has(n.name) || n.members.length > 0,
                          onSelect: () =>
                            api
                              .deleteNetwork(n.name)
                              .then(() => {
                                toast.success("已删除网络")
                                reload()
                              })
                              .catch(fail),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建网络</DialogTitle>
            <DialogDescription>
              创建一个 bridge 网络。子网可留空，由 Docker 分配。
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="net-name">名称</FieldLabel>
            <Input
              id="net-name"
              value={name}
              placeholder="lab"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="net-subnet">子网</FieldLabel>
            <Input
              id="net-subnet"
              value={subnet}
              placeholder="172.28.0.0/16"
              onChange={(e) => setSubnet(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              disabled={busy || !name.trim()}
              onClick={() => {
                setBusy(true)
                api
                  .createNetwork(name.trim(), "bridge", subnet.trim())
                  .then(() => {
                    toast.success("已创建网络", { description: name.trim() })
                    setOpen(false)
                    setName("")
                    setSubnet("")
                    reload()
                  })
                  .catch(fail)
                  .finally(() => setBusy(false))
              }}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function VolumesPage() {
  const loadVols = React.useCallback(
    () => api.volumes().then((d) => d.volumes),
    []
  )
  const { rows: volumes, state, err, reload } = useResource<VolumeRow>(loadVols)
  const unused = volumes.filter((v) => !v.usedBy.length)
  return (
    <>
      <PageHeader
        title="存储卷"
        description={`${volumes.length} 个命名卷，${unused.length} 个未被任何容器使用。绑定挂载目录请在服务详情的存储中查看。`}
        actions={
          <Button
            variant="outline"
            disabled={!unused.length}
            onClick={() =>
              api
                .pruneVolumes()
                .then((d) => {
                  toast.success(`已清理 ${d.removed} 个未使用的卷`)
                  reload()
                })
                .catch(fail)
            }
          >
            <IconTrash data-icon="inline-start" />
            清理未使用
          </Button>
        }
      />
      {state === "loading" && <TableSkeleton />}
      {state === "error" && <ErrorState message={err} />}
      {state === "empty" && (
        <EmptyState
          icon={<IconDatabase />}
          title="没有命名卷"
          description="当前容器都使用绑定挂载，或者还没有创建命名卷。"
        />
      )}
      {state === "ready" && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">名称</TableHead>
                <TableHead className="text-right">大小</TableHead>
                <TableHead className="hidden lg:table-cell">挂载点</TableHead>
                <TableHead className="hidden md:table-cell">创建</TableHead>
                <TableHead>使用者</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {volumes.map((v) => (
                <TableRow key={v.name}>
                  <TableCell className="tabular pl-4 text-xs font-medium">
                    {v.name}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {fmtMem(v.sizeMB)}
                  </TableCell>
                  <TableCell className="tabular hidden max-w-[24rem] truncate text-xs text-muted-foreground lg:table-cell">
                    {v.mountpoint}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {v.created}
                  </TableCell>
                  <TableCell>
                    <UsedBy ids={v.usedBy} />
                  </TableCell>
                  <TableCell className="pr-3">
                    <RowMenu
                      items={[
                        {
                          label: "复制挂载点",
                          onSelect: () => void copyText(v.mountpoint, "挂载点"),
                        },
                        {
                          label: "删除卷",
                          danger: true,
                          disabled: v.usedBy.length > 0,
                          onSelect: () =>
                            api
                              .deleteVolume(v.name)
                              .then(() => {
                                toast.success("已删除卷")
                                reload()
                              })
                              .catch(fail),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
