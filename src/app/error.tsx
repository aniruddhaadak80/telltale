"use client";

/**
 * The error boundary.
 *
 * Reports the digest Next.js generated and nothing about the cause: a stack trace
 * on a public page leaks structure, and the digest is enough to find the matching
 * server-side log entry.
 */

import { useEffect } from "react";
import Link from "next/link";
import { Legend, Panel, StatusNote } from "@/components/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side logging already happens in the API layer; this records the
    // component-level failure so the digest is traceable from the browser too.
    console.error("[telltale:ui] route error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-[700px] px-4 py-20">
      <Legend>Route error</Legend>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">This page could not be drawn</h1>
      <div className="mt-4">
        <StatusNote tone="error">
          Something failed while rendering this route. The cause is recorded server-side; nothing about the
          internals is shown here on purpose.
        </StatusNote>
      </div>
      {error.digest ? (
        <Panel className="mt-4 p-3">
          <Legend>Reference</Legend>
          <p className="numeric mt-1 break-all text-xs">{error.digest}</p>
        </Panel>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="border border-ink bg-ink px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
        <Link href="/" className="border border-rule bg-sheet-panel px-4 py-2 text-sm font-semibold hover:border-ink">
          Back to the bench
        </Link>
      </div>
    </div>
  );
}