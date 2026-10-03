"use client";

/**
 * One trial, with every mutation available on it.
 *
 * Moving the load dial patches the trial and re-reads it, so the number on screen
 * is the stored number rather than a local guess. A decision, an export and a
 * guarded tombstone are on the same surface.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Save, Trash2 } from "lucide-react";
import type { Trial } from "@/lib/types";
import { DECISIONS, DECISION_LABEL } from "@/lib/types";
import type { FactorBand } from "@/lib/engine";
import { PRESSURE_LABEL } from "@/lib/pressure-scripts";
import {
  BandChip,
  Button,
  Figure,
  FactorBar,
  Legend,
  Panel,
  PanelHead,
  StatusNote,
} from "./ui";
import { DeflectionFigure, LoadDial } from "./load-figure";

interface TrialResponse {
  ok: boolean;
  data?: Trial;
  error?: { code: string; message: string };
  meta?: Record<string, unknown>;
}

export function TrialDetail({ initial }: { initial: Trial }) {
  const router = useRouter();
  const [trial, setTrial] = useState<Trial>(initial);
  const [busy, setBusy] = useState<"load" | "decision" | "notes" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initial.notes);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  /**
   * Adopt a changed prop during render rather than in an effect.
   *
   * `router.refresh()` delivers a new record after a mutation, and the component
   * owns state that mirrors it. Tracking the previous identity and resetting
   * during render is the documented React pattern and avoids a render pass that
   * briefly shows the old grade against the new seal.
   */
  const [adopted, setAdopted] = useState(`${initial.id}:${initial.updatedAt}`);
  const [adoptedNotes, setAdoptedNotes] = useState(initial.notes);
  const incoming = `${initial.id}:${initial.updatedAt}`;
  if (incoming !== adopted) {
    // A refresh after a mutation must not discard unsaved work: adopt the new
    // record, but keep the local textarea when it has drifted from the last
    // adopted copy (the reviewer is mid-edit, or the fill landed before the
    // refresh arrived).
    const unsaved = notes !== adoptedNotes;
    setAdopted(incoming);
    setAdoptedNotes(initial.notes);
    setTrial(initial);
    if (!unsaved) setNotes(initial.notes);
    setConfirmingDelete(false);
  }

  const patch = useCallback(
    async (body: Record<string, unknown>, kind: typeof busy) => {
      setBusy(kind);
      setError(null);
      setSaved(null);
      try {
        const response = await fetch(`/api/trials/${trial.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as TrialResponse;
        if (!response.ok || !payload.ok || !payload.data) {
          setError(payload.error?.message ?? `update failed with status ${response.status}`);
          return false;
        }
        setTrial(payload.data);
        setNotes(payload.data.notes);
        if (kind === "decision") setSaved("Decision recorded and sealed into the audit chain.");
        if (kind === "notes") setSaved("Reviewer note saved and sealed into the audit chain.");
        router.refresh();
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "the update request failed");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [router, trial.id],
  );

  async function remove() {
    setBusy("delete");
    setError(null);
    try {
      const response = await fetch(`/api/trials/${trial.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json", "x-telltale-seal": trial.seal },
        body: JSON.stringify({ seal: trial.seal }),
      });
      const payload = (await response.json()) as TrialResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? `deletion failed with status ${response.status}`);
        return;
      }
      setDeleted(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "the delete request failed");
    } finally {
      setBusy(null);
    }
  }

  if (deleted) {
    return (
      <Panel className="p-4">
        <StatusNote tone="success">
          Tombstoned. The row and its audit chain are retained so the seal stays replayable, and it is gone
          from the estate.
        </StatusNote>
        <div className="mt-3 flex gap-2">
          <Link href="/estate" className="border border-rule bg-sheet px-3 py-1.5 text-xs font-semibold hover:border-ink">
            Back to the estate
          </Link>
          <Link
            href={`/verify?id=${encodeURIComponent(trial.id)}`}
            className="border border-rule bg-sheet px-3 py-1.5 text-xs font-semibold hover:border-ink"
          >
            Verify the chain still replays
          </Link>
        </div>
      </Panel>
    );
  }

  const result = trial.result;
  const authored = trial.origin === "authored_example";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 content-start gap-4">
        {authored ? (
          <StatusNote tone="warn">
            <strong className="font-semibold">Authored example, not a model output.</strong> This record
            demonstrates the grader&rsquo;s mechanics. It is excluded from every aggregate in the product and
            must never be cited as a finding about a model.
          </StatusNote>
        ) : null}

        <Panel className="registration">
          <PanelHead
            legend="Verdict"
            title={result.summary}
            right={<BandChip band={result.band as FactorBand} />}
          />
          <div className="grid gap-4 p-3">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label="Hold grade" value={result.grade.toFixed(1)} tone="measured" />
              <Figure
                label="Safety factor"
                value={result.safetyFactor.toFixed(2)}
                tone={result.safetyFactor < 1 ? "yield" : "held"}
              />
              <Figure
                label="Moved at turn"
                value={result.observedYieldTurn ?? "never"}
                tone={result.observedYieldTurn ? "yield" : "held"}
                hint={`of ${result.loadBearingTurns}`}
              />
              <Figure
                label="Fabrications"
                value={result.fabricationCount}
                tone={result.fabricationCount > 0 ? "yield" : "held"}
              />
            </div>

            <div className="border-l-2 border-measured bg-sheet-sunk px-2.5 py-2">
              <Legend>Recommendation</Legend>
              <p className="mt-1 text-xs leading-relaxed">{result.recommendation}</p>
            </div>

            <div>
              <LoadDial
                value={trial.serviceLoad}
                label="Applied service load"
                onChange={(next) => void patch({ serviceLoad: next, seal: trial.seal }, "load")}
                disabled={busy !== null}
              />
              <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
                Persisted. Re-rates this trial through the same engine over the same transcript; the
                transcript reference never changes.
              </p>
            </div>

            <DeflectionFigure result={result} />

            <div>
              <Legend>Factors</Legend>
              <div className="mt-2 grid gap-2.5">
                {result.factors.map((factor) => (
                  <div key={factor.key}>
                    <FactorBar factor={factor} />
                    <p className="mt-0.5 text-[10px] leading-snug text-ink-faint">{factor.basis}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHead legend="Transcript" title={`${trial.turns.length} scripted turns`} />
          <ol className="divide-y divide-rule-soft">
            {trial.turns.map((turn) => (
              <li key={turn.index} className="grid gap-2 p-3 md:grid-cols-[9rem_1fr]">
                <div>
                  <Legend>
                    {turn.index + 1} · {PRESSURE_LABEL[turn.pressure]}
                  </Legend>
                  <p className="numeric mt-0.5 text-[10px] text-ink-faint">
                    {(result.turns[turn.index]?.wordCount ?? 0).toLocaleString()} words
                  </p>
                </div>
                <div>
                  <p className="text-[11px] leading-relaxed text-ink-faint">
                    <span className="font-semibold text-ink-soft">Reviewer:</span> {turn.prompt}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed">
                    <span className="font-semibold">Model:</span>{" "}
                    {turn.text.trim().length > 0 ? (
                      turn.text
                    ) : (
                      <span className="text-yield">no answer on this turn</span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <div className="grid min-w-0 content-start gap-4">
        <Panel>
          <PanelHead legend="Decision" title="What happens to this configuration" />
          <div className="grid gap-3 p-3">
            <div className="grid grid-cols-2 gap-2">
              {DECISIONS.filter((decision) => decision !== "undecided").map((decision) => {
                const active = trial.decision === decision;
                return (
                  <button
                    key={decision}
                    type="button"
                    onClick={() => void patch({ decision, seal: trial.seal }, "decision")}
                    disabled={busy !== null || active}
                    aria-pressed={active}
                    className={`border px-2.5 py-2 text-xs font-semibold transition-colors disabled:opacity-100 ${
                      active
                        ? "border-ink bg-ink text-white"
                        : "border-rule bg-sheet hover:border-ink hover:bg-sheet-sunk"
                    }`}
                  >
                    {DECISION_LABEL[decision]}
                  </button>
                );
              })}
            </div>

            <div>
              <label htmlFor="trial-notes" className="legend">
                Reviewer note
              </label>
              <textarea
                id="trial-notes"
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value);
                  setSaved(null);
                }}
                rows={4}
                maxLength={2000}
                placeholder="What did you decide, and what would change it?"
                className="mt-1 w-full resize-y border border-rule bg-sheet px-2 py-1.5 text-xs leading-relaxed"
              />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="numeric text-[10px] text-ink-faint">{notes.length} / 2000</span>
                <Button
                  onClick={() => void patch({ notes, seal: trial.seal }, "notes")}
                  disabled={busy !== null || notes === trial.notes}
                >
                  <Save className="h-3.5 w-3.5" />
                  {busy === "notes" ? "Saving…" : "Save note"}
                </Button>
              </div>
            </div>

            {error ? <StatusNote tone="error">{error}</StatusNote> : null}
            {saved ? <StatusNote tone="success">{saved}</StatusNote> : null}
          </div>
        </Panel>

        <Panel>
          <PanelHead legend="Take it away" title="The certificate" />
          <div className="grid gap-2 p-3">
            <p className="text-xs leading-relaxed text-ink-soft">
              A self-contained load-test certificate: the factor table with weights and basis, the turn
              record, the ground truth of the script, the audit seal and the URL to verify it. It renders in
              a pull request review and pastes into a ticket.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/export?id=${encodeURIComponent(trial.id)}&format=md`}
                className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-soft"
              >
                <Download className="h-3.5 w-3.5" />
                Download Markdown
              </a>
              <a
                href={`/api/export?id=${encodeURIComponent(trial.id)}&format=json`}
                className="inline-flex items-center gap-1.5 border border-rule bg-sheet-panel px-3 py-1.5 text-xs font-semibold hover:border-ink"
              >
                <Download className="h-3.5 w-3.5" />
                Download JSON
              </a>
              <Link
                href={`/verify?id=${encodeURIComponent(trial.id)}`}
                className="inline-flex items-center gap-1.5 border border-rule bg-sheet-panel px-3 py-1.5 text-xs font-semibold hover:border-ink"
              >
                Verify the seal
              </Link>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHead legend="Provenance" title="What this record is made of" />
          <dl className="grid gap-2 p-3 text-[11px]">
            {[
              { label: "Engine", value: result.engine },
              { label: "Script", value: `${trial.scriptId} v${trial.scriptVersion}` },
              { label: "Transcript reference", value: trial.transcriptRef },
              { label: "Audit seal", value: trial.seal },
              { label: "Origin", value: trial.origin },
              { label: "Created", value: trial.createdAt },
              { label: "Updated", value: trial.updatedAt },
            ].map((row) => (
              <div key={row.label} className="grid gap-0.5">
                <dt className="legend">{row.label}</dt>
                <dd className="numeric min-w-0 break-all text-ink-soft">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel className="border-rose-300">
          <PanelHead legend="Destructive" title="Tombstone this trial" />
          <div className="grid gap-3 p-3">
            <p className="text-xs leading-relaxed text-ink-soft">
              Deletion writes a tombstone rather than removing the row, so the audit chain stays replayable
              and a third party can still verify the test happened. It disappears from the estate.
            </p>
            {confirmingDelete ? (
              <>
                <StatusNote tone="error">
                  This is guarded by the current seal, so it cannot be triggered by a stale link.
                </StatusNote>
                <div className="flex gap-2">
                  <Button variant="danger" onClick={() => void remove()} disabled={busy !== null}>
                    <Trash2 className="h-3.5 w-3.5" />
                    {busy === "delete" ? "Tombstoning…" : "Yes, tombstone it"}
                  </Button>
                  <Button onClick={() => setConfirmingDelete(false)} disabled={busy !== null}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Tombstone this trial
              </Button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}