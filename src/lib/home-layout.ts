export const UNGROUPED = "ungrouped"

export interface HomeGroup {
  id: string
  name: string
}

export interface HomeLayout {
  groups: HomeGroup[]
  order: Record<string, string[]>
  span: Record<string, number>
}

export function defaultLayout(): HomeLayout {
  return {
    groups: [{ id: UNGROUPED, name: "未分组" }],
    order: { [UNGROUPED]: [] },
    span: {},
  }
}

function trimName(name: string) {
  const chars = Array.from(name.trim())
  return chars.slice(0, 24).join("")
}

export function normalizeLayout(raw: Partial<HomeLayout> | null | undefined): HomeLayout {
  const groups: HomeGroup[] = [{ id: UNGROUPED, name: "未分组" }]
  const seen = new Set<string>([UNGROUPED])
  const names = new Set<string>(["未分组"])
  for (const g of raw?.groups ?? []) {
    const id = g?.id?.trim() ?? ""
    const name = trimName(g?.name ?? "")
    if (!id || id === UNGROUPED || seen.has(id) || !name || names.has(name)) continue
    seen.add(id)
    names.add(name)
    groups.push({ id, name })
  }
  const order: Record<string, string[]> = {}
  const used = new Set<string>()
  for (const g of groups) {
    const ids: string[] = []
    for (const id of raw?.order?.[g.id] ?? []) {
      const clean = id?.trim() ?? ""
      if (!clean || used.has(clean)) continue
      used.add(clean)
      ids.push(clean)
    }
    order[g.id] = ids
  }
  const span: Record<string, number> = {}
  for (const [id, n] of Object.entries(raw?.span ?? {})) {
    const clean = id.trim()
    if (!clean) continue
    span[clean] = Math.min(3, Math.max(1, Math.round(Number(n) || 1)))
  }
  return { groups, order, span }
}

export function spanOf(layout: HomeLayout, id: string) {
  return layout.span[id] ?? 1
}

export function spanClass(span: number) {
  if (span >= 3) return "sm:col-span-2 xl:col-span-3"
  if (span === 2) return "sm:col-span-2"
  return ""
}
