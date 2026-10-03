/**
 * The single place the product's identity and outbound URLs live.
 *
 * The header, the mobile menu, the landing CTA and the footer all read the GitHub
 * and live URLs from here, so the repository link cannot drift out of sync with
 * the repository that actually exists. Nothing else in the app hard-codes a URL.
 */

/**
 * Vercel exposes production URLs as bare hostnames (`telltale.vercel.app`),
 * but `new URL()`, footer hrefs and the sitemap all need a scheme. Normalise
 * once here so no consumer ever has to.
 */
function origin(value: string): string {
  const trimmed = value.replace(/\/$/, "");
  if (!trimmed) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const site = {
  name: "Telltale",
  /** One line: what the product does, for metadata and the landing header. */
  tagline: "Load-test an LLM's position before you ship it.",
  description:
    "Telltale grades a real multi-turn model transcript against escalating social pressure and reports the turn its position moved, what the move cost in verified facts, and whether it came back. Deterministic, explainable, sealed, and runnable against any model on Kaggle.",
  /**
   * The live production alias. Set from VERCEL_PROJECT_PRODUCTION_URL at build
   * time when available, overridable with NEXT_PUBLIC_SITE_URL, always with a
   * scheme, and never guessed at read time.
   */
  liveUrl: origin(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? ""),
  repoSlug: "telltale",
  get repoUrl(): string {
    return `https://github.com/aniruddhaadak80/${this.repoSlug}`;
  },
  get issuesUrl(): string {
    return `${this.repoUrl}/issues`;
  },
  get liveApiUrl(): string {
    return this.liveUrl ? `${this.liveUrl}/api` : "/api";
  },
  nav: [
    { href: "/estate", label: "Estate" },
    { href: "/grade", label: "Load bench" },
    { href: "/lineup", label: "Lineup" },
    { href: "/method", label: "Method" },
    { href: "/agent", label: "Agent" },
    { href: "/export", label: "Export" },
  ] as const,
  benchmark: {
    name: "Telltale-Hold",
    /** Where the runner and the task definition live in the repository. */
    path: "benchmark/telltale-hold",
    kaggleUrl: "https://www.kaggle.com/benchmarks",
  },
} as const;

export type Site = typeof site;

/** Absolute URL for canonical, OpenGraph and sitemap entries. */
export function absoluteUrl(path: string): string {
  const base = site.liveUrl || "http://localhost:3000";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** True when the app is running against a real deployed origin. */
export function hasLiveOrigin(): boolean {
  return site.liveUrl.length > 0 && site.liveUrl.startsWith("https://");
}