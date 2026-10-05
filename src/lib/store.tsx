import * as React from "react"

import {
  api,
  EMPTY_HOST,
  type HostInfo,
  type ServiceMetaBody,
  type UpdateRow,
} from "@/lib/api"
import type { SamplePoint } from "@/lib/live-sample"
import type { IconRef } from "@/lib/icons"
import type { Service, ServiceStatus } from "@/mock/data"

export interface ServiceMeta {
  displayName?: string
  group?: string
  webUrl?: string
  description?: string
  iconOverride?: IconRef
  hideOnHome?: boolean
  idleSleep?: boolean
}

interface Series {
  cpu: SamplePoint[]
  mem: SamplePoint[]
  rx: SamplePoint[]
  tx: SamplePoint[]
  disk: SamplePoint[]
}

interface Store {
  ready: boolean
  error: string
  setupRequired: boolean
  authed: boolean
  host: HostInfo
  services: Service[]
  series: Series
  dockerError: string
  systemdNote: string
  updateMeta: (id: string, meta: ServiceMeta) => Promise<void>
  act: (
    id: string,
    action: string,
    opts?: { removeVolumes?: boolean }
  ) => Promise<void>
  homeOrder: string[]
  setHomeOrder: (ids: string[]) => void
  updates: UpdateRow[]
  updateChecked: string
  updateError: string
  checkUpdates: () => Promise<void>
  login: (password: string, remember: boolean) => Promise<void>
  setup: (password: string) => Promise<void>
  logout: () => Promise<void>
  flashStatus: (id: string, status: ServiceStatus) => void
  refresh: () => Promise<void>
}

const Ctx = React.createContext<Store | null>(null)

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function push(points: SamplePoint[], v: number): SamplePoint[] {
  const next = [...points, { t: stamp(), v: Math.round(v * 10) / 10 }]
  return next.slice(-60)
}

const emptySeries: Series = { cpu: [], mem: [], rx: [], tx: [], disk: [] }

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false)
  const [error, setError] = React.useState("")
  const [setupRequired, setSetupRequired] = React.useState(false)
  const [authed, setAuthed] = React.useState(false)
  const [host, setHost] = React.useState<HostInfo>(EMPTY_HOST)
  const [services, setServices] = React.useState<Service[]>([])
  const [series, setSeries] = React.useState<Series>(emptySeries)
  const [dockerError, setDockerError] = React.useState("")
  const [systemdNote, setSystemdNote] = React.useState("")
  const [overlay, setOverlay] = React.useState<Record<string, ServiceStatus>>(
    {}
  )
  const [homeOrder, setHomeOrderState] = React.useState<string[]>([])
  const [updates, setUpdates] = React.useState<UpdateRow[]>([])
  const [updateChecked, setUpdateChecked] = React.useState("")
  const [updateError, setUpdateError] = React.useState("")

  const applyHost = React.useCallback((h: HostInfo) => {
    setHost(h)
    const disk = h.disks[0]
    const diskPct =
      disk && disk.totalGB ? (disk.usedGB / disk.totalGB) * 100 : 0
    setSeries((prev) => ({
      cpu: push(prev.cpu, h.cpuPercent),
      mem: push(
        prev.mem,
        h.memTotalGB ? (h.memUsedGB / h.memTotalGB) * 100 : 0
      ),
      rx: push(prev.rx, h.netRxMBs),
      tx: push(prev.tx, h.netTxMBs),
      disk: push(prev.disk, diskPct),
    }))
  }, [])

  const refresh = React.useCallback(async () => {
    const snap = await api.snapshot()
    applyHost(snap.host)
    setServices(snap.services)
    setDockerError(snap.dockerError || "")
    setSystemdNote(snap.systemdNote || "")
    setError(snap.dockerError ? "Docker 不可用：" + snap.dockerError : "")
    setHomeOrderState((prev) => {
      const saved = snap.homeOrder ?? []
      const base = saved.length ? saved : prev
      const ids = snap.services.map((s) => s.id)
      const kept = base.filter((id) => ids.includes(id))
      const added = ids.filter((id) => !kept.includes(id))
      return [...kept, ...added]
    })
  }, [applyHost])

  const loadUpdates = React.useCallback(async () => {
    const d = await api.updates()
    setUpdates(d.updates ?? [])
    setUpdateChecked(d.checkedAt || "")
    setUpdateError(d.error || "")
  }, [])

  React.useEffect(() => {
    let stop = false
    api
      .session()
      .then(async (s) => {
        if (stop) return
        setSetupRequired(s.setupRequired)
        setAuthed(s.authed)
        applyHost(s.host)
        if (s.authed) {
          await refresh()
          await loadUpdates()
        }
        if (!stop) setReady(true)
      })
      .catch((e: Error) => {
        if (stop) return
        setError(e.message)
        setReady(true)
      })
    return () => {
      stop = true
    }
  }, [applyHost, refresh, loadUpdates])

  React.useEffect(() => {
    if (!authed) return
    const id = window.setInterval(() => {
      refresh().catch((e: Error) => setError(e.message))
    }, 3000)
    return () => window.clearInterval(id)
  }, [authed, refresh])

  const shown = React.useMemo(
    () =>
      services.map((s) =>
        overlay[s.id] ? { ...s, status: overlay[s.id] } : s
      ),
    [services, overlay]
  )

  const value = React.useMemo<Store>(
    () => ({
      ready,
      error,
      setupRequired,
      authed,
      host,
      services: shown,
      series,
      dockerError,
      systemdNote,
      homeOrder,
      updates,
      updateChecked,
      updateError,
      setHomeOrder: (ids) => {
        setHomeOrderState(ids)
        void api.saveHome(ids)
      },
      checkUpdates: async () => {
        const d = await api.checkUpdates()
        setUpdates(d.updates ?? [])
        setUpdateChecked(d.checkedAt || "")
        setUpdateError(d.error || "")
      },
      refresh,
      updateMeta: async (id, meta) => {
        const body: ServiceMetaBody = {
          displayName: meta.displayName,
          group: meta.group,
          webUrl: meta.webUrl,
          description: meta.description,
          iconOverride: meta.iconOverride,
          hideOnHome: meta.hideOnHome,
          idleSleep: meta.idleSleep,
        }
        await api.saveMeta(id, body)
        await refresh()
      },
      act: async (id, action, opts) => {
        await api.action(id, action, opts?.removeVolumes)
        await refresh()
      },
      login: async (password, remember) => {
        await api.login(password, remember)
        setAuthed(true)
        setSetupRequired(false)
        await refresh()
      },
      setup: async (password) => {
        await api.setup(password)
        setAuthed(true)
        setSetupRequired(false)
        await refresh()
      },
      logout: async () => {
        await api.logout()
        setAuthed(false)
        setServices([])
        setSeries(emptySeries)
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
    [
      ready,
      error,
      setupRequired,
      authed,
      host,
      shown,
      series,
      dockerError,
      systemdNote,
      homeOrder,
      updates,
      updateChecked,
      updateError,
      refresh,
    ]
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
