import * as React from "react"
import { toast } from "sonner"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
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
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react"

import { EditServiceSheet } from "@/components/edit-service-sheet"
import { EnterBlock, useEnterOnce } from "@/components/enter"
import { NumberRoll } from "@/components/number-roll"
import { EmptyState } from "@/components/page-states"
import { ServiceIcon } from "@/components/service-icon"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
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
import type { CardFields } from "@/lib/api"
import {
  UNGROUPED,
  normalizeLayout,
  spanClass,
  spanOf,
  type HomeGroup,
  type HomeLayout,
} from "@/lib/home-layout"
import { serviceOpenURL } from "@/lib/open-url"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Service } from "@/mock/data"

function isDockerCard(s: Service) {
  return s.kind === "container" || s.kind === "compose"
}

function cardTone(s: Service): { label: string; tone: "ok" | "sleep" | "bad" } {
  if (s.sleeping) return { label: "休眠中", tone: "sleep" }
  if (s.status === "running" && s.health !== "unhealthy")
    return { label: "运行", tone: "ok" }
  return { label: "异常", tone: "bad" }
}

interface Row {
  group: HomeGroup
  items: Service[]
}

function placed(layout: HomeLayout, services: Service[]): Row[] {
  const byId = new Map(services.map((s) => [s.id, s]))
  const used = new Set<string>()
  const rows: Row[] = layout.groups.map((group) => {
    const items: Service[] = []
    for (const id of layout.order[group.id] ?? []) {
      const s = byId.get(id)
      if (!s || used.has(id)) continue
      used.add(id)
      items.push(s)
    }
    return { group, items }
  })
  for (const s of services) {
    if (used.has(s.id)) continue
    const match = rows.find((r) => r.group.name === s.group)
    const dest = match ?? rows.find((r) => r.group.id === UNGROUPED) ?? rows[0]
    dest.items.push(s)
    used.add(s.id)
  }
  return rows
}

function groupOf(rows: Row[], id: string) {
  if (id.startsWith("group:")) {
    const gid = id.slice(6)
    return rows.some((r) => r.group.id === gid) ? gid : undefined
  }
  return rows.find((r) => r.items.some((s) => s.id === id))?.group.id
}

function layoutFrom(layout: HomeLayout, rows: Row[]): HomeLayout {
  const order: Record<string, string[]> = {}
  for (const row of rows) order[row.group.id] = row.items.map((s) => s.id)
  return normalizeLayout({
    ...layout,
    groups: rows.map((r) => r.group),
    order,
  })
}

function moveCard(
  layout: HomeLayout,
  services: Service[],
  activeId: string,
  overId: string
) {
  const rows = placed(layout, services)
  const from = groupOf(rows, activeId)
  const to = groupOf(rows, overId)
  if (!from || !to || from === to) return null
  const fromRow = rows.find((r) => r.group.id === from)
  const toRow = rows.find((r) => r.group.id === to)
  if (!fromRow || !toRow) return null
  const item = fromRow.items.find((s) => s.id === activeId)
  if (!item) return null
  fromRow.items = fromRow.items.filter((s) => s.id !== activeId)
  let index = toRow.items.findIndex((s) => s.id === overId)
  if (index < 0) index = toRow.items.length
  toRow.items.splice(index, 0, item)
  return layoutFrom(layout, rows)
}

function reorderCard(
  layout: HomeLayout,
  services: Service[],
  activeId: string,
  overId: string
) {
  const rows = placed(layout, services)
  const from = groupOf(rows, activeId)
  const to = groupOf(rows, overId)
  if (!from || !to || from !== to || activeId === overId) return null
  const row = rows.find((r) => r.group.id === from)
  if (!row) return null
  const a = row.items.findIndex((s) => s.id === activeId)
  const b = row.items.findIndex((s) => s.id === overId)
  if (a < 0 || b < 0) return null
  row.items = arrayMove(row.items, a, b)
  return layoutFrom(layout, rows)
}

function Tile({
  s,
  editing,
  fields,
  hasUpdate,
  span,
  onLan,
  onEdit,
  onToggleHide,
  onSpan,
  index,
  enter,
}: {
  s: Service
  editing: boolean
  fields: CardFields
  hasUpdate: boolean
  span: number
  onLan: boolean
  onEdit: () => void
  onToggleHide: () => void
  onSpan: (span: number, done: boolean) => void
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
  const tone = cardTone(s)
  const openURL = serviceOpenURL(s, onLan)
  const hostLabel = openURL
    ? openURL.replace(/^https?:\/\//, "")
    : "没有网页地址"
  const duration = s.sleeping ? `休眠 ${s.sleepFor || "刚刚"}` : s.uptime

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
          tone.tone === "bad" && !editing && "opacity-60 grayscale"
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <motion.span
          layoutId={editing ? undefined : `name-${s.id}`}
          className="flex min-w-0 items-center gap-1.5 font-medium"
        >
          <span className="truncate">{s.displayName}</span>
          {fields.update && hasUpdate && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-foreground"
              aria-label="有新镜像"
            />
          )}
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
        {fields.status && (
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs",
              tone.tone === "bad"
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                tone.tone === "bad" && "bg-destructive lumen-pulse-once",
                tone.tone === "sleep" && "bg-muted-foreground",
                tone.tone === "ok" && "bg-success"
              )}
              aria-hidden
            />
            {tone.label}
          </span>
        )}
        {fields.usage && (
          <span className="tabular truncate text-xs text-muted-foreground">
            CPU {s.cpu}% · {Math.round(s.memMB)} MB
          </span>
        )}
        {fields.uptime && duration && (
          <span className="tabular truncate text-xs text-muted-foreground">
            {duration}
          </span>
        )}
      </span>
    </>
  )

  const shell =
    "group flex h-full items-center gap-3 rounded-xl border bg-card p-3 transition-[background-color,border-color,transform,box-shadow] duration-200 ease-out"
  const dragTransform = CSS.Transform.toString(transform)
  return (
    <div
      ref={setNodeRef}
      data-service={s.id}
      data-span={span}
      data-open={openURL ?? ""}
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
        spanClass(span),
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
            <span className="flex flex-col items-end">
              <span className="tabular px-1 text-[10px] text-muted-foreground">
                {span} 列
              </span>
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
            <button
              type="button"
              aria-label={`调整 ${s.displayName} 的宽度`}
              className="absolute inset-y-2 right-0 w-2 cursor-ew-resize rounded-full hover:bg-foreground/20"
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const grid = e.currentTarget.closest(
                  "[data-home-grid]"
                ) as HTMLElement | null
                if (!grid) return
                const startX = e.clientX
                const start = span
                const styles = getComputedStyle(grid)
                const cols =
                  styles.gridTemplateColumns.split(" ").filter(Boolean).length ||
                  1
                const gap = Number.parseFloat(styles.columnGap) || 0
                const colW = (grid.clientWidth - gap * (cols - 1)) / cols
                const step = Math.max(colW + gap, 1)
                const nextSpan = (clientX: number) =>
                  Math.min(
                    3,
                    Math.max(1, Math.round(start + (clientX - startX) / step))
                  )
                const move = (ev: PointerEvent) => onSpan(nextSpan(ev.clientX), false)
                const up = (ev: PointerEvent) => {
                  onSpan(nextSpan(ev.clientX), true)
                  window.removeEventListener("pointermove", move)
                  window.removeEventListener("pointerup", up)
                }
                window.addEventListener("pointermove", move)
                window.addEventListener("pointerup", up)
              }}
            />
          </div>
        ) : openURL ? (
          <a
            href={openURL}
            target="_blank"
            rel="noreferrer"
            className={cn(
              shell,
              "hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-muted/50 hover:shadow-md hover:shadow-foreground/5 active:translate-y-px active:scale-[0.98]"
            )}
          >
            {body}
          </a>
        ) : (
          <div className={shell}>{body}</div>
        )}
      </EnterBlock>
    </div>
  )
}

function GroupBlock({
  row,
  editing,
  name,
  onName,
  onRename,
  onDelete,
  children,
}: {
  row: Row
  editing: boolean
  name: string
  onName: (name: string) => void
  onRename: () => void
  onDelete: () => void
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group:${row.group.id}`,
    disabled: !editing,
  })
  const locked = row.group.id === UNGROUPED
  return (
    <section
      ref={setNodeRef}
      data-group={row.group.id}
      data-group-name={row.group.name}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        {editing && !locked ? (
          <Input
            value={name}
            aria-label={`重命名分组 ${row.group.name}`}
            className="h-8 max-w-48"
            onChange={(e) => onName(e.target.value)}
            onBlur={onRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
            }}
          />
        ) : (
          <h2 className="text-sm font-medium text-muted-foreground">
            {row.group.name}
          </h2>
        )}
        {editing && !locked && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`删除分组 ${row.group.name}`}
            onClick={onDelete}
          >
            <IconTrash />
          </Button>
        )}
      </div>
      <SortableContext
        items={row.items.map((s) => s.id)}
        strategy={rectSortingStrategy}
      >
        <div
          data-home-grid
          className={cn(
            "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3",
            editing && "min-h-24 rounded-xl border border-dashed p-2",
            isOver && "border-foreground/40 bg-muted/50"
          )}
        >
          {children}
        </div>
      </SortableContext>
    </section>
  )
}

export function HomePage() {
  const {
    services,
    homeLayout,
    setHomeLayout,
    setLayoutHold,
    cardFields,
    setCardFields,
    updates,
    updateMeta,
    host,
    onLan,
  } = useStore()
  const enter = useEnterOnce("home")
  const [editing, setEditing] = React.useState(false)
  const [q, setQ] = React.useState("")
  const [editTarget, setEditTarget] = React.useState<Service | null>(null)
  const [draft, setDraft] = React.useState<HomeLayout>(homeLayout)
  const [names, setNames] = React.useState<Record<string, string>>({})
  const inputRef = React.useRef<HTMLInputElement>(null)
  const draftRef = React.useRef(draft)
  draftRef.current = draft
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const docker = React.useMemo(
    () => services.filter(isDockerCard),
    [services]
  )
  const dockerRef = React.useRef(docker)
  dockerRef.current = docker

  React.useEffect(() => {
    setLayoutHold(editing)
    return () => setLayoutHold(false)
  }, [editing, setLayoutHold])

  React.useEffect(() => {
    if (!editing) setDraft(homeLayout)
  }, [homeLayout, editing])

  const applyDraft = React.useCallback(
    (next: HomeLayout, save: boolean) => {
      const normalized = normalizeLayout(next)
      draftRef.current = normalized
      setDraft(normalized)
      if (save) setHomeLayout(normalized)
    },
    [setHomeLayout]
  )

  const rows = placed(draft, docker)
    .map((row) => ({
      ...row,
      items: row.items.filter(
        (s) =>
          (editing || !s.hideOnHome) &&
          (!q ||
            editing ||
            `${s.displayName} ${s.name} ${s.description ?? ""}`
              .toLowerCase()
              .includes(q.toLowerCase()))
      ),
    }))
    .filter((row) => editing || row.items.length > 0)

  const listed = docker.filter((s) => editing || !s.hideOnHome)
  const running = listed.filter(
    (s) => s.status === "running" && s.health !== "unhealthy" && !s.sleeping
  ).length
  const visible = rows.flatMap((row) => row.items)

  const onDragOver = (e: DragOverEvent) => {
    if (!e.over) return
    const next = moveCard(
      draftRef.current,
      dockerRef.current,
      String(e.active.id),
      String(e.over.id)
    )
    if (!next) return
    if (JSON.stringify(next.order) === JSON.stringify(draftRef.current.order)) return
    applyDraft(next, false)
  }

  const onDragEnd = (e: DragEndEvent) => {
    let next = draftRef.current
    if (e.over) {
      const across = moveCard(
        next,
        dockerRef.current,
        String(e.active.id),
        String(e.over.id)
      )
      if (across) next = across
      else {
        const moved = reorderCard(
          next,
          dockerRef.current,
          String(e.active.id),
          String(e.over.id)
        )
        if (moved) next = moved
      }
    }
    applyDraft(next, true)
  }

  const addGroup = () => {
    const id = `g${Math.random().toString(16).slice(2, 10)}`
    const taken = new Set(draft.groups.map((g) => g.name))
    let name = "新分组"
    let n = 2
    while (taken.has(name)) {
      name = `新分组 ${n}`
      n++
    }
    applyDraft(
      {
        ...draft,
        groups: [...draft.groups, { id, name }],
        order: { ...draft.order, [id]: [] },
      },
      true
    )
    toast.success("已新建分组")
  }

  const renameGroup = (id: string) => {
    const name = (names[id] ?? "").trim()
    const current = draft.groups.find((g) => g.id === id)
    if (!current) return
    if (!name || name === "未分组" || draft.groups.some((g) => g.id !== id && g.name === name)) {
      setNames((prev) => ({ ...prev, [id]: current.name }))
      return
    }
    if (name === current.name) return
    applyDraft(
      {
        ...draft,
        groups: draft.groups.map((g) => (g.id === id ? { ...g, name } : g)),
      },
      true
    )
  }

  const deleteGroup = (id: string) => {
    if (id === UNGROUPED) return
    const full = placed(draft, docker)
    const victim = full.find((r) => r.group.id === id)
    const home = full.find((r) => r.group.id === UNGROUPED)
    if (victim && home) home.items.push(...victim.items)
    const kept = full.filter((r) => r.group.id !== id)
    applyDraft(layoutFrom({ ...draft, groups: kept.map((r) => r.group) }, kept), true)
    toast.success("已删除分组，卡片回到未分组")
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

  const emptyTitle = q
    ? `没有叫 “${q}” 的应用`
    : listed.length === 0 && docker.length > 0
      ? "首页卡片都已隐藏"
      : "还没有容器"
  const emptyDescription = q
    ? "换个名字再找一次。"
    : listed.length === 0 && docker.length > 0
      ? "进入编辑布局后可以重新显示。"
      : "已连接的主机会在这里列出全部容器，包括已停止、休眠和没有网页地址的容器。"

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
              const first = visible.find((s) => serviceOpenURL(s, onLan))
              if (e.key === "Enter" && first) {
                const url = serviceOpenURL(first, onLan)
                if (url) window.open(url, "_blank")
              }
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
            / {listed.length} 个应用正常
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
                拖动分组、调整宽度、隐藏卡片
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {editing && (
        <div className="flex flex-col gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1">
              拖动左侧把手把卡片移进分组，拖卡片右缘改变宽度。未分组会一直保留。
            </p>
            <Button variant="outline" size="sm" onClick={addGroup}>
              <IconPlus data-icon="inline-start" />
              新建分组
            </Button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-foreground">
            {(
              [
                ["status", "状态"],
                ["usage", "CPU 和内存"],
                ["uptime", "运行时长"],
                ["update", "新镜像"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <Checkbox
                  checked={cardFields[key]}
                  onCheckedChange={(v) =>
                    setCardFields({ ...cardFields, [key]: !!v })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconSearch />}
          title={emptyTitle}
          description={emptyDescription}
          action={
            q ? (
              <Button variant="outline" size="sm" onClick={() => setQ("")}>
                清除搜索
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={(args) => {
            const hits = pointerWithin(args)
            return hits.length ? hits : closestCorners(args)
          }}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex flex-col gap-8">
            {rows.map((row) => (
              <GroupBlock
                key={row.group.id}
                row={row}
                editing={editing}
                name={names[row.group.id] ?? row.group.name}
                onName={(name) =>
                  setNames((prev) => ({ ...prev, [row.group.id]: name }))
                }
                onRename={() => renameGroup(row.group.id)}
                onDelete={() => deleteGroup(row.group.id)}
              >
                {row.items.map((s) => (
                  <Tile
                    key={s.id}
                    s={s}
                    editing={editing}
                    fields={cardFields}
                    hasUpdate={updates.some((u) => u.serviceIds.includes(s.id))}
                    span={spanOf(draft, s.id)}
                    onLan={onLan}
                    index={visible.indexOf(s)}
                    enter={enter && !q}
                    onEdit={() => setEditTarget(s)}
                    onToggleHide={() =>
                      updateMeta(s.id, { hideOnHome: !s.hideOnHome })
                    }
                    onSpan={(span, done) =>
                      applyDraft(
                        { ...draftRef.current, span: { ...draftRef.current.span, [s.id]: span } },
                        done
                      )
                    }
                  />
                ))}
              </GroupBlock>
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
