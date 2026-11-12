/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* Single source of truth for the public domains of this instance.
 *
 * Server: read from env at runtime (KOZA_HOST / KOZA_BOX_HOST / KOZA_BASE_URL),
 *         so one Docker image works for any domain without rebuilding.
 * Client: the root layout injects the same values into window.__KOZA_SITE__
 *         before hydration, so server and client render identical markup. */

export interface SiteConfig {
  /** main host, e.g. "koza.click" */
  host: string;
  /** file-transfer host, e.g. "box.koza.click" */
  boxHost: string;
  /** canonical origin, e.g. "https://koza.click" */
  baseUrl: string;
  /** box origin, e.g. "https://box.koza.click" */
  boxUrl: string;
  /** source repository link shown in the footer */
  repoUrl: string;
  /** explicit signaling WebSocket URL; empty = same host + /signal */
  signalUrl: string;
}

declare global {
  interface Window {
    __KOZA_SITE__?: SiteConfig;
  }
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");

function fromEnv(): SiteConfig {
  const host = (process.env.KOZA_HOST || "localhost:3000").trim().toLowerCase();
  const boxHost = (process.env.KOZA_BOX_HOST || `box.${host}`).trim().toLowerCase();
  const local = host.startsWith("localhost") || host.startsWith("127.");
  const proto = local ? "http" : "https";
  return {
    host,
    boxHost,
    baseUrl: trimSlash(process.env.KOZA_BASE_URL || `${proto}://${host}`),
    boxUrl: trimSlash(process.env.KOZA_BOX_URL || `${proto}://${boxHost}`),
    repoUrl: trimSlash(process.env.KOZA_REPO_URL || "https://github.com/dimskoff/koza"),
    signalUrl: (process.env.KOZA_SIGNAL_URL || "").trim(),
  };
}

export function getSite(): SiteConfig {
  if (typeof window !== "undefined" && window.__KOZA_SITE__) return window.__KOZA_SITE__;
  return fromEnv();
}

/** true when the request/page is served on the box host */
export function isBoxHost(hostHeader: string | null | undefined): boolean {
  const h = (hostHeader || "").toLowerCase();
  if (!h) return false;
  const { boxHost } = getSite();
  return h === boxHost || h.startsWith("box.");
}

export const shortUrlOf = (slug: string) => `${getSite().baseUrl}/${slug}`;
export const roomUrlOf = (code: string) => `${getSite().boxUrl}/r/${code}`;
