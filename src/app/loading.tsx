import { Legend } from "@/components/ui";

/**
 * Route-level loading state.
 *
 * A ruled sheet with a sweep, matching the plotting grid, so a slow route reads as
 * the bench working rather than as a blank page.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Legend>Loading</Legend>
      <div className="mt-2 h-8 w-2/5 border border-rule bg-sheet-sunk" />
      <div className="animate-sweep relative mt-6 h-64 w-full overflow-hidden border border-rule bg-sheet-sunk" />
      <p className="mt-3 text-xs text-ink-faint">Reading the sheet…</p>
    </div>
  );
}