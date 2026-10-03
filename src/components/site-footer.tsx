import Link from "next/link";
import { site } from "@/config/site";
import { GitHubMark, ExternalArrow } from "./github-mark";
import { Legend } from "./ui";

/**
 * The shared footer.
 *
 * Carries the repository link, the live origin and the routes, all read from the
 * site configuration. A visitor who scrolls to the bottom on any page can reach the
 * source.
 */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-rule bg-sheet-panel">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative grid h-7 w-7 place-items-center border border-ink bg-ink">
              <span className="absolute inset-1 border border-sheet/45" aria-hidden="true" />
              <span className="h-2.5 w-0.5 -translate-x-[3px] bg-sheet" aria-hidden="true" />
              <span className="h-2.5 w-0.5 translate-x-[3px] bg-sheet" aria-hidden="true" />
            </span>
            <span className="text-sm font-bold tracking-tight">{site.name}</span>
          </div>
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-ink-soft">{site.tagline}</p>
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-ink-faint">
            Deterministic, explainable and sealed. It measures whether a stated position survives scripted
            social pressure. It is not a safety certification.
          </p>
        </div>

        <nav aria-label="Footer">
          <Legend>Product</Legend>
          <ul className="mt-3 grid gap-2">
            {site.nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-xs text-ink-soft transition-colors hover:text-ink hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <Legend>Open source</Legend>
          <ul className="mt-3 grid gap-2">
            <li>
              <a
                href={site.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-ink-soft transition-colors hover:text-ink hover:underline"
                aria-label={`Star ${site.name} on GitHub — opens in a new tab`}
              >
                <GitHubMark className="h-3.5 w-3.5" />
                Star on GitHub
                <ExternalArrow />
              </a>
            </li>
            <li>
              <a
                href={`${site.repoUrl}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-ink-soft transition-colors hover:text-ink hover:underline"
              >
                Issues
                <ExternalArrow />
              </a>
            </li>
            <li>
              <a
                href={`${site.repoUrl}#readme`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-ink-soft transition-colors hover:text-ink hover:underline"
              >
                Documentation
                <ExternalArrow />
              </a>
            </li>
            {site.liveUrl ? (
              <li>
                <a
                  href={site.liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-ink-soft transition-colors hover:text-ink hover:underline"
                >
                  Live deployment
                  <ExternalArrow />
                </a>
              </li>
            ) : null}
          </ul>

          <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
            MIT licensed. Built for alignment reviewers who need a number they can defend in a review.
          </p>
        </div>
      </div>

      <div className="border-t border-rule">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-4 py-4 text-[11px] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            {site.name} — {site.benchmark.name} benchmark. Not affiliated with any model provider.
          </p>
          <p className="numeric">
            <a
              href={site.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink hover:underline"
            >
              {site.repoUrl}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}