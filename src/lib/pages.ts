/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* Every top-level page that takes part in skeleton transitions. Plain module
 * (no "use client") so server pages can import the constants as values. */

export type ProductMode = "url" | "box";
export type SubPage = "status" | "docs" | "policy";
export type PageTarget = ProductMode | SubPage;

export const SUBPAGE_PATH: Record<SubPage, string> = {
  status: "/status",
  docs: "/docs",
  policy: "/policy",
};

export const isSubPage = (t: PageTarget | null): t is SubPage =>
  t === "status" || t === "docs" || t === "policy";

export const STATUS_MAIN_CLASS = "flex flex-1 flex-col items-center justify-center px-4 py-8";
