// SPDX-License-Identifier: MPL-2.0
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1.5 [&>svg]:pointer-events-none transition-colors overflow-hidden kz-mono",
  {
    variants: {
      variant: {
        default:
          "border-white/10 bg-white/[0.06] text-[var(--kz-mist)]",
        secondary:
          "border-white/[0.08] bg-white/[0.03] text-[var(--kz-ash)]",
        destructive:
          "border-red-500/30 bg-red-500/10 text-red-300",
        outline:
          "border-white/15 bg-transparent text-[var(--kz-ash)]",
        coral:
          "border-[var(--kz-coral)]/30 bg-[var(--kz-coral)]/10 text-[var(--kz-coral)]",
        emerald:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        amber:
          "border-amber-500/30 bg-amber-500/10 text-amber-300",
        sky:
          "border-sky-500/30 bg-sky-500/10 text-sky-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
