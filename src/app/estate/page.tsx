import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { getOwnerId } from "@/lib/session";
import { estateSummary, listTrials } from "@/lib/service";
import { getScript } from "@/lib/pressure-scripts";
import { DECISION_LABEL } from "@/lib/types";
import { Legend, Panel, PanelHead, Rule, SourceBadge, StatusNote } from "@/components/ui";
import { BandChip } from "@/components/ui";
import { GradeStrip } from "@/components/load-figure";
import { EstateFilters } from "@/components/estate-filters";

export const metadata: Metadata = {
  title: "Estate",
  description:
    "Every load test you have run in this session, ranked by hold grade, with the load dial applied to each.",
  alternates: { canonical: "/estate" },
};

export const dynamic = "force-dynamic";

const BANDS = ["held", "yielded", "permanent_set", "fabricated"] as const;

export default async function EstatePage({
  searchParams,
}: {
  searchParams: Promise<{ band?: string; sort?: string; script?: string }>;
}) {
  await getOwnerId();
  const params = await searchParams;

  const band = BANDS.includes(params.band as (typeof BANDS)[number])
    ? (params.band as (typeof BANDS)[number])
    : undefined;
  const sort = (["grade_asc", "grade_desc", "newest", "oldest"] as const).includes(
    params.sort as "grade_asc",
  )
    ? (params.sort as "grade_asc" | "grade_desc" | "newest" | "oldest")
    : "newest";

  const trials = await listTrials({ ...(band ? { band } : {}), sort, limit: 100 });
  const summary = await estateSummary();

  const measured = trials.filter((trial) => trial.origin !== "authored_example");
  const authored = trials.filter((trial) => trial.origin === "authored_example");

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Legend>The estate</Legend>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Load tests in this session</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Ownership is an anonymous cookie in this browser. You can see everything you have graded here and
            nothing anyone else has.
          </p>
        </div>
        <Link
          href="/grade"
          className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-ink-soft"
        >
          <Plus className="h-3.5 w-3.5" />
          New load test
        </Link>
      </div>

      {/* Estate aggregates. Authored examples are excluded from every number here. */}
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-3">
          <Legend>Trials you graded</Legend>
          <p className="numeric mt-1 text-3xl font-bold">{summary.trials}</p>
          <p className="mt-1 text-[11px] text-ink-faint">
            {authored.length > 0
              ? `${authored.length} authored example${authored.length === 1 ? "" : "s"} listed below, excluded from this count.`
              : "Authored examples are never counted here."}
          </p>
        </Panel>

        <Panel className="p-3">
          <Legend>Mean hold grade</Legend>
          <p className="numeric mt-1 text-3xl font-bold">
            {summary.meanGrade === null ? "—" : summary.meanGrade.toFixed(1)}
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">Out of 100, at a 1.00&times; service load.</p>
        </Panel>

        <Panel className="p-3">
          <Legend>With permanent set</Legend>
          <p className="numeric mt-1 text-3xl font-bold text-set">{summary.permanentSetModels}</p>
          <p className="mt-1 text-[11px] text-ink-faint">
            Trials whose position did not return after the unload turn.
          </p>
        </Panel>

        <Panel className="p-3">
          <Legend>Weakest band</Legend>
          <div className="mt-2">
            {summary.weakestBand ? (
              <BandChip band={summary.weakestBand} />
            ) : (
              <p className="text-sm text-ink-faint">No trials yet</p>
            )}
          </div>
          <div className="mt-2">
            <GradeStrip
              grades={measured.map((trial) => ({
                grade: trial.result.grade,
                authored: trial.origin === "authored_example",
              }))}
            />
          </div>
        </Panel>
      </div>

      {summary.trials === 0 && authored.length === 0 ? (
        <div className="mt-8">
          <StatusNote tone="info">
            Nothing here yet. Open the load bench, pick a script, paste a transcript and grade it. The first
            test takes about a minute and nothing is saved until you save it.
          </StatusNote>
          <Link
            href="/grade"
            className="group mt-4 inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-white"
          >
            Run your first load test
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      ) : null}

      {summary.byScript.length > 0 ? (
        <Panel className="mt-6">
          <PanelHead legend="Per script" title="Where the pressure lands" />
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Mean hold grade by pressure script</caption>
            <thead>
              <tr className="border-b border-rule bg-sheet-sunk">
                <th scope="col" className="legend px-3 py-2">Script</th>
                <th scope="col" className="legend px-3 py-2 text-right">Trials</th>
                <th scope="col" className="legend px-3 py-2 text-right">Mean grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule-soft">
              {summary.byScript.map((row) => (
                <tr key={row.scriptId}>
                  <th scope="row" className="px-3 py-2 text-xs font-medium">
                    {getScript(row.scriptId)?.title ?? row.scriptId}
                    <span className="numeric ml-2 text-[10px] text-ink-faint">{row.scriptId}</span>
                  </th>
                  <td className="numeric px-3 py-2 text-right text-xs">{row.trials}</td>
                  <td className="numeric px-3 py-2 text-right text-xs font-semibold">
                    {row.meanGrade === null ? "—" : row.meanGrade.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}

      <div className="mt-6">
        <Suspense fallback={<div className="panel h-14" aria-hidden="true" />}>
          <EstateFilters band={band} sort={sort} />
        </Suspense>
      </div>

      <div className="mt-4 grid gap-3">
        {measured.length === 0 && authored.length === 0 ? (
          <StatusNote tone="info">No trials match this filter.</StatusNote>
        ) : null}

        {authored.map((trial) => (
          <Panel key={trial.id} className="border-dashed">
            <div className="flex flex-wrap items-center gap-3 border-b border-rule-soft bg-sheet-sunk px-3 py-2">
              <SourceBadge status="fallback" fetchedAt="authored, not a measurement" />
              <Legend>Authored example</Legend>
              <span className="ml-auto text-[10px] text-ink-faint">
                Demonstrates the grader. Never counted, ranked or exported as a finding.
              </span>
            </div>
            <TrialRow trial={trial} />
          </Panel>
        ))}

        {measured.map((trial) => (
          <Panel key={trial.id}>
            <TrialRow trial={trial} />
          </Panel>
        ))}
      </div>

      <Rule className="mt-10" />
      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Scores are produced by {`telltale-grade/1.0.0`}, a deterministic function with no model in it. Turn
        the service load on any trial to re-rate it against a more aggressive user base without touching the
        transcript.
      </p>
    </div>
  );
}

function TrialRow({ trial }: { trial: Awaited<ReturnType<typeof listTrials>>[number] }) {
  const script = getScript(trial.scriptId);
  return (
    <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/trials/${trial.id}`}
            className="truncate text-sm font-semibold hover:underline"
          >
            {trial.subject}
          </Link>
          <BandChip band={trial.result.band} />
        </div>
        <p className="mt-1 truncate text-xs text-ink-faint">
          {script?.title ?? trial.scriptId} v{trial.scriptVersion} · {DECISION_LABEL[trial.decision]} ·{" "}
          <span className="numeric">{trial.serviceLoad.toFixed(2)}&times; load</span>
          {trial.result.permanentSetClaims.length > 0 ? (
            <>
              {" · "}
              <span className="text-set">
                {trial.result.permanentSetClaims.length} claim
                {trial.result.permanentSetClaims.length === 1 ? "" : "s"} with permanent set
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex items-center gap-5 lg:justify-end">
        <div className="text-right">
          <Legend>Grade</Legend>
          <p className="numeric text-lg font-bold">{trial.result.grade.toFixed(1)}</p>
        </div>
        <div className="text-right">
          <Legend>Safety factor</Legend>
          <p
            className={`numeric text-lg font-bold ${trial.result.safetyFactor < 1 ? "text-yield" : "text-ink"}`}
          >
            {trial.result.safetyFactor.toFixed(2)}
          </p>
        </div>
        <Link
          href={`/trials/${trial.id}`}
          className="inline-flex items-center gap-1.5 border border-rule bg-sheet px-3 py-1.5 text-xs font-semibold transition-colors hover:border-ink"
        >
          Inspect
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}