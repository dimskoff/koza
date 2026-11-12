// SPDX-License-Identifier: MPL-2.0
import type { ProductMode } from "./transition";

const accent =
  "bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent";

/* the hero line of each product */
export function Headline({ product }: { product: ProductMode }) {
  return (
    <h1 className="text-balance text-center text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl">
      {product === "box" ? (
        <>
          Files that travel <span className={accent}>straight</span>.
        </>
      ) : (
        <>
          Short links, <span className={accent}>zero strings</span>.
        </>
      )}
    </h1>
  );
}
