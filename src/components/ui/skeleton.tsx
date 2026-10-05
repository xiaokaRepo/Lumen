import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("lumen-shimmer rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
