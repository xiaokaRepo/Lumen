import * as React from "react"
import { IconCopy } from "@tabler/icons-react"
import { motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

async function writeText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const el = document.createElement("textarea")
    el.value = text
    el.setAttribute("readonly", "")
    el.style.position = "fixed"
    el.style.left = "-9999px"
    document.body.appendChild(el)
    el.select()
    document.execCommand("copy")
    el.remove()
  }
}

export function CopyButton({
  text,
  label = "复制",
  toastLabel,
  children,
  className,
  variant = "ghost",
  size = "icon-sm",
}: {
  text: string
  label?: string
  toastLabel?: string
  children?: React.ReactNode
  className?: string
  variant?: React.ComponentProps<typeof Button>["variant"]
  size?: React.ComponentProps<typeof Button>["size"]
}) {
  const [copied, setCopied] = React.useState(false)
  const reduce = useReducedMotion()
  const timer = React.useRef<number>(0)

  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      aria-label={copied ? "已复制" : label}
      onClick={() => {
        void writeText(text)
        setCopied(true)
        toast.success(toastLabel ?? "已复制")
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), 1400)
      }}
    >
      <span className="relative inline-flex size-4 items-center justify-center">
        <IconCopy
          className={cn(
            "size-4 transition-opacity duration-200 ease-out",
            copied ? "opacity-0" : "opacity-100"
          )}
        />
        <svg
          viewBox="0 0 24 24"
          className={cn(
            "absolute size-4 transition-opacity duration-200 ease-out",
            copied ? "opacity-100" : "opacity-0"
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <motion.path
            d="M5 12.5 9.5 17 19 7.5"
            initial={false}
            animate={{ pathLength: copied && !reduce ? 1 : copied ? 1 : 0 }}
            transition={{
              duration: reduce ? 0 : 0.28,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        </svg>
      </span>
      {children}
    </Button>
  )
}
