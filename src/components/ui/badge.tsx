import { STATUS_BADGE_COLORS, normalizeStatus, statusColorClass } from '@/lib/status-colors'
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-[var(--brand-primary)] text-white [a&]:hover:bg-[var(--brand-primary-hover)]",
        secondary:
          "border-[#d4d4d4] bg-[#f7f7f7] text-primary [a&]:hover:bg-[#d4d4d4]",
        destructive:
          "border-[var(--brand-danger)] bg-[var(--brand-danger)] text-white focus-visible:ring-[var(--brand-danger)]/20 [a&]:hover:bg-[var(--brand-danger-hover)]",
        outline:
          "border-[#d4d4d4] bg-white text-primary [a&]:hover:border-black [a&]:hover:bg-[#f7f7f7]",
        ghost: "[a&]:hover:bg-muted",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        // ── Status variants ──
        // Semantic tones that replace the string-returning getStatusColor()
        // helper. Use these directly for record-status badges (PENDING,
        // APPROVED, REJECTED, etc.) and the existing payroll/leave/dtr
        // status enums map to them via the helper in lib/status.ts.
        success: "status-approved",
        warning: "status-warning",
        info: "status-info",
        pending: "status-neutral",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  status,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean; status?: string }) {
  const Comp = asChild ? Slot.Root : "span"
  const label = status ?? React.Children.toArray(props.children).filter(child => typeof child === 'string').join('')
  const statusKey = normalizeStatus(label)
  const statusClass = STATUS_BADGE_COLORS[statusKey] ? statusColorClass(statusKey) : undefined

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className, statusClass)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
