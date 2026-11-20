// SPDX-License-Identifier: MPL-2.0
"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronDown, Globe, Plus, Sparkles, Trash2, Waypoints, X } from "lucide-react";
import {
  ACTIONS,
  FIELD_ORDER,
  FIELDS,
  MAX_CONDITIONS,
  MAX_RULES,
  newCondition,
  newRule,
  PRESETS,
  type CondDraft,
  type FieldId,
  type RuleDraft,
} from "./rules";

const inputCls =
  "kz-mono h-8 min-w-0 rounded-md border border-[var(--kz-hairline)] bg-white/[0.03] px-2.5 text-[12.5px] text-[var(--kz-mist)] outline-none transition-colors placeholder:text-[var(--kz-smoke)] focus:border-[rgba(255,99,99,0.45)]";

function Select({
  value,
  onChange,
  options,
  label,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={`${inputCls} w-full cursor-pointer appearance-none pr-7`}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} className="bg-[#111214] text-[var(--kz-mist)]">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--kz-smoke)]" />
    </span>
  );
}

function ConditionRow({
  c,
  onChange,
  onRemove,
}: {
  c: CondDraft;
  onChange: (c: CondDraft) => void;
  onRemove: () => void;
}) {
  const meta = FIELDS[c.field];
  const setField = (field: string) => {
    const fresh = newCondition(field as FieldId);
    onChange({ ...fresh, id: c.id });
  };
  const showValue = meta.kind !== "none" && !(c.field === "param" && c.op === "exists");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        label="Condition"
        value={c.field}
        onChange={setField}
        options={FIELD_ORDER.map((f) => ({ id: f, label: FIELDS[f].label }))}
        className="w-[128px]"
      />
      {c.field === "param" && (
        <input
          value={c.key}
          onChange={(e) => onChange({ ...c, key: e.target.value })}
          placeholder="name"
          aria-label="Parameter name"
          spellCheck={false}
          className={`${inputCls} w-[84px]`}
        />
      )}
      <Select
        label="Operator"
        value={c.op}
        onChange={(op) => onChange({ ...c, op })}
        options={meta.ops}
        className="w-[108px]"
      />
      {showValue &&
        (meta.kind === "select" ? (
          <Select
            label="Value"
            value={c.value}
            onChange={(value) => onChange({ ...c, value })}
            options={meta.options!}
            className="min-w-[120px] flex-1"
          />
        ) : (
          <input
            value={c.value}
            onChange={(e) => onChange({ ...c, value: e.target.value })}
            type={meta.kind === "date" ? "datetime-local" : meta.kind === "text" ? "text" : "number"}
            min={meta.kind === "percent" ? 1 : meta.kind === "number" ? 0 : undefined}
            max={meta.kind === "percent" ? 99 : undefined}
            placeholder={meta.placeholder}
            aria-label="Value"
            spellCheck={false}
            className={`${inputCls} min-w-[96px] flex-1 [color-scheme:dark]`}
          />
        ))}
      {meta.suffix && <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">{meta.suffix}</span>}
      {meta.geo && (
        <span title="Checked by IP lookup (proxycheck.io / ipwho.is)" className="text-[var(--kz-smoke)]">
          <Globe className="h-3.5 w-3.5" />
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="kz-ghost-btn ml-auto rounded-md p-1"
        aria-label="Remove condition"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function RuleCard({
  r,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  r: RuleDraft;
  index: number;
  count: number;
  onChange: (r: RuleDraft) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const action = ACTIONS.find((a) => a.id === r.action)!;
  const tag = "kz-mono w-9 shrink-0 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider";

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, filter: "blur(4px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.22 }}
      className="kz-inset p-3"
    >
      <div className="flex gap-2">
        <span className={`${tag} text-[var(--kz-coral)]`}>if</span>
        <div className="min-w-0 flex-1 space-y-1.5">
          {r.when.length === 0 && (
            <p className="kz-mono pt-1.5 text-[12px] text-[var(--kz-ash)]">
              always <span className="text-[var(--kz-smoke)]">— every visitor</span>
            </p>
          )}
          {r.when.map((c, k) => (
            <div key={c.id}>
              {k > 0 && <span className="kz-mono mb-1 block text-[10px] uppercase text-[var(--kz-smoke)]">and</span>}
              <ConditionRow
                c={c}
                onChange={(nc) => onChange({ ...r, when: r.when.map((x) => (x.id === c.id ? nc : x)) })}
                onRemove={() => onChange({ ...r, when: r.when.filter((x) => x.id !== c.id) })}
              />
            </div>
          ))}
          {r.when.length < MAX_CONDITIONS && (
            <button
              type="button"
              onClick={() => onChange({ ...r, when: [...r.when, newCondition()] })}
              className="kz-mono flex cursor-pointer items-center gap-1 pt-0.5 text-[11.5px] text-[var(--kz-ash)] hover:text-[var(--kz-mist)]"
            >
              <Plus className="h-3 w-3" /> {r.when.length ? "and…" : "add a condition"}
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-0.5">
          <span className="kz-mono px-1 pt-1.5 text-[10.5px] text-[var(--kz-smoke)]">#{index + 1}</span>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="kz-ghost-btn rounded-md p-1 disabled:opacity-30"
            aria-label="Move rule up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            className="kz-ghost-btn rounded-md p-1 disabled:opacity-30"
            aria-label="Move rule down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="kz-ghost-btn rounded-md p-1 hover:text-red-400"
            aria-label="Delete rule"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2.5 flex gap-2 border-t border-[var(--kz-hairline)] pt-2.5">
        <span className={`${tag} text-emerald-400/90`}>then</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-1.5">
          <Select
            label="Action"
            value={r.action}
            onChange={(a) => onChange({ ...r, action: a as RuleDraft["action"] })}
            options={ACTIONS}
            className="w-[150px]"
          />
          {r.action === "notice" ? (
            <textarea
              value={r.text}
              onChange={(e) => onChange({ ...r, text: e.target.value })}
              placeholder={action.placeholder}
              maxLength={500}
              rows={2}
              aria-label="Notice text"
              className={`${inputCls} h-auto min-h-8 min-w-[180px] flex-1 resize-y py-1.5 font-sans`}
            />
          ) : (
            <input
              value={r.action === "redirect" ? r.url : r.action === "password" ? r.password : r.text}
              onChange={(e) =>
                onChange({
                  ...r,
                  ...(r.action === "redirect"
                    ? { url: e.target.value }
                    : r.action === "password"
                      ? { password: e.target.value }
                      : { text: e.target.value }),
                })
              }
              type={r.action === "password" ? "password" : "text"}
              placeholder={action.placeholder}
              maxLength={r.action === "redirect" ? 2048 : 500}
              aria-label={action.label}
              spellCheck={false}
              className={`${inputCls} min-w-[180px] flex-1`}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Rules modal ──────────────────────────────────────────────────────
   Hidden behind a small "Rules" button so the shortener stays compact.
   Empty state = ready-made scenarios as cards (one click each); every
   rule then reads like a sentence: IF … THEN …. */
export function RulesModal({
  open,
  onClose,
  rules,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  rules: RuleDraft[];
  /* functional updates, so quick successive clicks never drop a change */
  onChange: Dispatch<SetStateAction<RuleDraft[]>>;
}) {
  const add = (r: RuleDraft) => onChange((prev) => (prev.length < MAX_RULES ? [...prev, r] : prev));
  const move = (i: number, dir: -1 | 1) =>
    onChange((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Link rules"
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[var(--kz-hairline-strong)] bg-[#0c0d0f] shadow-[0_24px_80px_rgba(0,0,0,0.6)] sm:rounded-2xl"
          >
            {/* header */}
            <div className="flex items-start justify-between gap-4 border-b border-[var(--kz-hairline)] px-5 py-4">
              <div>
                <p className="flex items-center gap-2 text-[16px] font-medium text-[var(--kz-mist)]">
                  <Waypoints className="h-4 w-4 text-[var(--kz-coral)]" />
                  Link rules
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--kz-smoke)]">
                  Decide who goes where. Rules are checked top to bottom — the first one that fits
                  wins. Everyone else simply opens your link.
                </p>
              </div>
              <button type="button" onClick={onClose} className="kz-ghost-btn rounded-lg p-1.5" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* body */}
            <div className="kz-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {rules.length === 0 ? (
                <>
                  <p className="kz-mono mb-2.5 text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
                    Pick a scenario
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => add(p.make())}
                        className="kz-inset group cursor-pointer px-3.5 py-3 text-left transition-colors hover:bg-white/[0.05]"
                      >
                        <p className="text-[13.5px] font-medium text-[var(--kz-mist)] group-hover:text-white">
                          {p.label}
                        </p>
                        <p className="mt-0.5 text-[12px] text-[var(--kz-smoke)]">{p.desc}</p>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => add(newRule({ when: [newCondition()] }))}
                    className="kz-mono mt-3 flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--kz-ash)] hover:text-[var(--kz-mist)]"
                  >
                    <Plus className="h-3.5 w-3.5 text-[var(--kz-coral)]" /> or build your own rule
                  </button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {rules.map((r, i) => (
                        <RuleCard
                          key={r.id}
                          r={r}
                          index={i}
                          count={rules.length}
                          onChange={(nr) => onChange((prev) => prev.map((x) => (x.id === r.id ? nr : x)))}
                          onRemove={() => onChange((prev) => prev.filter((x) => x.id !== r.id))}
                          onMove={(dir) => move(i, dir)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>

                  {rules.length < MAX_RULES && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => add(newRule({ when: [newCondition()] }))}
                        className="kz-inset flex w-full cursor-pointer items-center gap-2 border border-dashed border-[var(--kz-hairline-strong)] px-3 py-2.5 text-left text-[13px] text-[var(--kz-smoke)] transition-colors hover:text-[var(--kz-ash)]"
                      >
                        <Plus className="h-3.5 w-3.5 text-[var(--kz-coral)]" />
                        Add a rule
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-[var(--kz-smoke)]" />
                        {PRESETS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            title={p.desc}
                            onClick={() => add(p.make())}
                            className="kz-mono cursor-pointer rounded-full border border-[var(--kz-hairline)] bg-white/[0.02] px-2.5 py-1 text-[11px] text-[var(--kz-ash)] transition-colors hover:border-[rgba(255,99,99,0.4)] hover:text-[var(--kz-mist)]"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* footer */}
            <div className="flex items-center justify-between gap-3 border-t border-[var(--kz-hairline)] px-5 py-3">
              <span className="kz-mono flex items-center gap-1.5 text-[11px] text-[var(--kz-smoke)]">
                {rules.some((r) => r.when.some((c) => FIELDS[c.field].geo)) && (
                  <>
                    <Globe className="h-3 w-3" /> country / VPN checked by IP lookup ·{" "}
                  </>
                )}
                {rules.length}/{MAX_RULES} rules
              </span>
              <div className="flex items-center gap-2">
                {rules.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="kz-mono cursor-pointer rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--kz-ash)] hover:text-[var(--kz-coral)]"
                  >
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="kz-cta flex h-9 cursor-pointer items-center rounded-[9px] px-4 text-[13px]"
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
