import * as React from "react"

import type { IconRef } from "@/lib/icons"
import { services as baseServices, type Service } from "@/mock/data"

export interface ServiceMeta {
  displayName?: string
  group?: string
  webUrl?: string
  description?: string
  iconOverride?: IconRef
  hideOnHome?: boolean
}

interface Store {
  services: Service[]
  updateMeta: (id: string, meta: ServiceMeta) => void
  homeOrder: string[]
  setHomeOrder: (ids: string[]) => void
  authed: boolean
  setAuthed: (v: boolean) => void
}

const Ctx = React.createContext<Store | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = React.useState<Record<string, ServiceMeta>>({})
  const [homeOrder, setHomeOrder] = React.useState<string[]>(() =>
    baseServices.map((s) => s.id)
  )
  const [authed, setAuthedState] = React.useState(
    () => sessionStorage.getItem("dmm-auth") !== "0"
  )

  const services = React.useMemo(
    () =>
      baseServices.map((s) => {
        const m = meta[s.id]
        if (!m) return s
        return {
          ...s,
          displayName: m.displayName || s.displayName,
          group: m.group || s.group,
          webUrl: m.webUrl ?? s.webUrl,
          description: m.description ?? s.description,
          iconOverride: m.iconOverride ?? s.iconOverride,
          hideOnHome: m.hideOnHome,
        }
      }),
    [meta]
  )

  const value = React.useMemo<Store>(
    () => ({
      services,
      updateMeta: (id, m) =>
        setMeta((prev) => ({ ...prev, [id]: { ...prev[id], ...m } })),
      homeOrder,
      setHomeOrder,
      authed,
      setAuthed: (v) => {
        sessionStorage.setItem("dmm-auth", v ? "1" : "0")
        setAuthedState(v)
      },
    }),
    [services, homeOrder, authed]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = React.useContext(Ctx)
  if (!v) throw new Error("useStore outside StoreProvider")
  return v
}

export function useService(id: string | undefined) {
  return useStore().services.find((s) => s.id === id)
}
