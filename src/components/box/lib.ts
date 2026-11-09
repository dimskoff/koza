// SPDX-License-Identifier: MPL-2.0
/* box.koza.click — client-side transfer helpers & metrics */

export interface BoxFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface TransferSummary {
  id: string;
  code: string;
  files: number;
  totalBytes: number;
  durationMs: number;
  encrypted: boolean;
  createdAt: number;
}

const STORE_KEY = "box_transfers_v1";
const MAX_RECORDS = 20;

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ234567892"; // 32 chars, no lookalikes

export function roomCode(): string {
  let out = "";
  const buf = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < 6; i++) {
      out += CODE_ALPHABET[buf[i] & 31];
    }
    return out;
  }
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function shortLinkOf(code: string): string {
  return `https://box.koza.click/r/${code}`;
}

export function roomLinkOf(code: string): string {
  return `https://box.koza.click/r/${code}`;
}

export function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function fmtDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return `${s}s`;
}

/* human speed: 18.1 MB/s · 940 KB/s · 1.2 GB/s */
export function fmtSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "—";
  const mb = 1024 * 1024;
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < mb) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  if (bytesPerSec < 1024 * mb) return `${(bytesPerSec / mb).toFixed(1)} MB/s`;
  return `${(bytesPerSec / (1024 * mb)).toFixed(2)} GB/s`;
}

/* compact pair for metric cells: "5.1 / 60.0 MB" */
export function prettyPair(moved: number, total: number): string {
  const mb = 1024 * 1024;
  let scale = 1;
  let digits = 0;
  if (total >= 1024 * mb) {
    scale = 1024 * mb;
    digits = 2;
  } else if (total >= mb) {
    scale = mb;
    digits = 1;
  } else if (total >= 1024) {
    scale = 1024;
    digits = 1;
  }
  const unit =
    scale === 1024 * mb ? " GB" : scale === mb ? " MB" : scale === 1024 ? " KB" : " B";
  return `${(moved / scale).toFixed(digits)} / ${(total / scale).toFixed(digits)}${unit}`;
}

/* human eta: 40s · 2m 40s · 1h 04m · — */
export function fmtEta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${Math.max(1, s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

/* sliding-window throughput meter with a light ewma */
export class SpeedMeter {
  private samples: { t: number; bytes: number }[] = [];
  private smoothed = 0;

  push(totalBytes: number, now = Date.now()): number {
    if (this.samples.length > 0 && now === this.samples[this.samples.length - 1].t) {
      this.samples[this.samples.length - 1].bytes = totalBytes;
    } else {
      this.samples.push({ t: now, bytes: totalBytes });
    }
    while (this.samples.length > 1 && now - this.samples[0].t > 2500) {
      this.samples.shift();
    }
    const first = this.samples[0];
    const dt = (now - first.t) / 1000;
    let instant = 0;
    if (dt > 0.25) {
      instant = Math.max(0, (totalBytes - first.bytes) / dt);
    }
    if (instant > 0) {
      this.smoothed = this.smoothed === 0 ? instant : this.smoothed * 0.68 + instant * 0.32;
    }
    return this.smoothed;
  }

  get bps(): number {
    return this.smoothed;
  }

  reset(): void {
    this.samples = [];
    this.smoothed = 0;
  }
}

export const PEER_NAMES = ["atlas", "vireo", "nomad", "kestrel", "lumen", "sable"];

export function pickPeer(): { name: string; device: string } {
  const name = PEER_NAMES[Math.floor(Math.random() * PEER_NAMES.length)];
  const devices = ["Chrome · desktop", "Firefox · laptop", "Safari · desktop"];
  const device = devices[Math.floor(Math.random() * devices.length)];
  return { name, device };
}

export function fileCategory(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "avif"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "flac", "ogg", "m4a"].includes(ext)) return "audio";
  if (["zip", "rar", "7z", "tar", "gz", "dmg", "iso"].includes(ext)) return "archive";
  if (["pdf", "doc", "docx", "txt", "md", "ppt", "pptx", "xls", "xlsx"].includes(ext)) return "doc";
  return "file";
}

export function loadTransfers(): TransferSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TransferSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTransfer(summary: TransferSummary): void {
  const all = [summary, ...loadTransfers()].slice(0, MAX_RECORDS);
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("box:transfers-updated"));
}

const EMPTY_TRANSFERS: TransferSummary[] = [];
let cachedJson: string | null | undefined = undefined;
let cachedTransfers: TransferSummary[] = EMPTY_TRANSFERS;

export function subscribeTransfers(onChange: () => void): () => void {
  window.addEventListener("box:transfers-updated", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("box:transfers-updated", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getTransfersSnapshot(): TransferSummary[] {
  const raw = window.localStorage.getItem(STORE_KEY);
  if (raw !== cachedJson) {
    cachedJson = raw;
    try {
      const parsed = raw ? (JSON.parse(raw) as TransferSummary[]) : [];
      cachedTransfers = Array.isArray(parsed) ? parsed : EMPTY_TRANSFERS;
    } catch {
      cachedTransfers = EMPTY_TRANSFERS;
    }
  }
  return cachedTransfers;
}

export function getServerTransfers(): TransferSummary[] {
  return EMPTY_TRANSFERS;
}

export function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
