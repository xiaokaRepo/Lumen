import * as React from "react"
import { toast } from "sonner"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { motion } from "motion/react"
import {
  IconCheck,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconLayoutGrid,
  IconPencil,
  IconSearch,
} from "@tabler/icons-react"

import { EditServiceSheet } from "@/components/edit-service-sheet"
import { EnterBlock, useEnterOnce } from "@/components/enter"
import { NumberRoll } from "@/components/number-roll"
import { EmptyState } from "@/components/page-states"
import { ServiceIcon } from "@/components/service-icon"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { groupNames } from "@/lib/ports"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { GROUPS, type Service } from "@/mock/data"

const STATUS_TEXT: Record<Service["status"], string> = {
  running: "",
  paused: "已暂停",
  exited: "已停止",
  restarting: "重启中",
}

function Tile({
  s,
  editing,
  onEdit,
  onToggleHide,
  index,
  enter,
}: {
  s: Service
  editing: boolean
  onEdit: () => void
  onToggleHide: () => void
  index: number
  enter: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: s.id, disabled: !editing })
  const down = s.status !== "running" || s.health === "unhealthy"
  const hostLabel = s.webUrl?.replace(/^https?:\/\//, "")

  const body = (
    <>
      <ServiceIcon
        match={s.iconMatch}
        override={s.iconOverride}
        kind={s.kind}
        size="lg"
        layoutId={editing ? undefined : `icon-${s.id}`}
        className={cn(
          "transition-transform duration-200 ease-out group-hover:scale-105",
          down && !editing && "opacity-60 grayscale"
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <motion.span
          layoutId={editing ? undefined : `name-${s.id}`}
          className="truncate font-medium"
        >
          {s.displayName}
        </motion.span>
        {s.description && !editing ? (
          <span className="truncate text-xs text-muted-foreground">
            {s.description}
          </span>
        ) : (
          <span className="tabular truncate text-xs text-muted-foreground">
            {hostLabel}
          </span>
        )}
        {down && (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <span
              className="lumen-pulse-once size-1.5 rounded-full bg-destructive"
              aria-hidden
            />
            {s.health === "unhealthy" && s.status === "running"
              ? "不健康"
              : STATUS_TEXT[s.status]}
          </span>
        )}
      </span>
    </>
  )

  const dragTransform = CSS.Transform.toString(transform)
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: dragTransform,
        transition: isDragging
          ? undefined
          : transition
            ? "transform 280ms cubic-bezier(0.22, 1.2, 0.36, 1)"
            : undefined,
        zIndex: isDragging ? 20 : undefined,
      }}
      className={cn(
        "relative",
        isDragging && "z-10 -translate-y-0.5 scale-[1.02]",
        s.hideOnHome && editing && "opacity-50"
      )}
    >
      <EnterBlock show={enter} index={index} className="h-full">
        {editing ? (
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border border-dashed bg-card p-3 pr-2 transition-shadow duration-200 ease-out",
              isDragging &&
                "border-solid border-foreground/30 shadow-lg shadow-foreground/10"
            )}
          >
            <button
              {...attributes}
              {...listeners}
              className="-ml-1 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
              aria-label={`拖动 ${s.displayName}`}
            >
              <IconGripVertical className="size-4" />
            </button>
            {body}
            <span className="flex flex-col">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onToggleHide}
                aria-label={s.hideOnHome ? "显示" : "隐藏"}
              >
                {s.hideOnHome ? <IconEyeOff /> : <IconEye />}
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onEdit}
                aria-label="编辑"
              >
                <IconPencil />
              </Button>
            </span>
          </div>
        ) : (
          <a
            href={s.webUrl}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition-[background-color,border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-muted/50 hover:shadow-md hover:shadow-foreground/5 active:translate-y-px active:scale-[0.98]"
          >
            {body}
          </a>
        )}
      </EnterBlock>
    </div>
  )
}

export function HomePage() {
  const { services, homeOrder, setHomeOrder, updateMeta, host } = useStore()
  const enter = useEnterOnce("home")
  const [editing, setEditing] = React.useState(false)
  const [q, setQ] = React.useState("")
  const [editTarget, setEditTarget] = React.useState<Service | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const byOrder = [...services]
    .filter((s) => s.webUrl)
    .sort((a, b) => homeOrder.indexOf(a.id) - homeOrder.indexOf(b.id))
  const visible = byOrder.filter(
    (s) =>
      (editing || !s.hideOnHome) &&
      (!q ||
        `${s.displayName} ${s.name} ${s.description ?? ""}`
          .toLowerCase()
          .includes(q.toLowerCase()))
  )
  const groups = groupNames(visible, GROUPS)
    .map((g) => [g, visible.filter((s) => s.group === g)] as const)
    .filter(([, l]) => l.length)
  const running = byOrder.filter(
    (s) => s.status === "running" && s.health !== "unhealthy"
  ).length

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = homeOrder.indexOf(String(e.active.id))
    const to = homeOrder.indexOf(String(e.over.id))
    setHomeOrder(arrayMove(homeOrder, from, to))
  }

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <InputGroup className="h-10 md:max-w-md">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            aria-label="搜索应用"
            placeholder="搜索应用，回车打开第一个"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && visible[0]?.webUrl)
                window.open(visible[0].webUrl, "_blank")
            }}
          />
          <InputGroupAddon align="inline-end">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span>
            <span className="text-foreground">
              <NumberRoll value={running} digits={0} />
            </span>{" "}
            / {byOrder.length} 个应用正常
          </span>
          <span>
            CPU{" "}
            <span className="text-foreground">
              <NumberRoll value={host.cpuPercent} suffix="%" />
            </span>
          </span>
          <span>
            内存{" "}
            <span className="text-foreground">
              <NumberRoll value={host.memUsedGB} suffix=" GB" />
            </span>
          </span>
          <span>
            {host.disks[0]?.mount ?? "磁盘"} 剩余{" "}
            <span className="text-foreground">
              <NumberRoll
                value={
                  host.disks[0]
                    ? host.disks[0].totalGB - host.disks[0].usedGB
                    : 0
                }
                suffix=" GB"
              />
            </span>
          </span>
        </div>
        <div className="flex gap-2 md:ml-auto">
          {editing ? (
            <Button
              onClick={() => {
                setEditing(false)
                toast.success("布局已保存")
              }}
            >
              <IconCheck data-icon="inline-start" />
              完成
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <IconLayoutGrid data-icon="inline-start" />
                  编辑布局
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                拖动排序、隐藏卡片、修改图标和名称
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {editing && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          拖动左侧把手调整顺序，也可以用键盘：聚焦把手后按空格拿起，方向键移动。改分组请点铅笔图标。
        </p>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={<IconSearch />}
          title={`没有叫 “${q}” 的应用`}
          description="只显示配置了 Web 地址的服务。可以在服务详情里补充 Web 地址。"
          action={
            <Button variant="outline" size="sm" onClick={() => setQ("")}>
              清除搜索
            </Button>
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-8 xl:grid-cols-2">
            {groups.map(([g, list]) => (
              <section
                key={g}
                className={cn(
                  "flex flex-col gap-3",
                  list.length > 2 && "xl:col-span-2"
                )}
              >
                <h2 className="text-sm font-medium text-muted-foreground">
                  {g}
                </h2>
                <SortableContext
                  items={list.map((s) => s.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
                    {list.map((s) => (
                      <Tile
                        key={s.id}
                        s={s}
                        editing={editing}
                        index={visible.indexOf(s)}
                        enter={enter && !q}
                        onEdit={() => setEditTarget(s)}
                        onToggleHide={() =>
                          updateMeta(s.id, { hideOnHome: !s.hideOnHome })
                        }
                      />
                    ))}
                  </div>
                </SortableContext>
              </section>
            ))}
          </div>
        </DndContext>
      )}

      {editTarget && (
        <EditServiceSheet
          service={editTarget}
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
        />
      )}
    </>
  )
}
