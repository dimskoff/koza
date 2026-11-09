// SPDX-License-Identifier: MPL-2.0
import * as React from "react"
import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "kz-mono pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-[5px] border border-[var(--kz-hairline-strong)] bg-white/[0.04] px-1.5 font-sans text-[10.5px] font-medium text-[var(--kz-ash)] select-none [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
