import * as React from "react"
import { motion, useReducedMotion } from "motion/react"

const finished = new Set<string>()

/** Stagger only on the first visit. Later filter or refresh updates stay still. */
export function useEnterOnce(key: string) {
  const [play, setPlay] = React.useState(() => !finished.has(key))
  React.useEffect(() => {
    if (finished.has(key)) return
    const id = window.setTimeout(() => {
      finished.add(key)
      setPlay(false)
    }, 700)
    return () => window.clearTimeout(id)
  }, [key])
  return play
}

const ease = [0.22, 1, 0.36, 1] as const

export function enterDelay(index: number) {
  return Math.min(index, 10) * 0.025
}

export function EnterBlock({
  show,
  index,
  className,
  children,
}: {
  show: boolean
  index: number
  className?: string
  children: React.ReactNode
}) {
  const reduce = useReducedMotion()
  const active = show && !reduce
  return (
    <motion.div
      className={className}
      initial={active ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.22,
        delay: active ? enterDelay(index) : 0,
        ease,
      }}
    >
      {children}
    </motion.div>
  )
}
