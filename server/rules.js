/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Link rules: "IF <conditions> THEN <action>", checked top to bottom, the
 * first matching rule wins; no match → the link's normal destination.
 *
 *   rule      = { when: Condition[], then: Action }      (when = [] → always)
 *   Condition = { field, op, value?, key? }               (all must match)
 *   Action    = { action: "redirect", url }
 *             | { action: "password", password }          (stored as scrypt)
 *             | { action: "notice", text }                 (interstitial + Continue)
 *             | { action: "block", text? }
 */

"use strict";

const net = require("node:net");

const MAX_RULES = 10;
const MAX_CONDITIONS = 5;
const MAX_TEXT = 500;
const MAX_VALUE = 300;

/* field → allowed operators; "kind" drives validation of `value` */
const FIELDS = {
  country: { ops: ["is", "is_not"], kind: "codes" }, // "RU, UA"
  vpn: { ops: ["is", "is_not"], kind: "none" }, // VPN / proxy
  datacenter: { ops: ["is", "is_not"], kind: "none" }, // cloud / hosting IP
  ip: { ops: ["is", "is_not"], kind: "cidrs" }, // "1.2.3.4, 10.0.0.0/8"
  ip_burst: { ops: ["gt"], kind: "int" }, // hits from the same IP per minute
  visits: { ops: ["gt", "lt"], kind: "int" }, // total clicks so far
  param: { ops: ["is", "is_not", "contains", "exists"], kind: "param" }, // ?key=value
  device: { ops: ["is", "is_not"], kind: "enum", values: ["mobile", "tablet", "desktop", "bot"] },
  os: { ops: ["is", "is_not"], kind: "enum", values: ["ios", "android", "windows", "macos", "linux"] },
  language: { ops: ["is", "is_not"], kind: "codes" }, // "ru, uk"
  referrer: { ops: ["contains", "not_contains"], kind: "text" }, // "t.me"
  date: { ops: ["before", "after"], kind: "date" }, // ISO date-time
  random: { ops: ["lt"], kind: "percent" }, // A/B split: random < 30 %
};

const ACTIONS = ["redirect", "password", "notice", "block"];

/* conditions that need an IP lookup (third-party API) */
const GEO_FIELDS = new Set(["country", "vpn", "datacenter"]);

class RuleError extends Error {}

const clean = (v, max = MAX_VALUE) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);

/* messages keep their line breaks (max 3 blank lines in a row) */
const cleanText = (v, max = MAX_TEXT) =>
  String(v ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);

const list = (v) =>
  clean(v)
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

function validateCondition(c, where) {
  if (!c || typeof c !== "object") throw new RuleError(`${where}: bad condition`);
  const field = String(c.field || "");
  const spec = FIELDS[field];
  if (!spec) throw new RuleError(`${where}: unknown condition "${field}"`);
  const op = String(c.op || "");
  if (!spec.ops.includes(op)) throw new RuleError(`${where}: "${op}" can't be used with ${field}`);
  const out = { field, op };

  switch (spec.kind) {
    case "none":
      break;
    case "codes": {
      const codes = list(c.value).map((s) => s.toLowerCase());
      if (!codes.length || codes.some((s) => !/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(s))) {
        throw new RuleError(`${where}: use codes like RU, US, DE`);
      }
      out.value = codes.join(",");
      break;
    }
    case "cidrs": {
      const items = list(c.value);
      if (!items.length || items.length > 50) throw new RuleError(`${where}: list 1–50 IPs or subnets`);
      for (const it of items) {
        const [addr, bits] = it.split("/");
        const fam = net.isIP(addr);
        const max = fam === 6 ? 128 : 32;
        if (!fam || (bits !== undefined && !(Number(bits) >= 0 && Number(bits) <= max))) {
          throw new RuleError(`${where}: "${it}" is not an IP or subnet`);
        }
      }
      out.value = items.join(",");
      break;
    }
    case "int": {
      const n = Number(c.value);
      if (!Number.isInteger(n) || n < 0 || n > 1e9) throw new RuleError(`${where}: enter a whole number`);
      out.value = String(n);
      break;
    }
    case "percent": {
      const n = Number(c.value);
      if (!(n > 0 && n < 100)) throw new RuleError(`${where}: percent must be between 1 and 99`);
      out.value = String(Math.round(n));
      break;
    }
    case "enum": {
      const v = clean(c.value).toLowerCase();
      if (!spec.values.includes(v)) throw new RuleError(`${where}: pick one of ${spec.values.join(", ")}`);
      out.value = v;
      break;
    }
    case "param": {
      const key = clean(c.key, 64);
      if (!/^[\w.\-[\]]{1,64}$/.test(key)) throw new RuleError(`${where}: parameter name like "ref"`);
      out.key = key;
      if (op !== "exists") {
        const v = clean(c.value);
        if (!v) throw new RuleError(`${where}: parameter value is empty`);
        out.value = v;
      }
      break;
    }
    case "text": {
      const v = clean(c.value).toLowerCase();
      if (!v) throw new RuleError(`${where}: text is empty`);
      out.value = v;
      break;
    }
    case "date": {
      const t = Date.parse(clean(c.value));
      if (!Number.isFinite(t)) throw new RuleError(`${where}: pick a date`);
      out.value = new Date(t).toISOString();
      break;
    }
  }
  return out;
}

/* Validates user input. `normalizeUrl` / `destinationError` come from the
 * server so redirect targets follow the same rules as the main link.
 * Returns rules with `password` still in plain text (hashed by the caller). */
async function validateRules(input, { normalizeUrl, destinationError }) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new RuleError("rules must be a list");
  if (input.length > MAX_RULES) throw new RuleError(`at most ${MAX_RULES} rules`);

  const out = [];
  for (let i = 0; i < input.length; i++) {
    const r = input[i];
    const where = `rule ${i + 1}`;
    if (!r || typeof r !== "object") throw new RuleError(`${where}: bad rule`);
    const when = Array.isArray(r.when) ? r.when : [];
    if (when.length > MAX_CONDITIONS) throw new RuleError(`${where}: at most ${MAX_CONDITIONS} conditions`);
    const conditions = when.map((c, k) => validateCondition(c, `${where}, condition ${k + 1}`));

    const t = r.then || {};
    const action = String(t.action || "");
    if (!ACTIONS.includes(action)) throw new RuleError(`${where}: choose what happens`);
    const then = { action };
    if (action === "redirect") {
      const url = normalizeUrl(t.url);
      if (!url) throw new RuleError(`${where}: redirect target is not a valid link`);
      const bad = await destinationError(url);
      if (bad) throw new RuleError(`${where}: ${bad}`);
      then.url = url;
    } else if (action === "password") {
      const pw = String(t.password ?? "").trim();
      if (pw.length < 4) throw new RuleError(`${where}: password needs at least 4 characters`);
      then.password = pw;
    } else if (action === "notice") {
      const text = cleanText(t.text);
      if (!text) throw new RuleError(`${where}: write the message to show`);
      then.text = text;
    } else if (action === "block") {
      const text = cleanText(t.text);
      if (text) then.text = text;
    }
    out.push({ when: conditions, then });
  }
  return out;
}

/* ── visitor context ─────────────────────────────────────────────────── */

function deviceOf(ua) {
  const s = String(ua || "");
  if (!s) return "bot";
  if (
    /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|curl|wget|python|httpclient|okhttp|go-http|headless/i.test(
      s,
    )
  ) {
    return "bot";
  }
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/i.test(s)) return "mobile";
  return "desktop";
}

function osOf(ua) {
  const s = String(ua || "");
  if (/iphone|ipad|ipod/i.test(s)) return "ios";
  if (/android/i.test(s)) return "android";
  if (/windows/i.test(s)) return "windows";
  if (/mac os x|macintosh/i.test(s)) return "macos";
  if (/linux|cros/i.test(s)) return "linux";
  return "";
}

const primaryLang = (accept) =>
  String(accept || "")
    .split(",")[0]
    .trim()
    .toLowerCase();

function ipInList(ip, value) {
  const fam = net.isIP(ip.replace(/^::ffff:/, "")) || 0;
  if (!fam) return false;
  const bare = ip.replace(/^::ffff:/, "");
  const bl = new net.BlockList();
  for (const it of value.split(",")) {
    const [addr, bits] = it.split("/");
    const type = net.isIP(addr) === 6 ? "ipv6" : "ipv4";
    try {
      if (bits === undefined) bl.addAddress(addr, type);
      else bl.addSubnet(addr, Number(bits), type);
    } catch {
      /* validated on save; ignore anything odd */
    }
  }
  return bl.check(bare, fam === 6 ? "ipv6" : "ipv4");
}

/* ctx: { ip, ua, lang, referrer, query: URLSearchParams, now, clicks, burst,
 *        geo: () => Promise<{country, vpn, datacenter}> } */
async function conditionMatches(c, ctx) {
  const pos = (yes) => (c.op === "is_not" || c.op === "not_contains" ? !yes : yes);
  switch (c.field) {
    case "country": {
      const g = await ctx.geo();
      return pos(Boolean(g.country) && c.value.split(",").includes(g.country.toLowerCase()));
    }
    case "vpn":
      return pos((await ctx.geo()).vpn);
    case "datacenter":
      return pos((await ctx.geo()).datacenter);
    case "ip":
      return pos(ipInList(ctx.ip, c.value));
    case "ip_burst":
      return ctx.burst > Number(c.value);
    case "visits":
      return c.op === "gt" ? ctx.clicks > Number(c.value) : ctx.clicks < Number(c.value);
    case "param": {
      const has = ctx.query.has(c.key);
      const v = ctx.query.get(c.key) ?? "";
      if (c.op === "exists") return has;
      if (c.op === "contains") return has && v.toLowerCase().includes(c.value.toLowerCase());
      return pos(has && v === c.value);
    }
    case "device":
      return pos(deviceOf(ctx.ua) === c.value);
    case "os":
      return pos(osOf(ctx.ua) === c.value);
    case "language": {
      const lang = primaryLang(ctx.lang);
      return pos(c.value.split(",").some((code) => lang === code || lang.startsWith(`${code}-`)));
    }
    case "referrer":
      return pos(String(ctx.referrer || "").toLowerCase().includes(c.value));
    case "date": {
      const t = Date.parse(c.value);
      return c.op === "before" ? ctx.now < t : ctx.now >= t;
    }
    case "random":
      return Math.random() * 100 < Number(c.value);
    default:
      return false;
  }
}

/* index of the first matching rule, or -1 */
async function firstMatch(rules, ctx) {
  for (let i = 0; i < rules.length; i++) {
    let all = true;
    for (const c of rules[i].when) {
      if (!(await conditionMatches(c, ctx))) {
        all = false;
        break;
      }
    }
    if (all) return i;
  }
  return -1;
}

const needsGeo = (rules) => rules.some((r) => r.when.some((c) => GEO_FIELDS.has(c.field)));

/* what the public API may reveal about a rule (no targets, no hashes) */
function publicRule(r) {
  return {
    when: r.when,
    then: { action: r.then.action, ...(r.then.action === "notice" || r.then.action === "block" ? { text: r.then.text || "" } : {}) },
  };
}

module.exports = {
  FIELDS,
  ACTIONS,
  MAX_RULES,
  MAX_CONDITIONS,
  RuleError,
  validateRules,
  firstMatch,
  needsGeo,
  deviceOf,
  osOf,
  publicRule,
};
