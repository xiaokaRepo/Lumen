import * as React from "react"
import { useSearchParams } from "react-router-dom"
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"

export type ViewState = "ready" | "loading" | "empty" | "error"

/** Prototype only: `?state=loading|empty|error` previews non-happy states. */
export function useViewState(): ViewState {
  const [params] = useSearchParams()
  const s = params.get("state")
  return s === "loading" || s === "empty" || s === "error" ? s : "ready"
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}

export function TableSkeleton({
  rows = 8,
  cols = 5,
}: {
  rows?: number
  cols?: number
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid items-center gap-4"
          style={{ gridTemplateColumns: `2.5rem 2fr repeat(${cols - 1}, 1fr)` }}
        >
          <Skeleton className="size-8 rounded-lg" />
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-3.5"
              style={{ width: `${55 + ((r * 7 + c * 13) % 40)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <Empty className="border py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <Empty className="border border-destructive/30 py-16">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="bg-destructive/10 text-destructive"
        >
          <IconAlertTriangle />
        </EmptyMedia>
        <EmptyTitle>无法连接 Docker</EmptyTitle>
        <EmptyDescription>
          {message ??
            "读取 /var/run/docker.sock 失败：permission denied。请确认容器以 privileged 运行并挂载了 docker.sock。"}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm">
          <IconRefresh data-icon="inline-start" />
          重试
        </Button>
      </EmptyContent>
    </Empty>
  )
}
