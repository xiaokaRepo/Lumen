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
} from "@/components/page-states"
import { ServiceIcon } from "@/components/service-icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { fmtMem } from "@/lib/format"
import { useStore } from "@/lib/store"
import { images, networks, volumes } from "@/mock/data"

function UsedBy({ ids }: { ids: string[] }) {
  const { services } = useStore()
  if (!ids.length)
    return <span className="text-xs text-muted-foreground">未使用</span>
  return (
    <div className="flex items-center -space-x-1.5">
      {ids.slice(0, 5).map((id) => {
        const s = services.find((x) => x.id === id)
        if (!s) return null
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
          {services.find((x) => x.id === ids[0])?.displayName}
        </span>
      )}
    </div>
  )
}

function RowMenu({
  items,
}: {
  items: { label: string; danger?: boolean; disabled?: boolean }[]
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
              onSelect={() => toast.success(it.label)}
            >
              {it.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ImagesPage() {
  const state = useViewState()
  const [filter, setFilter] = React.useState("all")
  const unused = images.filter((i) => !i.usedBy.length)
  const reclaim = unused.reduce((a, b) => a + b.sizeMB, 0)
  const total = images.reduce((a, b) => a + b.sizeMB, 0)
  const list =
    filter === "unused"
      ? unused
      : filter === "update"
        ? images.filter((i) => i.update)
        : images
  return (
    <>
      <PageHeader
        title="镜像"
        description={`${images.length} 个镜像，共 ${fmtMem(total)}。未使用的镜像可释放 ${fmtMem(reclaim)}。`}
        actions={
          <>
            <Button variant="outline">
              <IconCloudDownload data-icon="inline-start" />
              拉取镜像
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast.success("已清理未使用镜像", {
                  description: `释放 ${fmtMem(reclaim)}`,
                })
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
      {state === "error" && <ErrorState />}
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
                <TableRow key={i.id}>
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
                        { label: "拉取最新" },
                        { label: "复制镜像 ID" },
                        {
                          label: "删除镜像",
                          danger: true,
                          disabled: i.usedBy.length > 0,
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

export function NetworksPage() {
  const state = useViewState()
  return (
    <>
      <PageHeader
        title="网络"
        description="Docker 网络和接入的服务。默认网络 bridge、host、none 不能删除。"
        actions={
          <Button variant="outline">
            <IconPlus data-icon="inline-start" />
            创建网络
          </Button>
        }
      />
      {state === "loading" && <TableSkeleton />}
      {state === "error" && <ErrorState />}
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
                        { label: "查看详情" },
                        {
                          label: "删除网络",
                          danger: true,
                          disabled:
                            ["bridge", "host", "none"].includes(n.name) ||
                            n.members.length > 0,
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

export function VolumesPage() {
  const state = useViewState()
  const unused = volumes.filter((v) => !v.usedBy.length)
  return (
    <>
      <PageHeader
        title="存储卷"
        description={`${volumes.length} 个命名卷，${unused.length} 个未被任何容器使用。绑定挂载目录请在服务详情的“存储”中查看。`}
        actions={
          <Button
            variant="outline"
            onClick={() => toast.success("已清理未使用的卷")}
          >
            <IconTrash data-icon="inline-start" />
            清理未使用
          </Button>
        }
      />
      {state === "loading" && <TableSkeleton />}
      {state === "error" && <ErrorState />}
      {state === "empty" && (
        <EmptyState
          icon={<IconDatabase />}
          title="没有命名卷"
          description="当前服务都使用绑定挂载，数据直接存放在 /volume1 下。"
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
                        { label: "在文件管理中打开" },
                        {
                          label: "删除卷",
                          danger: true,
                          disabled: v.usedBy.length > 0,
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
