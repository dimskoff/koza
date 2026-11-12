// SPDX-License-Identifier: MPL-2.0
import { redirect } from "next/navigation";
import { getSite } from "@/lib/site";

/* /box on the main host is handled by middleware; this is the fallback. */
export default function BoxPage() {
  redirect(getSite().boxUrl);
}
