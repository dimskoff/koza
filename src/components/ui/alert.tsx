// SPDX-License-Identifier: MPL-2.0
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-xl border px-4 py-3.5 text-sm grid has-[>svg]:grid-cols-[18px_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-1 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 backdrop-blur-md",
  {
    variants: {
      variant: {
        default:
          "border-white/10 bg-white/[0.03] text-[var(--kz-mist)] [&>svg]:text-[var(--kz-ash)]",
        destructive:
          "border-red-500/30 bg-red-500/[0.07] text-red-200 [&>svg]:text-red-400 *:data-[slot=alert-description]:text-red-200/80",
        warning:
          "border-amber-500/30 bg-amber-500/[0.07] text-amber-100 [&>svg]:text-amber-400 *:data-[slot=alert-description]:text-amber-200/80",
        coral:
          "border-[var(--kz-coral)]/30 bg-[var(--kz-coral)]/[0.07] text-[var(--kz-paper)] [&>svg]:text-[var(--kz-coral)] *:data-[slot=alert-description]:text-[var(--kz-ash)]",
        emerald:
          "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-100 [&>svg]:text-emerald-400 *:data-[slot=alert-description]:text-emerald-200/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 min-h-4 font-semibold tracking-tight leading-snug",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-[var(--kz-ash)] col-start-2 grid justify-items-start gap-1 text-xs leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
