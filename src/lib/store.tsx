import * as React from "react"

import type { IconRef } from "@/lib/icons"
import {
  services as baseServices,
  type Service,
  type ServiceStatus,
} from "@/mock/data"

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
  flashStatus: (id: string, status: ServiceStatus) => void
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
  const [overlay, setOverlay] = React.useState<Record<string, ServiceStatus>>(
    {}
  )

  const services = React.useMemo(
    () =>
      baseServices.map((s) => {
        const m = meta[s.id]
        const status = overlay[s.id] ?? s.status
        if (!m && status === s.status) return s
        return {
          ...s,
          status,
          displayName: m?.displayName || s.displayName,
          group: m?.group || s.group,
          webUrl: m?.webUrl ?? s.webUrl,
          description: m?.description ?? s.description,
          iconOverride: m?.iconOverride ?? s.iconOverride,
          hideOnHome: m?.hideOnHome,
        }
      }),
    [meta, overlay]
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
      flashStatus: (id, status) => {
        setOverlay((prev) => ({ ...prev, [id]: status }))
        window.setTimeout(() => {
          setOverlay((prev) => {
            if (prev[id] !== status) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
        }, 360)
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
