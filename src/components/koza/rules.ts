// SPDX-License-Identifier: MPL-2.0
/* Link rules — client-side model, labels and presets.
   Mirrors server/rules.js (the server re-validates everything). */

export type FieldId =
  | "country"
  | "vpn"
  | "datacenter"
  | "ip"
  | "ip_burst"
  | "visits"
  | "param"
  | "device"
  | "os"
  | "language"
  | "referrer"
  | "date"
  | "random";

export type ActionId = "redirect" | "password" | "notice" | "block";

export interface CondDraft {
  id: string;
  field: FieldId;
  op: string;
  value: string;
  key: string;
}

export interface RuleDraft {
  id: string;
  when: CondDraft[];
  action: ActionId;
  url: string;
  password: string;
  text: string;
}

type ValueKind = "none" | "text" | "number" | "percent" | "select" | "date" | "param";

export interface FieldMeta {
  label: string;
  /** shown in the field picker */
  hint: string;
  ops: { id: string; label: string }[];
  kind: ValueKind;
  placeholder?: string;
  suffix?: string;
  options?: { id: string; label: string }[];
  /** uses a third-party IP lookup (shown in the UI) */
  geo?: boolean;
}

const IS = [
  { id: "is", label: "is" },
  { id: "is_not", label: "is not" },
];

export const FIELDS: Record<FieldId, FieldMeta> = {
  country: { label: "Country", hint: "by IP", ops: IS, kind: "text", placeholder: "RU, UA, KZ", geo: true },
  vpn: {
    label: "VPN / proxy",
    hint: "visitor hides behind one",
    ops: [
      { id: "is", label: "is used" },
      { id: "is_not", label: "is not used" },
    ],
    kind: "none",
    geo: true,
  },
  datacenter: {
    label: "Datacenter IP",
    hint: "cloud / hosting / servers",
    ops: [
      { id: "is", label: "yes" },
      { id: "is_not", label: "no" },
    ],
    kind: "none",
    geo: true,
  },
  ip: { label: "IP address", hint: "or subnet", ops: IS, kind: "text", placeholder: "1.2.3.4, 10.0.0.0/8" },
  ip_burst: {
    label: "IP burst",
    hint: "same IP hammering the link",
    ops: [{ id: "gt", label: "more than" }],
    kind: "number",
    placeholder: "10",
    suffix: "hits / min",
  },
  visits: {
    label: "Visits",
    hint: "total clicks so far",
    ops: [
      { id: "gt", label: "more than" },
      { id: "lt", label: "less than" },
    ],
    kind: "number",
    placeholder: "100",
  },
  param: {
    label: "URL parameter",
    hint: "koza.click/x?src=tg",
    ops: [
      { id: "is", label: "equals" },
      { id: "is_not", label: "not equals" },
      { id: "contains", label: "contains" },
      { id: "exists", label: "is present" },
    ],
    kind: "param",
    placeholder: "tg",
  },
  device: {
    label: "Device",
    hint: "phone, tablet, computer, bot",
    ops: IS,
    kind: "select",
    options: [
      { id: "mobile", label: "phone" },
      { id: "tablet", label: "tablet" },
      { id: "desktop", label: "computer" },
      { id: "bot", label: "bot / link preview" },
    ],
  },
  os: {
    label: "System",
    hint: "iOS, Android, Windows…",
    ops: IS,
    kind: "select",
    options: [
      { id: "ios", label: "iOS" },
      { id: "android", label: "Android" },
      { id: "windows", label: "Windows" },
      { id: "macos", label: "macOS" },
      { id: "linux", label: "Linux" },
    ],
  },
  language: { label: "Language", hint: "of the browser", ops: IS, kind: "text", placeholder: "ru, uk, en" },
  referrer: {
    label: "Came from",
    hint: "the page with the link",
    ops: [
      { id: "contains", label: "contains" },
      { id: "not_contains", label: "doesn't contain" },
    ],
    kind: "text",
    placeholder: "t.me",
  },
  date: {
    label: "Date",
    hint: "time-limited links",
    ops: [
      { id: "before", label: "before" },
      { id: "after", label: "after" },
    ],
    kind: "date",
  },
  random: {
    label: "Random share",
    hint: "A/B split",
    ops: [{ id: "lt", label: "first" }],
    kind: "percent",
    placeholder: "50",
    suffix: "% of visitors",
  },
};

export const FIELD_ORDER: FieldId[] = [
  "device",
  "os",
  "country",
  "vpn",
  "datacenter",
  "language",
  "param",
  "referrer",
  "visits",
  "date",
  "random",
  "ip",
  "ip_burst",
];

export const ACTIONS: { id: ActionId; label: string; placeholder: string }[] = [
  { id: "redirect", label: "Redirect to", placeholder: "https://another-link.com" },
  { id: "notice", label: "Show a notice", placeholder: "Message shown before continuing…" },
  { id: "password", label: "Ask for a password", placeholder: "min 4 characters" },
  { id: "block", label: "Block access", placeholder: "Message (optional)" },
];

export const MAX_RULES = 10;
export const MAX_CONDITIONS = 5;

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/* datetime-local value for "now + days" */
function localIn(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function newCondition(field: FieldId = "device"): CondDraft {
  const meta = FIELDS[field];
  return {
    id: uid(),
    field,
    op: meta.ops[0].id,
    value: meta.kind === "select" ? meta.options![0].id : meta.kind === "date" ? localIn(7) : "",
    key: field === "param" ? "src" : "",
  };
}

export function newRule(partial: Partial<RuleDraft> = {}): RuleDraft {
  return { id: uid(), when: [], action: "redirect", url: "", password: "", text: "", ...partial };
}

/* one-click starting points — "rules that make sense" */
export const PRESETS: { id: string; label: string; desc: string; make: () => RuleDraft }[] = [
  {
    id: "ios",
    label: "iPhone → App Store",
    desc: "iPhone users go to your app's page",
    make: () =>
      newRule({
        when: [{ ...newCondition("os"), value: "ios" }],
        action: "redirect",
        url: "https://apps.apple.com/",
      }),
  },
  {
    id: "android",
    label: "Android → Google Play",
    desc: "Android users go to the Play Store",
    make: () =>
      newRule({
        when: [{ ...newCondition("os"), value: "android" }],
        action: "redirect",
        url: "https://play.google.com/store/apps/",
      }),
  },
  {
    id: "bots",
    label: "Block bots",
    desc: "Crawlers and link previews can't open it",
    make: () => newRule({ when: [{ ...newCondition("device"), value: "bot" }], action: "block" }),
  },
  {
    id: "vpn",
    label: "Block VPN",
    desc: "Visitors behind a VPN or proxy are stopped",
    make: () =>
      newRule({
        when: [newCondition("vpn")],
        action: "block",
        text: "Turn off your VPN to open this link.",
      }),
  },
  {
    id: "country",
    label: "Only one country",
    desc: "Everyone outside it is blocked",
    make: () =>
      newRule({
        when: [{ ...newCondition("country"), op: "is_not", value: "RU" }],
        action: "block",
        text: "This link isn't available in your region.",
      }),
  },
  {
    id: "limit",
    label: "First 100 visits",
    desc: "The link stops working after 100 clicks",
    make: () =>
      newRule({
        when: [{ ...newCondition("visits"), value: "100" }],
        action: "block",
        text: "This link has reached its limit.",
      }),
  },
  {
    id: "expire",
    label: "Expires in a week",
    desc: "Stops working on a date you pick",
    make: () =>
      newRule({
        when: [{ ...newCondition("date"), op: "after" }],
        action: "block",
        text: "This link has expired.",
      }),
  },
  {
    id: "ab",
    label: "A/B split 50/50",
    desc: "Half the visitors go to another page",
    make: () => newRule({ when: [{ ...newCondition("random"), value: "50" }], action: "redirect" }),
  },
  {
    id: "warn",
    label: "Warn before leaving",
    desc: "Show a message with a Continue button",
    make: () =>
      newRule({ when: [], action: "notice", text: "You are leaving for an external site. Continue?" }),
  },
  {
    id: "burst",
    label: "Stop click spam",
    desc: "Block an IP that clicks 10+ times a minute",
    make: () =>
      newRule({
        when: [{ ...newCondition("ip_burst"), value: "10" }],
        action: "block",
        text: "Too many visits — try again in a minute.",
      }),
  },
];

/* drafts → API payload (server validates again) */
export function toApiRules(rules: RuleDraft[]) {
  return rules.map((r) => ({
    when: r.when.map((c) => {
      const meta = FIELDS[c.field];
      const out: Record<string, string> = { field: c.field, op: c.op };
      if (meta.kind === "date") out.value = c.value ? new Date(c.value).toISOString() : "";
      else if (meta.kind !== "none" && !(c.field === "param" && c.op === "exists")) out.value = c.value.trim();
      if (c.field === "param") out.key = c.key.trim();
      return out;
    }),
    then: {
      action: r.action,
      ...(r.action === "redirect" ? { url: r.url.trim() } : {}),
      ...(r.action === "password" ? { password: r.password } : {}),
      ...(r.action === "notice" || r.action === "block" ? { text: r.text } : {}),
    },
  }));
}

/* "If phone and Russia → redirect" — one-line summary for collapsed views */
export function summarize(r: RuleDraft): string {
  const cond = r.when.length ? r.when.map((c) => FIELDS[c.field].label).join(" + ") : "Always";
  const act = ACTIONS.find((a) => a.id === r.action)?.label ?? r.action;
  return `${cond} → ${act.toLowerCase()}`;
}
