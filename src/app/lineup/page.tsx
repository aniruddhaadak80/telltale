import type { Metadata } from "next";
import { fetchLineup } from "@/lib/sources";
import { site } from "@/config/site";
import { Legend, Panel, PanelHead, SourceBadge, StatusNote } from "@/components/ui";
import { SCRIPTS } from "@/lib/pressure-scripts";

export const metadata: Metadata = {
  title: "Lineup",
  description:
    "The live Kaggle model catalogue this benchmark can be run against, plus the live alignment literature that motivates the pressure taxonomy.",
  alternates: { canonical: "/lineup" },
};

export const revalidate = 900;

export default async function LineupPage() {
  const lineup = await fetchLineup();

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10">
      <header>
        <Legend>Lineup and provenance</Legend>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">What this is measured against</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          Two live sources, each labelled with its own status. Telltale does not publish a score for any model
          it did not grade from a transcript a reviewer supplied, and it never presents fallback data as
          current.
        </p>
      </header>

      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHead
            legend="Source 1 · Kaggle"
            title={`${lineup.models.data.length} models in the catalogue`}
            right={<SourceBadge status={lineup.models.status} fetchedAt={lineup.models.fetchedAt} />}
          />

          {lineup.models.status === "fallback" ? (
            <div className="border-b border-rule bg-amber-50 px-3 py-2">
              <StatusNote tone="warn">
                This is the sealed snapshot observed {lineup.models.fetchedAt.slice(0, 10)}, not a live read.
                {lineup.models.degradedReason ? ` Reason: ${lineup.models.degradedReason}` : ""}
              </StatusNote>
            </div>
          ) : null}

          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Kaggle model catalogue entries with their licences</caption>
              <thead className="sticky top-0 bg-sheet-sunk">
                <tr className="border-b border-rule">
                  <th scope="col" className="legend px-3 py-2">Model</th>
                  <th scope="col" className="legend px-3 py-2">Provider</th>
                  <th scope="col" className="legend px-3 py-2">Licence</th>
                  <th scope="col" className="legend px-3 py-2">Framework</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule-soft">
                {lineup.models.data.map((model) => (
                  <tr key={model.ref} className="transition-colors hover:bg-sheet-sunk">
                    <th scope="row" className="px-3 py-2">
                      <a
                        href={`https://www.kaggle.com/models/${model.ref}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="numeric text-[11px] font-medium text-measured hover:underline"
                      >
                        {model.ref}
                      </a>
                    </th>
                    <td className="px-3 py-2 text-[11px] text-ink-soft">{model.provider ?? "—"}</td>
                    <td className="px-3 py-2 text-[11px] text-ink-soft">{model.license ?? "unstated"}</td>
                    <td className="numeric px-3 py-2 text-[11px] text-ink-faint">
                      {model.taskTypes.join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-rule bg-sheet-sunk p-3">
            <Legend>How to run the benchmark against one of these</Legend>
            <ol className="mt-1.5 grid list-decimal gap-1 pl-4 text-[11px] leading-relaxed text-ink-soft">
              <li>
                Clone <code className="numeric">{site.repoUrl}</code> and read the task definition in{" "}
                <code className="numeric">{site.benchmark.path}</code>.
              </li>
              <li>
                Run <code className="numeric">npm run bench:prepare</code> to write the case file, or pass the
                script id straight to the Kaggle runner.
              </li>
              <li>
                Run <code className="numeric">node scripts/run-kaggle.mjs --script queue-latency --models
                google/gemma-3,qwen-lm/qwen-3</code> with your Kaggle credentials.
              </li>
              <li>
                Bring each transcript back to the{" "}
                <a href="/grade" className="text-measured hover:underline">
                  load bench
                </a>{" "}
                and save it. That is where the grade and the certificate come from.
              </li>
            </ol>
          </div>
        </Panel>

        <Panel>
          <PanelHead
            legend="Source 2 · arXiv"
            title={`${lineup.papers.data.length} papers behind the taxonomy`}
            right={<SourceBadge status={lineup.papers.status} fetchedAt={lineup.papers.fetchedAt} />}
          />

          {lineup.papers.status === "fallback" ? (
            <div className="border-b border-rule bg-amber-50 px-3 py-2">
              <StatusNote tone="warn">
                Sealed snapshot observed {lineup.papers.fetchedAt.slice(0, 10)}.
                {lineup.papers.degradedReason ? ` Reason: ${lineup.papers.degradedReason}` : ""}
              </StatusNote>
            </div>
          ) : null}

          <ul className="max-h-[420px] divide-y divide-rule-soft overflow-y-auto">
            {lineup.papers.data.map((paper) => (
              <li key={paper.arxivId} className="p-3">
                <a
                  href={paper.absUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold leading-snug hover:underline"
                >
                  {paper.title}
                </a>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{paper.summary}</p>
                <p className="numeric mt-1 text-[10px] text-ink-faint">
                  {paper.arxivId} · {paper.published.slice(0, 10)} · {paper.authors.slice(0, 3).join(", ")}
                  {paper.authors.length > 3 ? " et al." : ""}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel className="mt-5">
        <PanelHead legend="Attribution" title="Required reading, not decoration" />
        <div className="grid gap-4 p-3 text-xs leading-relaxed text-ink-soft md:grid-cols-2">
          <p>
            <strong className="font-semibold text-ink">Kaggle.</strong> {lineup.models.attribution}
          </p>
          <p>
            <strong className="font-semibold text-ink">arXiv.</strong> {lineup.papers.attribution}
          </p>
        </div>
        <div className="border-t border-rule bg-sheet-sunk p-3">
          <Legend>Pressure taxonomy</Legend>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {SCRIPTS[0]?.turns.map((turn) => (
              <li
                key={turn.index}
                className="numeric border border-rule bg-sheet-panel px-1.5 py-0.5 text-[10px] text-ink-soft"
              >
                {turn.pressure}
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}