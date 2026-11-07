"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Copy, Terminal } from "lucide-react";
import { KozaFooter, KozaNav } from "./Sections";

/* ── data ────────────────────────────────────────────────────── */

interface Endpoint {
  id: string;
  method: "GET" | "POST" | "DELETE";
  path: string;
  desc: string;
  request: string;
  response: string;
  status: string;
  extra?: string;
}

const BASE = "https://koza.click/api/v1";

const SHORTENER: Endpoint[] = [
  {
    id: "shorten",
    method: "POST",
    path: "/shorten",
    desc: "Mint a short link. Slug is auto-picked unless you claim one.",
    request: `curl -X POST ${BASE}/shorten \\
  -H 'content-type: application/json' \\
  -d '{"url": "https://github.com/dimskoff/koza", "slug": "gh", "password": "open-sesame"}'`,
    response: `{
  "link": {
    "slug": "gh",
    "url": "https://github.com/dimskoff/koza",
    "short_url": "https://koza.click/gh",
    "password": true,
    "clicks": 0,
    "created_at": "2026-11-05T09:00:00.000Z"
  }
}`,
    status: "201",
    extra: "400 · bad url or slug   409 · taken or reserved",
  },
  {
    id: "links",
    method: "GET",
    path: "/links",
    desc: "Every link on this server, newest first.",
    request: `curl ${BASE}/links`,
    response: `{
  "count": 1,
  "links": [
    { "slug": "gh", "url": "https://github.com/dimskoff/koza", "clicks": 3, "…": "…" }
  ]
}`,
    status: "200",
  },
  {
    id: "link-get",
    method: "GET",
    path: "/links/{slug}",
    desc: "Look up one link — destination, lock state, clicks.",
    request: `curl ${BASE}/links/gh`,
    response: `{
  "link": {
    "slug": "gh",
    "url": "https://github.com/dimskoff/koza",
    "short_url": "https://koza.click/gh",
    "password": true,
    "clicks": 3,
    "created_at": "2026-11-05T09:00:00.000Z"
  }
}`,
    status: "200",
    extra: "404 · no such link",
  },
  {
    id: "link-hit",
    method: "POST",
    path: "/links/{slug}/hit",
    desc: "Count a click. The redirect page calls this for you.",
    request: `curl -X POST ${BASE}/links/gh/hit`,
    response: `{ "slug": "gh", "clicks": 4 }`,
    status: "200",
  },
  {
    id: "link-unlock",
    method: "POST",
    path: "/links/{slug}/unlock",
    desc: "Trade the password for the destination url.",
    request: `curl -X POST ${BASE}/links/gh/unlock \\
  -H 'content-type: application/json' \\
  -d '{"password": "open-sesame"}'`,
    response: `{ "url": "https://github.com/dimskoff/koza", "unlocked": true }`,
    status: "200",
    extra: "403 · wrong password",
  },
  {
    id: "link-delete",
    method: "DELETE",
    path: "/links/{slug}",
    desc: "Burn a link. The short url stops resolving immediately.",
    request: `curl -X DELETE ${BASE}/links/gh`,
    response: `{ "deleted": true, "slug": "gh" }`,
    status: "200",
  },
];

const BOX: Endpoint[] = [
  {
    id: "room-create",
    method: "POST",
    path: "/box/rooms",
    desc: "Open a direct line. Returns the code a receiver needs.",
    request: `curl -X POST ${BASE}/box/rooms \\
  -H 'content-type: application/json' \\
  -d '{"files": [{"name": "loop-take-02.wav", "size": 2731860}], "password": "1234"}'`,
    response: `{
  "room": {
    "code": "K7RXT5",
    "url": "https://box.koza.click/r/K7RXT5",
    "password": true,
    "files": [ { "name": "loop-take-02.wav", "size": 2731860 } ],
    "created_at": "2026-11-05T09:00:00.000Z",
    "expires_at": "2026-11-05T10:00:00.000Z"
  },
  "sender_token": "9f1c…64e2"
}`,
    status: "201",
    extra: "400 · bad payload or short password",
  },
  {
    id: "rooms",
    method: "GET",
    path: "/box/rooms",
    desc: "Every live line on this server.",
    request: `curl ${BASE}/box/rooms`,
    response: `{ "count": 1, "rooms": [ { "code": "K7RXT5", "…": "…" } ] }`,
    status: "200",
  },
  {
    id: "room-get",
    method: "GET",
    path: "/box/rooms/{code}",
    desc: "Inspect one line — staged files, lock state, expiry.",
    request: `curl ${BASE}/box/rooms/K7RXT5`,
    response: `{
  "room": {
    "code": "K7RXT5",
    "url": "https://box.koza.click/r/K7RXT5",
    "password": true,
    "files": [ { "name": "loop-take-02.wav", "size": 2731860 } ],
    "created_at": "2026-11-05T09:00:00.000Z",
    "expires_at": "2026-11-05T10:00:00.000Z"
  }
}`,
    status: "200",
    extra: "404 · no such room (or it expired)",
  },
  {
    id: "room-delete",
    method: "DELETE",
    path: "/box/rooms/{code}",
    desc: "Close the line early. Works with x-koza-key — or with the x-koza-token the creator got.",
    request: `curl -X DELETE ${BASE}/box/rooms/K7RXT5 \\
  -H 'x-koza-token: 9f1c…64e2'`,
    response: `{ "deleted": true, "code": "K7RXT5" }`,
    status: "200",
  },
  {
    id: "turn",
    method: "GET",
    path: "/turn",
    desc: "Short-lived TURN credentials for the webrtc handshake (coturn use-auth-secret). Null when the server runs stun-only.",
    request: `curl ${BASE}/turn`,
    response: `{
  "turn": {
    "urls": ["turn:koza.click:3478?transport=udp"],
    "username": "1793871619:koza",
    "credential": "2/xstFwnlJietQVLjbc9CoctAaA=",
    "ttl": 3600
  }
}`,
    status: "200",
  },
];

/* ── pieces ──────────────────────────────────────────────────── */

function MethodBadge({ method }: { method: Endpoint["method"] }) {
  const tone =
    method === "GET"
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
      : method === "POST"
        ? "border-[rgba(255,99,99,0.35)] bg-[rgba(255,99,99,0.1)] text-[var(--kz-coral)]"
        : "border-red-400/25 bg-red-400/10 text-red-300";
  return (
    <span
      className={`kz-mono inline-flex h-6 min-w-[62px] items-center justify-center rounded-md border px-2 text-[10.5px] font-medium tracking-wide ${tone}`}
    >
      {method}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1200);
          },
          () => {},
        );
      }}
      className="kz-ghost-btn flex h-7 w-7 items-center justify-center rounded-md border border-[var(--kz-hairline)]"
      aria-label="Copy to clipboard"
    >
      {done ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/* tiny syntax tint — strings green, flags/verbs coral, numbers bright.
   every line wraps, nothing ever scrolls. */
function Tinted({ code }: { code: string }) {
  return (
    <>
      {code.split("\n").map((line, li) => {
        const parts = line.split(/('[^']*'|"[^"]*")/g);
        return (
          <span key={li} className="block">
            {parts.map((part, pi) => {
              if (part.startsWith("'") || part.startsWith('"')) {
                const isKey = /^\s*:/.test(parts[pi + 1] ?? "");
                return (
                  <span
                    key={pi}
                    className={isKey ? "text-[var(--kz-mist)]" : "text-emerald-300/75"}
                  >
                    {part}
                  </span>
                );
              }
              return part.split(/(\s+)/).map((word, wi) => {
                if (/^\s*$/.test(word)) return word;
                const bare = word.replace(/[^a-zA-Z0-9.+-]/g, "");
                let cls = "";
                if (/^-[a-zA-Z-]+$/.test(bare)) cls = "text-[var(--kz-coral)]";
                else if (/^(POST|GET|PUT|PATCH|DELETE)$/.test(bare)) cls = "text-[var(--kz-coral)]";
                else if (bare === "curl") cls = "text-[var(--kz-mist)]";
                else if (/^(true|false|null)$/.test(bare) || /^\d/.test(bare))
                  cls = "text-[var(--kz-mist)]";
                return cls ? (
                  <span key={`${pi}.${wi}`} className={cls}>
                    {word}
                  </span>
                ) : (
                  word
                );
              });
            })}
          </span>
        );
      })}
    </>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="kz-inset min-w-0">
      <div className="flex items-center justify-between border-b border-[var(--kz-hairline)] px-3 py-2">
        <span className="kz-mono text-[10px] uppercase tracking-wider text-[var(--kz-smoke)]">
          {label}
        </span>
        <CopyButton text={code} />
      </div>
      <pre className="kz-mono whitespace-pre-wrap break-words px-3 py-3 text-[11.5px] leading-[1.75] text-[var(--kz-ash)]">
        <Tinted code={code} />
      </pre>
    </div>
  );
}

function EndpointRow({
  ep,
  open,
  onToggle,
}: {
  ep: Endpoint;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`kz-edge overflow-hidden transition-colors ${open ? "border-[rgba(255,99,99,0.28)]" : ""}`}
    >
      <button
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <MethodBadge method={ep.method} />
        <span className="kz-mono min-w-0 truncate text-[13px] text-[var(--kz-mist)]">
          {ep.path}
        </span>
        <span className="ml-auto hidden min-w-0 flex-1 truncate text-right text-[12px] text-[var(--kz-smoke)] lg:block">
          {ep.desc}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--kz-smoke)] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <p className="kz-mono px-4 pb-3.5 text-[11.5px] text-[var(--kz-smoke)] lg:hidden">
        {ep.desc}
      </p>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--kz-hairline)] px-4 py-4">
              <div className="flex flex-col gap-3">
                <CodeBlock label="request" code={ep.request} />
                <CodeBlock label={`${ep.status} response`} code={ep.response} />
              </div>
              {ep.extra && (
                <p className="kz-mono mt-3 text-[10.5px] text-[var(--kz-smoke)]">{ep.extra}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({
  index,
  title,
  note,
  endpoints,
  openId,
  setOpenId,
}: {
  index: string;
  title: string;
  note: string;
  endpoints: Endpoint[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="kz-mono text-[11px] uppercase tracking-[0.22em] text-[var(--kz-smoke)]">
          {index} · {title}
        </h2>
        <span className="kz-mono hidden text-[10.5px] text-[var(--kz-smoke)] sm:block">
          {note}
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-2.5">
        {endpoints.map((ep) => (
          <EndpointRow
            key={ep.id}
            ep={ep}
            open={openId === ep.id}
            onToggle={() => setOpenId(openId === ep.id ? null : ep.id)}
          />
        ))}
      </div>
    </section>
  );
}

/* ── page ────────────────────────────────────────────────────── */

export function ApiDocs() {
  const [openKoza, setOpenKoza] = useState<string | null>("shorten");
  const [openBox, setOpenBox] = useState<string | null>(null);

  return (
    <div className="kz-root flex min-h-dvh flex-col">
      <KozaNav />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-12">
        <h1 className="text-balance text-center text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl">
          The koza{" "}
          <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
            API
          </span>
          .
        </h1>
        <p className="mx-auto mt-3 max-w-md text-center text-[14px] leading-relaxed text-[var(--kz-ash)]">
          Everything the sites do, over plain HTTP — mint links, count clicks, open direct lines.
          No keys, no tokens.
        </p>

        {/* base url */}
        <div className="kz-key mt-8 flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Terminal className="h-4 w-4 shrink-0 text-[var(--kz-coral)]" />
            <span className="kz-mono min-w-0 truncate text-[13px] text-[var(--kz-mist)]">
              {BASE}
            </span>
          </div>
          <CopyButton text={BASE} />
        </div>
        <p className="kz-mono mt-2.5 text-center text-[10.5px] text-[var(--kz-smoke)]">
          the index at{" "}
          <a href="/api/v1" className="text-[var(--kz-ash)] underline decoration-[var(--kz-hairline-strong)] underline-offset-2 hover:text-[var(--kz-mist)]">
            /api/v1
          </a>{" "}
          answers json too — point curl anywhere below
        </p>

        <Section
          index="01"
          title="Shortener"
          note="links die with the server — it is a demo, be gentle"
          endpoints={SHORTENER}
          openId={openKoza}
          setOpenId={setOpenKoza}
        />
        <Section
          index="02"
          title="Box"
          note="rooms expire after one hour"
          endpoints={BOX}
          openId={openBox}
          setOpenId={setOpenBox}
        />

        {/* ground rules */}
        <div className="kz-edge mt-12 px-5 py-4">
          <p className="kz-mono text-[10.5px] uppercase tracking-wider text-[var(--kz-smoke)]">
            ground rules
          </p>
          <ul className="kz-mono mt-2.5 flex flex-col gap-1.5 text-[11.5px] text-[var(--kz-ash)]">
            <li>· in-memory demo store — resets when the server process does</li>
            <li>· passwords live as a tiny digest, never in plain text</li>
            <li>· no auth, no rate limits — be nice, it&apos;s a zoo animal</li>
          </ul>
        </div>
      </main>

      <KozaFooter />
    </div>
  );
}
