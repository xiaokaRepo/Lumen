import NumberFlow from "@number-flow/react"

import { cn } from "@/lib/utils"

const timing = {
  duration: 280,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const

/** Tabular number that rolls when the value changes. Stays under 300ms. */
export function NumberRoll({
  value,
  suffix,
  prefix,
  digits = 1,
  className,
}: {
  value: number
  suffix?: string
  prefix?: string
  digits?: number
  className?: string
}) {
  return (
    <NumberFlow
      value={value}
      prefix={prefix}
      suffix={suffix}
      locales="zh-CN"
      format={{
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }}
      transformTiming={timing}
      spinTiming={timing}
      opacityTiming={{ duration: 200, easing: "ease-out" }}
      respectMotionPreference
      className={cn("tabular", className)}
    />
  )
}
