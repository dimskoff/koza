// SPDX-License-Identifier: MPL-2.0
"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Copy, Terminal } from "lucide-react";
import { toast, Toaster } from "sonner";
import { Badge } from "@/components/ui/badge";
import { KozaFooter, KozaNav } from "./Sections";

interface Endpoint {
  id: string;
  method: "GET" | "POST" | "DELETE";
  path: string;
  summary: string;
  request: string;
  response: string;
  status: string;
}

const BASE = "https://koza.click/api/v1";

const SHORTENER: Endpoint[] = [
  {
    id: "shorten",
    method: "POST",
    path: "/shorten",
    summary: "Create a short link",
    request: `curl -X POST ${BASE}/shorten \\
  -H "content-type: application/json" \\
  -d '{"url": "https://github.com/dimskoff/koza", "slug": "gh", "password": "secret"}'`,
    response: `{
  "link": {
    "slug": "gh",
    "url": "https://github.com/dimskoff/koza",
    "short_url": "https://koza.click/gh",
    "password": true,
    "clicks": 0,
    "created_at": "2026-11-09T12:00:00.000Z"
  }
}`,
    status: "201",
  },
  {
    id: "link-get",
    method: "GET",
    path: "/links/{slug}",
    summary: "Inspect link metadata",
    request: `curl ${BASE}/links/gh`,
    response: `{
  "link": {
    "slug": "gh",
    "url": null,
    "short_url": "https://koza.click/gh",
    "password": true,
    "clicks": 14,
    "created_at": "2026-11-09T12:00:00.000Z"
  }
}`,
    status: "200",
  },
  {
    id: "link-unlock",
    method: "POST",
    path: "/links/{slug}/unlock",
    summary: "Unlock password-protected link",
    request: `curl -X POST ${BASE}/links/gh/unlock \\
  -H "content-type: application/json" \\
  -d '{"password": "secret"}'`,
    response: `{
  "url": "https://github.com/dimskoff/koza",
  "unlocked": true
}`,
    status: "200",
  },
];

const BOX: Endpoint[] = [
  {
    id: "room-create",
    method: "POST",
    path: "/box/rooms",
    summary: "Open a P2P transfer room",
    request: `curl -X POST ${BASE}/box/rooms \\
  -H "content-type: application/json" \\
  -d '{"files": [{"name": "archive.zip", "size": 4821900}], "password": "1234"}'`,
    response: `{
  "room": {
    "code": "K7RXT5",
    "url": "https://box.koza.click/r/K7RXT5",
    "password": true,
    "fingerprint": "0A7E·BB82·CDC4·D3BB",
    "files": [{ "name": "archive.zip", "size": 4821900 }],
    "created_at": "2026-11-09T12:00:00.000Z",
    "expires_at": "2026-11-09T13:00:00.000Z"
  },
  "sender_token": "9f1c8a...64e2"
}`,
    status: "201",
  },
  {
    id: "room-get",
    method: "GET",
    path: "/box/rooms/{code}",
    summary: "Get room manifest",
    request: `curl ${BASE}/box/rooms/K7RXT5`,
    response: `{
  "room": {
    "code": "K7RXT5",
    "url": "https://box.koza.click/r/K7RXT5",
    "password": true,
    "fingerprint": "0A7E·BB82·CDC4·D3BB",
    "files": [{ "name": "archive.zip", "size": 4821900 }]
  }
}`,
    status: "200",
  },
  {
    id: "room-delete",
    method: "DELETE",
    path: "/box/rooms/{code}",
    summary: "Close a room",
    request: `curl -X DELETE ${BASE}/box/rooms/K7RXT5 \\
  -H "x-koza-token: 9f1c8a...64e2"`,
    response: `{
  "deleted": true,
  "code": "K7RXT5"
}`,
    status: "200",
  },
];

function MethodBadge({ method }: { method: Endpoint["method"] }) {
  if (method === "GET") {
    return (
      <Badge variant="emerald" className="min-w-[54px] justify-center rounded-md">
        GET
      </Badge>
    );
  }
  if (method === "POST") {
    return (
      <Badge variant="coral" className="min-w-[54px] justify-center rounded-md">
        POST
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="min-w-[54px] justify-center rounded-md">
      DEL
    </Badge>
  );
}

function CopyButton({ text, label = "Snippet" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            toast.success(`${label} copied`);
            window.setTimeout(() => setDone(false), 1400);
          },
          () => {},
        );
      }}
      className="kz-ghost-btn flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--kz-hairline)] px-2 text-[11px] text-[var(--kz-ash)] hover:text-[var(--kz-mist)]"
      aria-label="Copy code"
    >
      {done ? (
        <>
          <Check className="h-3 w-3 text-emerald-400" />
          <span className="kz-mono text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span className="kz-mono">Copy</span>
        </>
      )}
    </button>
  );
}

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
                    className={isKey ? "text-[var(--kz-mist)]" : "text-emerald-300/80"}
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
                else if (/^(POST|GET|PUT|PATCH|DELETE)$/.test(bare))
                  cls = "text-[var(--kz-coral)]";
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
    <div className="kz-inset overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--kz-hairline)] bg-white/[0.02] px-3 py-1.5">
        <span className="kz-mono text-[10.5px] uppercase tracking-wider text-[var(--kz-smoke)]">
          {label}
        </span>
        <CopyButton text={code} label={label} />
      </div>
      <pre className="kz-mono overflow-x-auto whitespace-pre-wrap break-words px-3.5 py-3 text-[11.5px] leading-[1.7] text-[var(--kz-ash)]">
        <Tinted code={code} />
      </pre>
    </div>
  );
}

function EndpointCard({
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
      className={`kz-edge overflow-hidden transition-colors duration-200 ${
        open ? "border-[rgba(255,99,99,0.28)]" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
        aria-expanded={open}
      >
        <MethodBadge method={ep.method} />
        <span className="kz-mono min-w-0 truncate text-[13px] font-medium text-[var(--kz-mist)]">
          {ep.path}
        </span>
        <span className="ml-auto hidden truncate text-[12px] text-[var(--kz-smoke)] sm:block">
          {ep.summary}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--kz-smoke)] transition-transform duration-300 ease-out ${
            open ? "rotate-180 text-[var(--kz-mist)]" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-[var(--kz-hairline)] p-3.5 sm:p-4">
              <CodeBlock label="request" code={ep.request} />
              <CodeBlock label={`${ep.status} response`} code={ep.response} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ApiDocs() {
  const [openKoza, setOpenKoza] = useState<string | null>("shorten");
  const [openBox, setOpenBox] = useState<string | null>(null);

  return (
    <div className="kz-root flex min-h-dvh flex-col">
      <Toaster
        position="bottom-right"
        gap={8}
        toastOptions={{
          style: {
            background: "rgba(17,18,20,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#e6e6e6",
            borderRadius: "12px",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "13px",
          },
        }}
      />
      <KozaNav />

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-10 pb-16 sm:pt-14">
        <div className="flex flex-col items-center text-center">
          <h1 className="text-balance text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl">
            REST{" "}
            <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
              API
            </span>
            .
          </h1>
          <p className="kz-mono mt-2 text-[12px] text-[var(--kz-smoke)]">
            JSON over HTTPS · no API keys required
          </p>
        </div>

        {/* Base URL bar */}
        <div className="kz-edge mt-6 flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Terminal className="h-4 w-4 shrink-0 text-[var(--kz-coral)]" />
            <span className="kz-mono truncate text-[13px] text-[var(--kz-mist)]">
              {BASE}
            </span>
          </div>
          <CopyButton text={BASE} label="Base URL" />
        </div>

        {/* 01 Shortener */}
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
              01 · Shortener
            </h2>
            <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">koza.click</span>
          </div>
          <div className="space-y-2">
            {SHORTENER.map((ep) => (
              <EndpointCard
                key={ep.id}
                ep={ep}
                open={openKoza === ep.id}
                onToggle={() => setOpenKoza(openKoza === ep.id ? null : ep.id)}
              />
            ))}
          </div>
        </section>

        {/* 02 Box */}
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
              02 · Box
            </h2>
            <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">box.koza.click</span>
          </div>
          <div className="space-y-2">
            {BOX.map((ep) => (
              <EndpointCard
                key={ep.id}
                ep={ep}
                open={openBox === ep.id}
                onToggle={() => setOpenBox(openBox === ep.id ? null : ep.id)}
              />
            ))}
          </div>
        </section>
      </main>

      <KozaFooter />
    </div>
  );
}
