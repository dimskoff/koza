/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * IP intelligence for link rules (country, VPN, datacenter) via public HTTPS
 * APIs — no databases are downloaded or stored.
 *
 *   1. proxycheck.io  — country + direct VPN / proxy verdict (free tier;
 *                       KOZA_PROXYCHECK_KEY raises the daily quota)
 *   2. ipwho.is       — fallback: country + network owner; "datacenter" is
 *                       inferred from the owner (cloud / hosting providers)
 *
 * Privacy: a lookup happens ONLY when a visited link has a country / VPN /
 * datacenter rule. Results live in memory for an hour, never on disk.
 * Plain-HTTP services (ip-api.com free tier) are deliberately not used.
 */

"use strict";

const LOOKUP_TIMEOUT_MS = 1500;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 20_000;
const PROXYCHECK_KEY = (process.env.KOZA_PROXYCHECK_KEY || "").trim();
const DISABLED = /^(0|false|off|no)$/i.test(String(process.env.KOZA_GEO_LOOKUP || ""));

/* network owners that are clouds / hosters / VPN infrastructure */
const DATACENTER_RE = new RegExp(
  [
    "amazon",
    "aws",
    "google",
    "microsoft",
    "azure",
    "digitalocean",
    "hetzner",
    "ovh",
    "linode",
    "akamai",
    "vultr",
    "choopa",
    "contabo",
    "leaseweb",
    "scaleway",
    "online s\\.a\\.s",
    "oracle",
    "alibaba",
    "tencent",
    "huawei cloud",
    "cloudflare",
    "fastly",
    "m247",
    "datacamp",
    "cdn77",
    "hostinger",
    "ionos",
    "godaddy",
    "hostwinds",
    "colocrossing",
    "psychz",
    "quadranet",
    "servers\\.com",
    "selectel",
    "timeweb",
    "beget",
    "reg\\.ru",
    "aeza",
    "ihor",
    "firstbyte",
    "kamatera",
    "upcloud",
    "netcup",
    "worldstream",
    "gcore",
    "g-core",
    "packet",
    "equinix",
    "hosting",
    "datacenter",
    "data center",
    "dedicated",
    "server",
    "vps",
    "cloud",
    "colo",
  ].join("|"),
  "i",
);

const cache = new Map(); // ip → { at, value }
const inflight = new Map(); // ip → Promise

const UNKNOWN = Object.freeze({ country: "", vpn: false, datacenter: false, org: "", source: "none" });

function isPublicIp(ip) {
  if (!ip || ip === "unknown") return false;
  const v4 = ip.replace(/^::ffff:/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return !(v6 === "::1" || v6 === "::" || /^f[cd]/.test(v6) || /^fe80/.test(v6));
}

async function getJson(url) {
  const r = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "koza-link-rules/1" },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`http ${r.status}`);
  return r.json();
}

async function viaProxycheck(ip) {
  const key = PROXYCHECK_KEY ? `&key=${encodeURIComponent(PROXYCHECK_KEY)}` : "";
  const data = await getJson(`https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1&asn=1${key}`);
  const row = data && data[ip];
  if (!row || (data.status !== "ok" && data.status !== "warning")) throw new Error("no answer");
  const org = `${row.provider || ""} ${row.organisation || ""}`.trim();
  const vpn = row.vpn === "yes" || row.proxy === "yes";
  return {
    country: String(row.isocode || "").toUpperCase(),
    vpn,
    datacenter: DATACENTER_RE.test(org) || /hosting|business/i.test(String(row.type || "")),
    org,
    source: "proxycheck.io",
  };
}

async function viaIpwho(ip) {
  const data = await getJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
  if (!data || data.success === false) throw new Error("no answer");
  const org = `${data.connection?.org || ""} ${data.connection?.isp || ""}`.trim();
  const datacenter = DATACENTER_RE.test(org);
  return {
    country: String(data.country_code || "").toUpperCase(),
    /* no VPN verdict here — a datacenter exit is the best available signal */
    vpn: datacenter,
    datacenter,
    org,
    source: "ipwho.is",
  };
}

async function lookupUncached(ip) {
  for (const provider of [viaProxycheck, viaIpwho]) {
    try {
      return await provider(ip);
    } catch {
      /* try the next one */
    }
  }
  return UNKNOWN;
}

/** { country: "DE", vpn, datacenter, org, source } — never throws */
async function lookupIp(ip) {
  if (DISABLED || !isPublicIp(ip)) return UNKNOWN;
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  if (inflight.has(ip)) return inflight.get(ip);

  const p = lookupUncached(ip).then((value) => {
    inflight.delete(ip);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    /* don't pin a failed lookup for an hour — retry in a minute */
    cache.set(ip, { at: value.source === "none" ? Date.now() - CACHE_TTL_MS + 60_000 : Date.now(), value });
    return value;
  });
  inflight.set(ip, p);
  return p;
}

module.exports = { lookupIp, isPublicIp, DATACENTER_RE };
