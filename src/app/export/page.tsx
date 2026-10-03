import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { getOwnerId } from "@/lib/session";
import { listTrials } from "@/lib/service";
import { getScript } from "@/lib/pressure-scripts";
import { renderCertificate, certificateJson } from "@/lib/export";
import { BandChip, Legend, Panel, PanelHead, StatusNote } from "@/components/ui";

export const metadata: Metadata = {
  title: "Export",
  description:
    "Download a sealed load-test certificate for any trial in your estate, as Markdown for a review or JSON for a machine.",
  alternates: { canonical: "/export" },
};

export const dynamic = "force-dynamic";

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await getOwnerId();
  const params = await searchParams;
  const trials = await listTrials({ sort: "newest", limit: 100 });
  const selected = params.id ? trials.find((trial) => trial.id === params.id) : undefined;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <header>
        <Legend>The take-away artifact</Legend>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Load-test certificates</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          A certificate stands on its own: the script under test with its ground truth, the transcript, the
          factor table with weights and basis, the load and margin figures, and the audit seal plus the URL
          to verify it. Markdown is for a review or a ticket; JSON is for a machine.
        </p>
      </header>

      {trials.length === 0 ? (
        <div className="mt-7">
          <StatusNote tone="info">
            Nothing to export yet. Grade a transcript on the load bench first.
          </StatusNote>
          <Link
            href="/grade"
            className="mt-4 inline-flex border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-white"
          >
            Open the load bench
          </Link>
        </div>
      ) : (
        <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Panel>
            <PanelHead legend={`${trials.length} trials`} title="Choose one to export" />
            <ul className="max-h-[520px] divide-y divide-rule-soft overflow-y-auto">
              {trials.map((trial) => (
                <li key={trial.id}>
                  <Link
                    href={`/export?id=${encodeURIComponent(trial.id)}`}
                    className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-sheet-sunk ${
                      selected?.id === trial.id ? "bg-sheet-sunk" : ""
                    }`}
                  >
                    <span className="numeric w-12 shrink-0 text-sm font-bold">
                      {trial.result.grade.toFixed(1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{trial.subject}</span>
                      <span className="block truncate text-[10px] text-ink-faint">
                        {getScript(trial.scriptId)?.title ?? trial.scriptId} v{trial.scriptVersion} ·{" "}
                        {trial.serviceLoad.toFixed(2)}&times; ·{" "}
                        {trial.origin === "authored_example" ? "authored example" : "measured"}
                      </span>
                    </span>
                    <BandChip band={trial.result.band} />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="grid content-start gap-4">
            {selected ? (
              <>
                <Panel className="registration">
                  <PanelHead
                    legend="Preview"
                    title={selected.subject}
                    right={<BandChip band={selected.result.band} />}
                  />
                  <div className="border-b border-rule bg-sheet-sunk p-3">
                    <Legend>Attribution inside the certificate</Legend>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
                      {selected.origin === "authored_example"
                        ? "This certificate is generated from an authored example, and it says so in its own text. It must not be cited as a finding about a model."
                        : `Graded from a transcript you supplied, sealed at ${selected.seal.slice(0, 24)}…`}
                    </p>
                  </div>
                  <pre className="max-h-[440px] overflow-auto bg-sheet-panel px-3 py-3 text-[11px] leading-relaxed whitespace-pre-wrap">
                    {renderCertificate({
                      trial: selected,
                      verifyUrl: `/verify?id=${encodeURIComponent(selected.id)}`,
                      lineupStatus: "live",
                    }).slice(0, 6000)}
                  </pre>
                  <div className="flex flex-wrap gap-2 border-t border-rule p-3">
                    <a
                      href={`/api/export?id=${encodeURIComponent(selected.id)}&format=md`}
                      className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-soft"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Markdown
                    </a>
                    <a
                      href={`/api/export?id=${encodeURIComponent(selected.id)}&format=json`}
                      className="inline-flex items-center gap-1.5 border border-rule bg-sheet-panel px-3 py-1.5 text-xs font-semibold hover:border-ink"
                    >
                      <Download className="h-3.5 w-3.5" />
                      JSON
                    </a>
                    <Link
                      href={`/trials/${selected.id}`}
                      className="inline-flex items-center border border-rule bg-sheet-panel px-3 py-1.5 text-xs font-semibold hover:border-ink"
                    >
                      Open trial
                    </Link>
                  </div>
                </Panel>

                <Panel>
                  <PanelHead legend="Machine record" title="What the JSON contains" />
                  <pre className="max-h-56 overflow-auto bg-sheet-panel px-3 py-2 text-[11px] leading-relaxed">
                    {JSON.stringify(
                      Object.keys(certificateJson({ trial: selected, verifyUrl: "" })),
                      null,
                      2,
                    )}
                  </pre>
                </Panel>
              </>
            ) : (
              <Panel>
                <PanelHead legend="Preview" title="No trial selected" />
                <div className="p-4">
                  <StatusNote tone="info">
                    Choose a trial on the left to preview its certificate here. Every download is generated
                    from the stored record, so a certificate can never disagree with the trial.
                  </StatusNote>
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}