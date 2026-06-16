import { cn } from "@/lib/utils"
import type { UiStatus } from "@/lib/manus"
import { Loader2, CircleCheck, CircleAlert, CirclePause, Clock } from "lucide-react"

const CONFIG: Record<
  UiStatus,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }>; spin?: boolean }
> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground", icon: Clock },
  running: { label: "Running", className: "bg-blue-100 text-blue-700", icon: Loader2, spin: true },
  waiting: { label: "Needs you", className: "bg-amber-100 text-amber-700", icon: CircleAlert },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700", icon: CircleCheck },
  stopped: { label: "Completed", className: "bg-emerald-100 text-emerald-700", icon: CircleCheck },
  error: { label: "Error", className: "bg-red-100 text-red-700", icon: CircleAlert },
}

export function StatusBadge({ status, className }: { status: UiStatus; className?: string }) {
  const cfg = CONFIG[status] ?? CONFIG.running
  const Icon = cfg.icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        cfg.className,
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", cfg.spin && "animate-spin")} />
      {cfg.label}
    </span>
  )
}
