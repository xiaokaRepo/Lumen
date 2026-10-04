import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"

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
    <ChartContainer
      config={config}
      className={cn("w-full", className)}
      style={{ height }}
    >
      <AreaChart data={data} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
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
  )
}

export function Sparkline({
  data,
  className,
}: {
  data: { v: number }[]
  className?: string
}) {
  return (
    <ChartContainer
      config={{ v: { label: "v", color: "var(--foreground)" } }}
      className={cn("aspect-auto h-8 w-full", className)}
    >
      <AreaChart data={data} margin={{ left: 0, right: 0, top: 2, bottom: 0 }}>
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
  )
}
