// SPDX-License-Identifier: MPL-2.0
"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string
}) {
  const clamped = Math.max(0, Math.min(100, value || 0))
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-white/[0.07]",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full w-full flex-1 bg-gradient-to-r from-[#FF6363] via-[#ff7b6b] to-[#ff9472] transition-transform duration-150 ease-out shadow-[0_0_14px_rgba(255,99,99,0.55)]",
          indicatorClassName
        )}
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
