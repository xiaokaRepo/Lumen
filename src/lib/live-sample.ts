import * as React from "react"

import { host, series } from "@/mock/data"

export interface SamplePoint {
  t: string
  v: number
}

export interface LiveSample {
  cpu: number
  memGB: number
  rx: number
  tx: number
  cpuSeries: SamplePoint[]
  memSeries: SamplePoint[]
  rxSeries: SamplePoint[]
  txSeries: SamplePoint[]
}

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function push(points: SamplePoint[], next: number): SamplePoint[] {
  return [...points.slice(1), { t: stamp(), v: Math.round(next * 10) / 10 }]
}

function drift(
  cur: number,
  base: number,
  amp: number,
  min: number,
  max: number
) {
  const n = cur + (Math.random() - 0.48) * amp
  const pulled = n + (base - n) * 0.15
  return Math.round(Math.min(max, Math.max(min, pulled)) * 10) / 10
}

const initial: LiveSample = {
  cpu: host.cpuPercent,
  memGB: host.memUsedGB,
  rx: host.netRxMBs,
  tx: host.netTxMBs,
  cpuSeries: series(7, 60, host.cpuPercent, 8),
  memSeries: series(11, 60, (host.memUsedGB / host.memTotalGB) * 100, 2),
  rxSeries: series(21, 60, host.netRxMBs, 1.4, 0, 40),
  txSeries: series(29, 60, host.netTxMBs, 0.6, 0, 40),
}

let sample = initial
const listeners = new Set<() => void>()
let timer: number | undefined

function tick() {
  const cpu = drift(sample.cpu, host.cpuPercent, 3.2, 4, 96)
  const memGB = drift(
    sample.memGB,
    host.memUsedGB,
    0.12,
    4,
    host.memTotalGB - 0.4
  )
  const rx = drift(sample.rx, host.netRxMBs, 0.8, 0.1, 40)
  const tx = drift(sample.tx, host.netTxMBs, 0.35, 0.05, 20)
  sample = {
    cpu,
    memGB,
    rx,
    tx,
    cpuSeries: push(sample.cpuSeries, cpu),
    memSeries: push(sample.memSeries, (memGB / host.memTotalGB) * 100),
    rxSeries: push(sample.rxSeries, rx),
    txSeries: push(sample.txSeries, tx),
  }
  listeners.forEach((l) => l())
}

function ensure() {
  if (timer !== undefined) return
  timer = window.setInterval(tick, 2500)
}

export function useLiveSample() {
  React.useEffect(() => {
    ensure()
  }, [])
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => sample,
    () => sample
  )
}
