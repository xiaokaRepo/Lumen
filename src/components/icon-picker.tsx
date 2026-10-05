import * as React from "react"
import {
  IconCheck,
  IconLink,
  IconSearch,
  IconWand,
  IconWifiOff,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import {
  ICON_INDEX,
  iconUrl,
  slugCandidates,
  SOURCE_LABEL,
  type IconRef,
  type IconSource,
} from "@/lib/icons"

type Indexes = Record<"dashboard-icons" | "selfhst", string[]>

let cache: Promise<Indexes> | null = null
function loadIndexes(): Promise<Indexes> {
  cache ??= Promise.all([
    fetch(ICON_INDEX["dashboard-icons"]).then((r) => r.json()) as Promise<{
      svg: string[]
      png: string[]
    }>,
    fetch(ICON_INDEX.selfhst).then((r) => r.json()) as Promise<
      { Reference: string }[]
    >,
  ])
    .then(([di, sh]) => ({
      "dashboard-icons": [
        ...new Set(
          [...di.svg, ...di.png].map((f) => f.replace(/\.(svg|png)$/, ""))
        ),
      ].sort(),
      selfhst: sh.map((x) => x.Reference).sort(),
    }))
    .catch((e) => {
      cache = null
      throw e
    })
  return cache
}

function useIndexes(enabled: boolean) {
  const [state, setState] = React.useState<{
    data?: Indexes
    error?: string
    loading: boolean
  }>({ loading: true })
  const [nonce, setNonce] = React.useState(0)
  React.useEffect(() => {
    if (!enabled) return
    let alive = true
    loadIndexes()
      .then((data) => alive && setState({ data, loading: false }))
      .catch(
        () => alive && setState({ error: "无法加载图标索引", loading: false })
      )
    return () => {
      alive = false
    }
  }, [enabled, nonce])
  return {
    ...state,
    retry: () => {
      setState({ loading: true })
      setNonce((n) => n + 1)
    },
  }
}

function Tile({
  r,
  selected,
  onPick,
}: {
  r: IconRef
  selected: boolean
  onPick: () => void
}) {
  const [broken, setBroken] = React.useState(false)
  const [src, setSrc] = React.useState(iconUrl(r, "svg"))
  if (broken) return null
  return (
    <button
      type="button"
      onClick={onPick}
      title={r.slug}
      className={cn(
        "group relative flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors hover:bg-muted active:scale-[0.98]",
        selected ? "border-foreground ring-1 ring-foreground" : "border-border"
      )}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        className="size-9 object-contain"
        onError={() =>
          src.endsWith(".svg") ? setSrc(iconUrl(r, "png")) : setBroken(true)
        }
      />
      <span className="w-full truncate text-[11px] text-muted-foreground">
        {r.slug}
      </span>
      {selected && (
        <IconCheck className="absolute top-1.5 right-1.5 size-3.5" />
      )}
    </button>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {Array.from({ length: 18 }).map((_, i) => (
        <Skeleton key={i} className="h-[76px] rounded-lg" />
      ))}
    </div>
  )
}

function SourceGrid({
  source,
  list,
  query,
  value,
  onPick,
}: {
  source: Exclude<IconSource, "custom">
  list: string[]
  query: string
  value?: IconRef
  onPick: (r: IconRef) => void
}) {
  const q = query.trim().toLowerCase().replace(/\s+/g, "-")
  const hits = React.useMemo(() => {
    if (!q) return list.slice(0, 48)
    const starts = list.filter((s) => s.startsWith(q))
    const contains = list.filter((s) => !s.startsWith(q) && s.includes(q))
    return [...starts, ...contains].slice(0, 96)
  }, [list, q])
  if (!hits.length)
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {SOURCE_LABEL[source]} 中没有 “{query}”，试试英文名或自定义 URL
      </p>
    )
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {hits.map((slug) => (
        <Tile
          key={slug}
          r={{ source, slug }}
          selected={value?.source === source && value.slug === slug}
          onPick={() => onPick({ source, slug })}
        />
      ))}
    </div>
  )
}

export function IconPicker({
  open,
  onOpenChange,
  match,
  name,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  match: string
  name: string
  value?: IconRef
  onChange: (r: IconRef | undefined) => void
}) {
  const { data, error, loading, retry } = useIndexes(open)
  const [tab, setTab] = React.useState("auto")
  const [query, setQuery] = React.useState("")
  const [draft, setDraft] = React.useState<IconRef | undefined>(value)
  const [url, setUrl] = React.useState(
    value?.source === "custom" ? (value.url ?? "") : ""
  )
  const [urlOk, setUrlOk] = React.useState<boolean | null>(null)

  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setDraft(value)
      setQuery(slugCandidates(match)[0] ?? "")
    }
  }

  const candidates = slugCandidates(match)
  const autoRefs: IconRef[] = data
    ? candidates.flatMap((slug) =>
        (["dashboard-icons", "selfhst"] as const)
          .filter((src) => data[src].includes(slug))
          .map((source) => ({ source, slug }))
      )
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>选择图标</DialogTitle>
          <DialogDescription>
            为 {name} 选择图标。来源 Dashboard Icons 与 selfh.st/icons，通过
            jsDelivr CDN 加载。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <TabsList className="w-full">
            <TabsTrigger value="auto">
              <IconWand data-icon="inline-start" />
              自动匹配
            </TabsTrigger>
            <TabsTrigger value="dashboard-icons">Dashboard Icons</TabsTrigger>
            <TabsTrigger value="selfhst">selfh.st</TabsTrigger>
            <TabsTrigger value="custom">
              <IconLink data-icon="inline-start" />
              自定义 URL
            </TabsTrigger>
          </TabsList>

          {(tab === "dashboard-icons" || tab === "selfhst") && (
            <InputGroup>
              <InputGroupAddon>
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="搜索图标"
                placeholder="搜索图标名，例如 jellyfin"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {data && (
                <InputGroupAddon align="inline-end" className="tabular text-xs">
                  {data[tab].length} 个
                </InputGroupAddon>
              )}
            </InputGroup>
          )}

          <ScrollArea className="h-[340px] pr-3">
            {loading && tab !== "custom" && <GridSkeleton />}
            {error && tab !== "custom" && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <IconWifiOff className="size-6 text-muted-foreground" />
                <p className="text-sm">
                  {error}，请检查这台机器能否访问 cdn.jsdelivr.net
                </p>
                <Button size="sm" variant="outline" onClick={retry}>
                  重试
                </Button>
              </div>
            )}
            {data && (
              <>
                <TabsContent value="auto" className="flex flex-col gap-4">
                  <div className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
                    根据镜像{" "}
                    <code className="tabular text-foreground">{match}</code>{" "}
                    推断候选名{" "}
                    {candidates.map((c) => (
                      <code
                        key={c}
                        className="tabular mr-1 rounded bg-background px-1 py-0.5 text-foreground"
                      >
                        {c}
                      </code>
                    ))}
                    ，优先 Dashboard Icons，其次 selfh.st。
                  </div>
                  {autoRefs.length ? (
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {autoRefs.map((r) => (
                        <div
                          key={`${r.source}-${r.slug}`}
                          className="flex flex-col gap-1"
                        >
                          <Tile
                            r={r}
                            selected={
                              draft?.source === r.source &&
                              draft.slug === r.slug
                            }
                            onPick={() => setDraft(r)}
                          />
                          <span className="text-center text-[10px] text-muted-foreground">
                            {SOURCE_LABEL[r.source]}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      两个图标库都没有匹配项，当前显示默认图标。可以手动搜索或填写
                      URL。
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="dashboard-icons">
                  <SourceGrid
                    source="dashboard-icons"
                    list={data["dashboard-icons"]}
                    query={query}
                    value={draft}
                    onPick={setDraft}
                  />
                </TabsContent>
                <TabsContent value="selfhst">
                  <SourceGrid
                    source="selfhst"
                    list={data.selfhst}
                    query={query}
                    value={draft}
                    onPick={setDraft}
                  />
                </TabsContent>
              </>
            )}
            <TabsContent value="custom" className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="icon-url">图标地址</FieldLabel>
                <Input
                  id="icon-url"
                  placeholder="https://example.com/icon.svg"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value)
                    setUrlOk(null)
                  }}
                />
                <FieldDescription>
                  支持 SVG / PNG / WebP。也可以填局域网地址，例如
                  http://192.168.1.20/icons/my.png
                </FieldDescription>
              </Field>
              <div className="flex items-center gap-4 rounded-lg border p-4">
                <span className="flex size-14 items-center justify-center rounded-xl bg-muted p-2.5">
                  {url ? (
                    <img
                      src={url}
                      alt=""
                      className="size-full object-contain"
                      onLoad={() => {
                        setUrlOk(true)
                        setDraft({ source: "custom", url })
                      }}
                      onError={() => setUrlOk(false)}
                    />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    urlOk === false
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {!url
                    ? "填写地址后在这里预览"
                    : urlOk === null
                      ? "加载中"
                      : urlOk
                        ? "图片可用"
                        : "图片无法加载，请检查地址"}
                </span>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              onChange(undefined)
              onOpenChange(false)
            }}
          >
            恢复自动匹配
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              disabled={!draft}
              onClick={() => {
                onChange(draft)
                onOpenChange(false)
              }}
            >
              使用此图标
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
