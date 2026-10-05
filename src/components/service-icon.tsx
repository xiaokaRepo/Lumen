import * as React from "react"
import { IconBox, IconServer2, IconTerminal2 } from "@tabler/icons-react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"
import { resolveIconChain, type IconRef } from "@/lib/icons"
import type { ServiceKind } from "@/mock/data"

const SIZES = {
  sm: "size-7 p-1 rounded-md",
  md: "size-9 p-1.5 rounded-lg",
  lg: "size-14 p-2.5 rounded-xl",
  xl: "size-16 p-3 rounded-xl",
}

export function ServiceIcon({
  match,
  override,
  kind = "container",
  size = "md",
  className,
  layoutId,
}: {
  match: string
  override?: IconRef
  kind?: ServiceKind
  size?: keyof typeof SIZES
  className?: string
  layoutId?: string
}) {
  const chain = React.useMemo(
    () => resolveIconChain(match, override),
    [match, override]
  )
  const [idx, setIdx] = React.useState(0)
  const key = chain.join("|")
  const [prevKey, setPrevKey] = React.useState(key)
  if (prevKey !== key) {
    setPrevKey(key)
    setIdx(0)
  }

  const src = chain[idx]
  const Fallback =
    kind === "systemd"
      ? IconServer2
      : kind === "process"
        ? IconTerminal2
        : IconBox

  const inner = src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="size-full object-contain"
      onError={() => setIdx((i) => i + 1)}
    />
  ) : (
    <Fallback className="size-full text-muted-foreground" stroke={1.5} />
  )
  const cls = cn(
    "inline-flex shrink-0 items-center justify-center bg-muted ring-1 ring-foreground/5",
    SIZES[size],
    className
  )
  if (layoutId) {
    return (
      <motion.span
        layoutId={layoutId}
        transition={{ layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
        className={cls}
      >
        {inner}
      </motion.span>
    )
  }
  return <span className={cls}>{inner}</span>
}
