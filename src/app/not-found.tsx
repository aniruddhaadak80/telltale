import Link from "next/link";
import { Legend } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[700px] px-4 py-20">
      <Legend>404</Legend>
      <h1 className="mt-2 text-4xl font-extrabold tracking-tight">No such drawing</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        That route does not exist. If you were following a trial link, it belongs to a different session or
        the trial was tombstoned — tombstoned trials stay verifiable at their verify URL but leave the estate.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/" className="border border-ink bg-ink px-4 py-2 text-sm font-semibold text-white">
          Back to the bench
        </Link>
        <Link href="/estate" className="border border-rule bg-sheet-panel px-4 py-2 text-sm font-semibold hover:border-ink">
          Your estate
        </Link>
        <Link href="/method" className="border border-rule bg-sheet-panel px-4 py-2 text-sm font-semibold hover:border-ink">
          How grading works
        </Link>
      </div>
    </div>
  );
}