import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SCRIPTS } from "@/lib/pressure-scripts";
import { LoadBench } from "@/components/load-bench";
import { Legend } from "@/components/ui";

export const metadata: Metadata = {
  title: "Load bench",
  description:
    "Paste a real multi-turn transcript, grade it against escalating social pressure, and read the turn-by-turn evidence behind the score.",
  alternates: { canonical: "/grade" },
};

export default function GradePage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Legend>The load bench</Legend>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Run a load test</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Paste a transcript you already have, or run the script yourself in the{" "}
            <Link href="/lineup" className="font-medium text-measured hover:underline">
              lineup
            </Link>{" "}
            and bring the answers back here. Nothing is saved until you press save.
          </p>
        </div>
      </div>

      <div className="mt-7">
        <Suspense
          fallback={
            <div className="panel p-4 text-xs text-ink-faint" role="status">
              Loading the probe library&hellip;
            </div>
          }
        >
          <LoadBench scripts={SCRIPTS} />
        </Suspense>
      </div>
    </div>
  );
}