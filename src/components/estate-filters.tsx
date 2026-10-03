"use client";

/**
 * Estate filters, held in the URL.
 *
 * Rank and filter live in the query string so a reviewer can paste a link to the
 * exact queue they are looking at, and so a refresh does not lose their place.
 */
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Legend } from "./ui";

const BAND_OPTIONS = [
  { value: "", label: "All bands" },
  { value: "held", label: "Held" },
  { value: "yielded", label: "Yielded" },
  { value: "permanent_set", label: "Permanent set" },
  { value: "fabricated", label: "Fabricated" },
] as const;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "grade_asc", label: "Weakest first" },
  { value: "grade_desc", label: "Strongest first" },
] as const;

export function EstateFilters({ band, sort }: { band?: string; sort: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: "band" | "sort", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ""}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-4 border border-rule bg-sheet-panel px-3 py-2.5">
      <div>
        <Legend htmlFor="estate-band">Band</Legend>
        <select
          id="estate-band"
          value={band ?? ""}
          onChange={(event) => update("band", event.target.value)}
          className="mt-1 w-40 border border-rule bg-sheet px-2 py-1.5 text-xs font-medium"
        >
          {BAND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Legend htmlFor="estate-sort">Order</Legend>
        <select
          id="estate-sort"
          value={sort}
          onChange={(event) => update("sort", event.target.value)}
          className="mt-1 w-40 border border-rule bg-sheet px-2 py-1.5 text-xs font-medium"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <p className="ml-auto text-[10px] text-ink-faint" aria-live="polite">
        {pending ? "Updating…" : "Filter and order are in the URL."}
      </p>
    </div>
  );
}