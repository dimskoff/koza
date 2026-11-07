/* koza.click — client-side demo logic (no backend) */

export interface KozaLink {
  id: string;
  slug: string;
  url: string;
  password?: string;
  clicks: number;
  createdAt: number;
}

const STORE_KEY = "koza_links_v1";
const MAX_LINKS = 50;

export const RESERVED_SLUGS = new Set([
  "www",
  "api",
  "admin",
  "app",
  "mail",
  "blog",
  "status",
  "docs",
  "help",
  "login",
  "signup",
  "dashboard",
  "beta",
  "about",
  "terms",
  "privacy",
  "abuse",
  "report",
  /* real routes on this deploy — never hand these out */
  "box",
  "r",
]);

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomSlug(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
  }
  return out;
}

export function slugError(slug: string): string | null {
  if (!slug) return null;
  if (!/^[a-z0-9_-]{3,32}$/.test(slug))
    return "3–32 chars · lowercase a-z, 0-9, dashes";
  if (RESERVED_SLUGS.has(slug)) return "This name is reserved";
  return null;
}

export function isSlugTaken(slug: string): boolean {
  const links = loadLinks();
  return links.some((l) => l.slug === slug);
}

export function normalizeUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const parsed = new URL(value);
    if (!parsed.hostname.includes(".") || /\s/.test(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* Suggest a slug from the destination URL: claude.ai/chat → claude */
export function suggestSlug(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const base = host.split(".")[0].replace(/[^a-z0-9]/gi, "").toLowerCase();
    return base.slice(0, 24);
  } catch {
    return "";
  }
}

export function loadLinks(): KozaLink[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as KozaLink[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLink(link: KozaLink): KozaLink[] {
  const links = [link, ...loadLinks()].slice(0, MAX_LINKS);
  persist(links);
  return links;
}

export function removeLink(id: string): KozaLink[] {
  const links = loadLinks().filter((l) => l.id !== id);
  persist(links);
  return links;
}

export function bumpClicks(id: string): void {
  const links = loadLinks().map((l) => (l.id === id ? { ...l, clicks: l.clicks + 1 } : l));
  persist(links);
}

/* adopt the server's click count for a link (the truth lives server-side) */
export function syncClicks(id: string, clicks: number): void {
  const links = loadLinks().map((l) => (l.id === id ? { ...l, clicks } : l));
  persist(links);
}

function persist(links: KozaLink[]): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(links));
    window.dispatchEvent(new CustomEvent("koza:links-updated"));
  } catch {
    /* storage unavailable — demo continues in memory */
  }
}

/* useSyncExternalStore wiring for the local link store */
const EMPTY_LINKS: KozaLink[] = [];
let cachedJson: string | null | undefined = undefined;
let cachedLinks: KozaLink[] = EMPTY_LINKS;

export function subscribeLinks(onChange: () => void): () => void {
  window.addEventListener("koza:links-updated", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("koza:links-updated", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getLinksSnapshot(): KozaLink[] {
  const raw = window.localStorage.getItem(STORE_KEY);
  if (raw !== cachedJson) {
    cachedJson = raw;
    try {
      const parsed = raw ? (JSON.parse(raw) as KozaLink[]) : [];
      cachedLinks = Array.isArray(parsed) ? parsed : EMPTY_LINKS;
    } catch {
      cachedLinks = EMPTY_LINKS;
    }
  }
  return cachedLinks;
}

export function getServerLinks(): KozaLink[] {
  return EMPTY_LINKS;
}

export function shortUrlOf(slug: string): string {
  return `https://koza.click/${slug}`;
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
