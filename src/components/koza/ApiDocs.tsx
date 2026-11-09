// SPDX-License-Identifier: MPL-2.0
"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Copy, Terminal } from "lucide-react";
import { toast, Toaster } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KozaFooter, KozaNav } from "./Sections";

interface Endpoint {
  id: string;
  method: "GET" | "POST" | "DELETE";
  path: string;
  summary: string;
  request: string;
  response: string;
  status: string;
  note?: string;
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
    status: "201 Created",
    note: "slug & password are optional · 409 if slug is taken",
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
    status: "200 OK",
    note: "url is null when password-locked until unlocked via POST /unlock",
  },
  {
    id: "link-unlock",
    method: "POST",
    path: "/links/{slug}/unlock",
    summary: "Verify password & reveal URL",
    request: `curl -X POST ${BASE}/links/gh/unlock \\
  -H "content-type: application/json" \\
  -d '{"password": "secret"}'`,
    response: `{
  "url": "https://github.com/dimskoff/koza",
  "unlocked": true
}`,
    status: "200 OK",
    note: "403 on wrong password · verified with salted scrypt",
  },
  {
    id: "link-hit",
    method: "POST",
    path: "/links/{slug}/hit",
    summary: "Increment click counter",
    request: `curl -X POST ${BASE}/links/gh/hit`,
    response: `{
  "slug": "gh",
  "clicks": 15
}`,
    status: "200 OK",
  },
  {
    id: "links",
    method: "GET",
    path: "/links",
    summary: "List recent public links",
    request: `curl ${BASE}/links`,
    response: `{
  "count": 1,
  "links": [
    {
      "slug": "gh",
      "url": null,
      "password": true,
      "clicks": 15,
      "created_at": "2026-11-09T12:00:00.000Z"
    }
  ]
}`,
    status: "200 OK",
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
    status: "201 Created",
    note: "keep sender_token to authenticate WebSocket signaling or close the room",
  },
  {
    id: "room-get",
    method: "GET",
    path: "/box/rooms/{code}",
    summary: "Get room manifest & fingerprint",
    request: `curl ${BASE}/box/rooms/K7RXT5`,
    response: `{
  "room": {
    "code": "K7RXT5",
    "url": "https://box.koza.click/r/K7RXT5",
    "password": true,
    "fingerprint": "0A7E·BB82·CDC4·D3BB",
    "files": [{ "name": "archive.zip", "size": 4821900 }],
    "created_at": "2026-11-09T12:00:00.000Z",
    "expires_at": "2026-11-09T13:00:00.000Z"
  }
}`,
    status: "200 OK",
    note: "404 if the sender closed their tab or the 1h TTL expired",
  },
  {
    id: "room-delete",
    method: "DELETE",
    path: "/box/rooms/{code}",
    summary: "Close a room immediately",
    request: `curl -X DELETE ${BASE}/box/rooms/K7RXT5 \\
  -H "x-koza-token: 9f1c8a...64e2"`,
    response: `{
  "deleted": true,
  "code": "K7RXT5"
}`,
    status: "200 OK",
  },
  {
    id: "turn",
    method: "GET",
    path: "/turn",
    summary: "Ephemeral WebRTC ICE / TURN credentials",
    request: `curl ${BASE}/turn`,
    response: `{
  "turn": {
    "urls": ["turn:koza.click:3478?transport=udp"],
    "username": "1793871619:koza",
    "credential": "2/xstFwnlJietQVLjbc9CoctAaA=",
    "ttl": 3600
  }
}`,
    status: "200 OK",
  },
  {
    id: "stats",
    method: "GET",
    path: "/stats",
    summary: "Node health & live telemetry",
    request: `curl ${BASE}/stats`,
    response: `{
  "status": "ok",
  "version": "2.2.0",
  "links_count": 42,
  "total_clicks": 318,
  "rooms_count": 1,
  "active_lines": 1
}`,
    status: "200 OK",
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
      className={`kz-edge overflow-hidden transition-colors ${
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
          className={`h-4 w-4 shrink-0 text-[var(--kz-smoke)] transition-transform duration-200 ${
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
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--kz-hairline)] p-3.5 sm:p-4">
              <Tabs defaultValue="req" className="w-full">
                <div className="kz-inset overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[var(--kz-hairline)] bg-white/[0.02] px-3 py-1.5">
                    <TabsList className="h-7 bg-transparent p-0 gap-1">
                      <TabsTrigger
                        value="req"
                        className="kz-mono h-6 rounded-md px-2.5 text-[11px] data-[state=active]:bg-white/[0.08] data-[state=active]:text-[var(--kz-mist)] text-[var(--kz-smoke)]"
                      >
                        cURL
                      </TabsTrigger>
                      <TabsTrigger
                        value="res"
                        className="kz-mono h-6 rounded-md px-2.5 text-[11px] data-[state=active]:bg-white/[0.08] data-[state=active]:text-[var(--kz-mist)] text-[var(--kz-smoke)]"
                      >
                        {ep.status}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="req" className="m-0 flex-none">
                      <CopyButton text={ep.request} label="cURL request" />
                    </TabsContent>
                    <TabsContent value="res" className="m-0 flex-none">
                      <CopyButton text={ep.response} label="JSON response" />
                    </TabsContent>
                  </div>

                  <TabsContent value="req" className="m-0">
                    <pre className="kz-mono overflow-x-auto whitespace-pre-wrap break-words px-3.5 py-3 text-[11.5px] leading-[1.7] text-[var(--kz-ash)]">
                      <Tinted code={ep.request} />
                    </pre>
                  </TabsContent>
                  <TabsContent value="res" className="m-0">
                    <pre className="kz-mono overflow-x-auto whitespace-pre-wrap break-words px-3.5 py-3 text-[11.5px] leading-[1.7] text-[var(--kz-ash)]">
                      <Tinted code={ep.response} />
                    </pre>
                  </TabsContent>
                </div>
              </Tabs>

              {ep.note && (
                <p className="kz-mono mt-2.5 px-1 text-[11px] text-[var(--kz-smoke)]">
                  {ep.note}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ApiDocs() {
  const [openId, setOpenId] = useState<string | null>("shorten");

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

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-10 pb-16 sm:pt-14">
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
          <div className="flex items-center gap-2">
            <Kbd className="hidden sm:inline-flex">v2.2</Kbd>
            <CopyButton text={BASE} label="Base URL" />
          </div>
        </div>

        {/* Shadcn Tabs for Shortener / Box / Specs */}
        <Tabs
          defaultValue="shortener"
          onValueChange={(v) => {
            if (v === "shortener") setOpenId("shorten");
            if (v === "box") setOpenId("room-create");
          }}
          className="mt-6 w-full"
        >
          <div className="flex items-center justify-between gap-3">
            <TabsList className="h-9 rounded-xl border border-[var(--kz-hairline)] bg-white/[0.03] p-1">
              <TabsTrigger
                value="shortener"
                className="kz-mono rounded-lg px-3.5 text-[12px] data-[state=active]:bg-white/[0.09] data-[state=active]:text-[var(--kz-mist)] text-[var(--kz-smoke)]"
              >
                Shortener
              </TabsTrigger>
              <TabsTrigger
                value="box"
                className="kz-mono rounded-lg px-3.5 text-[12px] data-[state=active]:bg-white/[0.09] data-[state=active]:text-[var(--kz-mist)] text-[var(--kz-smoke)]"
              >
                Box P2P
              </TabsTrigger>
              <TabsTrigger
                value="specs"
                className="kz-mono rounded-lg px-3.5 text-[12px] data-[state=active]:bg-white/[0.09] data-[state=active]:text-[var(--kz-mist)] text-[var(--kz-smoke)]"
              >
                Limits & Specs
              </TabsTrigger>
            </TabsList>

            <a
              href="/api/v1"
              target="_blank"
              rel="noopener noreferrer"
              className="kz-mono hidden text-[11px] text-[var(--kz-smoke)] transition-colors hover:text-[var(--kz-mist)] sm:inline"
            >
              raw /api/v1 ↗
            </a>
          </div>

          <TabsContent value="shortener" className="mt-3 space-y-2">
            {SHORTENER.map((ep) => (
              <EndpointCard
                key={ep.id}
                ep={ep}
                open={openId === ep.id}
                onToggle={() => setOpenId(openId === ep.id ? null : ep.id)}
              />
            ))}
          </TabsContent>

          <TabsContent value="box" className="mt-3 space-y-2">
            {BOX.map((ep) => (
              <EndpointCard
                key={ep.id}
                ep={ep}
                open={openId === ep.id}
                onToggle={() => setOpenId(openId === ep.id ? null : ep.id)}
              />
            ))}
          </TabsContent>

          <TabsContent value="specs" className="mt-3">
            <div className="kz-edge divide-y divide-[var(--kz-hairline)] overflow-hidden">
              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div>
                  <p className="text-[13.5px] font-medium text-[var(--kz-mist)]">
                    Link storage
                  </p>
                  <p className="kz-mono mt-0.5 text-[11.5px] text-[var(--kz-smoke)]">
                    Persistent atomic store · instant 307 server redirects
                  </p>
                </div>
                <Badge variant="emerald">Persistent</Badge>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div>
                  <p className="text-[13.5px] font-medium text-[var(--kz-mist)]">
                    Password protection
                  </p>
                  <p className="kz-mono mt-0.5 text-[11.5px] text-[var(--kz-smoke)]">
                    Salted scrypt digest (`N=16384`) · destination hidden until unlocked
                  </p>
                </div>
                <Badge variant="coral">scrypt</Badge>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div>
                  <p className="text-[13.5px] font-medium text-[var(--kz-mist)]">
                    Box room lifecycle
                  </p>
                  <p className="kz-mono mt-0.5 text-[11.5px] text-[var(--kz-smoke)]">
                    Zero disk storage · rooms close on tab exit or after 60 minutes
                  </p>
                </div>
                <Badge variant="secondary">1h TTL</Badge>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div>
                  <p className="text-[13.5px] font-medium text-[var(--kz-mist)]">
                    Rate limits
                  </p>
                  <p className="kz-mono mt-0.5 text-[11.5px] text-[var(--kz-smoke)]">
                    30 req/min for link & room creation · 20 req/min for password unlock
                  </p>
                </div>
                <Badge variant="outline">Per IP</Badge>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <KozaFooter />
    </div>
  );
}
