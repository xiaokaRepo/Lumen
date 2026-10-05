import * as React from "react"
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"

const ease = [0.22, 1, 0.36, 1] as const

function signatureOf(data: Record<string, number | string>[]) {
  const last = data[data.length - 1]
  return `${data.length}:${last?.t ?? ""}`
}

/** Slides the plot left when a point is appended. Recharts itself does not redraw. */
function ChartSlide({
  signature,
  className,
  style,
  children,
}: {
  signature: string
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const reduce = useReducedMotion()
  const ref = React.useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const prev = React.useRef(signature)

  React.useEffect(() => {
    const before = prev.current
    prev.current = signature
    if (reduce || before === signature) return
    const w = ref.current?.clientWidth ?? 0
    const n = Number(signature.split(":")[0]) || 1
    const step = w / Math.max(n - 1, 1)
    x.set(step)
    const controls = animate(x, 0, { duration: 0.28, ease })
    return () => controls.stop()
  }, [signature, reduce, x])

  return (
    <div ref={ref} className={cn("overflow-hidden", className)} style={style}>
      <motion.div style={{ x }} className="h-full w-full">
        {children}
      </motion.div>
    </div>
  )
}

export function MetricChart({
  data,
  config,
  unit = "%",
  max,
  height = 180,
  className,
}: {
  data: Record<string, number | string>[]
  config: ChartConfig
  unit?: string
  max?: number
  height?: number
  className?: string
}) {
  const keys = Object.keys(config)
  return (
    <ChartSlide
      signature={signatureOf(data)}
      className={className}
      style={{ height }}
    >
      <ChartContainer config={config} className="aspect-auto h-full w-full">
        <AreaChart
          data={data}
          margin={{ left: 0, right: 4, top: 8, bottom: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            tickMargin={8}
            className="tabular"
          />
          <YAxis
            width={40}
            tickLine={false}
            axisLine={false}
            domain={[0, max ?? "auto"]}
            tickFormatter={(v) => `${v}${unit === "%" ? "%" : ""}`}
            className="tabular"
          />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent indicator="line" />}
          />
          {keys.map((k) => (
            <Area
              key={k}
              dataKey={k}
              type="monotone"
              stroke={`var(--color-${k})`}
              fill={`var(--color-${k})`}
              fillOpacity={0.12}
              strokeWidth={1.5}
              isAnimationActive={false}
              dot={false}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </ChartSlide>
  )
}

export function Sparkline({
  data,
  className,
}: {
  data: { t?: string; v: number }[]
  className?: string
}) {
  return (
    <ChartSlide
      signature={signatureOf(data as Record<string, number | string>[])}
      className={cn("h-8 w-full", className)}
    >
      <ChartContainer
        config={{ v: { label: "v", color: "var(--foreground)" } }}
        className="aspect-auto h-full w-full"
      >
        <AreaChart
          data={data}
          margin={{ left: 0, right: 0, top: 2, bottom: 0 }}
        >
          <Area
            dataKey="v"
            type="monotone"
            stroke="var(--color-v)"
            strokeOpacity={0.7}
            fill="var(--color-v)"
            fillOpacity={0.06}
            strokeWidth={1.25}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ChartContainer>
    </ChartSlide>
  )
}
