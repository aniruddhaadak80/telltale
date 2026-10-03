"use client";

/**
 * Global navigation.
 *
 * Reads the repository URL from the single site configuration rather than a local
 * constant, so the desktop bar, the mobile sheet and the footer can never point at
 * different repositories. The GitHub link is present in both navigations.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { site } from "@/config/site";
import { GitHubMark } from "./github-mark";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // A navigation is not a modal, but it covers the page on small screens, so the
  // page behind it must not scroll while it is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-sheet/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={`${site.name} home`}>
          <span className="relative grid h-7 w-7 place-items-center border border-ink bg-ink">
            <span className="absolute inset-1 border border-sheet/45" aria-hidden="true" />
            <span className="h-2.5 w-0.5 -translate-x-[3px] bg-sheet" aria-hidden="true" />
            <span className="h-2.5 w-0.5 translate-x-[3px] bg-sheet" aria-hidden="true" />
          </span>
          <span className="text-sm font-bold tracking-tight">{site.name}</span>
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 items-center gap-0.5 lg:flex">
          {site.nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active ? "text-ink" : "text-ink-soft hover:text-ink"
                }`}
              >
                {item.label}
                {active ? (
                  <span
                    className="absolute inset-x-2 -bottom-[13px] h-[2px] bg-ink"
                    aria-hidden="true"
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/*
            The repository link is present at every width, not only in the desktop
            bar. Below the `sm` breakpoint the labelled button collapses to an
            icon, so the source is one tap away without opening the menu, and the
            same link is repeated inside the menu sheet.
          */}
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 border border-rule bg-sheet-panel px-2.5 py-1.5 text-xs font-semibold transition-colors hover:border-ink hover:bg-sheet-sunk"
            aria-label={`Star ${site.name} on GitHub — opens in a new tab`}
          >
            <GitHubMark className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Star on GitHub</span>
          </a>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1.5 border border-rule bg-sheet-panel px-2.5 py-1.5 text-xs font-semibold lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
          >
            {open ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Menu className="h-3.5 w-3.5" aria-hidden="true" />}
            Menu
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="mobile-nav"
          className="animate-settle border-t border-rule bg-sheet-panel lg:hidden"
        >
          <nav aria-label="Primary mobile" className="mx-auto max-w-[1400px] px-4 py-3">
            <ul className="grid gap-0.5">
              {site.nav.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center justify-between border-b border-rule-soft px-1 py-2.5 text-sm font-medium ${
                        active ? "text-ink" : "text-ink-soft"
                      }`}
                    >
                      {item.label}
                      {active ? <span className="legend text-ink">Current</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <a
              href={site.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="mt-3 flex items-center justify-center gap-2 border border-ink bg-ink px-3 py-2.5 text-sm font-semibold text-white"
              aria-label={`View the ${site.name} source on GitHub — opens in a new tab`}
            >
              <GitHubMark className="h-4 w-4" />
              View source on GitHub
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}