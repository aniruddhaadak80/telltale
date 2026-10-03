import type { Metadata } from "next";
import Link from "next/link";
import { getOwnerId } from "@/lib/session";
import { verifyTrial } from "@/lib/service";
import { GENESIS_SEAL } from "@/lib/integrity/seal";
import { Legend, Panel, PanelHead, StatusNote } from "@/components/ui";
import { VerifyForm } from "@/components/verify-form";

export const metadata: Metadata = {
  title: "Verify",
  description:
    "Recompute a trial's SHA-384 seal chain from genesis and report the first broken link, if there is one.",
  alternates: { canonical: "/verify" },
};

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await getOwnerId();
  const params = await searchParams;

  let result: Awaited<ReturnType<typeof verifyTrial>> | null = null;
  let failure: string | null = null;

  if (params.id) {
    try {
      result = await verifyTrial(params.id);
    } catch (error) {
      failure = error instanceof Error ? error.message : "the trial could not be read";
    }
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-10">
      <header>
        <Legend>Integrity</Legend>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Replay the seal chain</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          Recomputes every audit event for a trial from genesis and reports the first link that does not
          verify. A pass means the record has not been edited since it was written, including through a load
          change, a decision or a tombstone.
        </p>
      </header>

      <div className="mt-7">
        <VerifyForm initialId={params.id ?? ""} />
      </div>

      {failure ? (
        <div className="mt-5">
          <StatusNote tone="error">{failure}</StatusNote>
        </div>
      ) : null}

      {result ? (
        <Panel className="mt-5">
          <PanelHead
            legend="Result"
            title={result.ok ? "Chain verified" : "Chain is broken"}
            right={
              <span
                className={`border px-2 py-0.5 text-[10px] font-bold tracking-wider ${
                  result.ok ? "border-teal-500 bg-teal-50 text-teal-800" : "border-rose-500 bg-rose-50 text-rose-800"
                }`}
              >
                {result.ok ? "PASS" : "FAIL"}
              </span>
            }
          />
          <dl className="grid gap-2 p-4 text-[11px] sm:grid-cols-2">
            {[
              { label: "Entity", value: result.entityId },
              { label: "Events replayed", value: String(result.checked) },
              { label: "First broken link", value: result.brokenAt === null ? "none" : `seq ${result.brokenAt}` },
              { label: "Tombstoned", value: result.tombstoned ? "yes, chain retained" : "no" },
              { label: "Recomputed head", value: result.headSeal },
              { label: "Seal stored on the record", value: result.recordedSeal },
            ].map((row) => (
              <div key={row.label} className="grid gap-0.5">
                <dt className="legend">{row.label}</dt>
                <dd className="numeric break-all text-ink-soft">{row.value}</dd>
              </div>
            ))}
          </dl>

          {result.reason ? (
            <div className="border-t border-rule p-4">
              <StatusNote tone="error">{result.reason}</StatusNote>
            </div>
          ) : null}

          <div className="border-t border-rule bg-sheet-sunk p-4">
            <Legend>Chain rule</Legend>
            <pre className="mt-1 overflow-x-auto text-[11px] text-ink-soft">
{`seal_n = SHA-384( UTF-8(prevSeal) || canonicalJson(event_n) )
genesis = ${GENESIS_SEAL.slice(0, 32)}…`}
            </pre>
          </div>
        </Panel>
      ) : null}

      {!result && !failure ? (
        <div className="mt-5">
          <StatusNote tone="info">
            Enter a trial id to replay its chain. Ids appear in the provenance panel of any trial and in every
            exported certificate.
          </StatusNote>
          <Link
            href="/estate"
            className="mt-3 inline-flex border border-rule bg-sheet-panel px-3 py-1.5 text-xs font-semibold hover:border-ink"
          >
            Find one in the estate
          </Link>
        </div>
      ) : null}
    </div>
  );
}