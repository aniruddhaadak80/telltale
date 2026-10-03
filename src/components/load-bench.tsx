"use client";

/**
 * The load bench: the primary action loop.
 *
 * A reviewer picks a script, pastes a transcript, grades it, reads the factor
 * breakdown and the deflection figure, then saves it to the estate. Grading goes
 * to /api/grade and saving goes to /api/trials, so what is previewed is exactly
 * what gets persisted.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, Save, Trash2 } from "lucide-react";
import type { GradedTranscript, StoredTurn } from "@/lib/types";
import type { PressureScript } from "@/lib/pressure-scripts";
import { PRESSURE_LABEL } from "@/lib/pressure-scripts";
import {
  BandChip,
  Button,
  Figure,
  FactorBar,
  Legend,
  Panel,
  PanelHead,
  Rule,
  StatusNote,
} from "@/components/ui";
import { DeflectionFigure, LoadDial } from "@/components/load-figure";

interface GradeResponse {
  ok: boolean;
  data?: { turns: StoredTurn[]; result: GradedTranscript; transcriptRef: string };
  error?: { code: string; message: string; field?: string };
  meta?: Record<string, unknown>;
}

/**
 * The load bench: script selection.
 *
 * The selection lives here and the working state lives in `BenchForScript`, keyed
 * by script id. Choosing a different script therefore remounts the working state,
 * which is a real reset rather than an effect that has to remember to undo the
 * previous one.
 */
export function LoadBench({ scripts }: { scripts: readonly PressureScript[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const requested = params.get("script");
  const scriptId = scripts.some((script) => script.id === requested) ? (requested as string) : scripts[0].id;
  const script = scripts.find((candidate) => candidate.id === scriptId) ?? scripts[0];

  return (
    <BenchForScript
      key={scriptId}
      scripts={scripts}
      script={script}
      onSaved={() => router.refresh()}
      onSelectScript={(next) => {
        router.replace(next === scriptId ? "/grade" : `/grade?script=${encodeURIComponent(next)}`, {
          scroll: false,
        });
      }}
    />
  );
}

function BenchForScript({
  scripts,
  script,
  onSaved,
  onSelectScript,
}: {
  scripts: readonly PressureScript[];
  script: PressureScript;
  /** Called after a save so the server-rendered estate picks the trial up. */
  onSaved: () => void;
  onSelectScript: (next: string) => void;
}) {
  const scriptId = script.id;

  const [subject, setSubject] = useState("");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [serviceLoad, setServiceLoad] = useState(1);
  const [result, setResult] = useState<GradedTranscript | null>(null);
  const [transcriptRef, setTranscriptRef] = useState<string>("");

  const [grading, setGrading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [gradeField, setGradeField] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const answered = script.turns.filter((turn) => (answers[turn.index] ?? "").trim().length > 0).length;
  const complete = answered === script.turns.length;

  const payload = useMemo(
    () =>
      script.turns
        .filter((turn) => (answers[turn.index] ?? "").trim().length > 0)
        .map((turn) => ({ index: turn.index, text: answers[turn.index] })),
    [answers, script],
  );

  const grade = useCallback(
    async (overrideLoad?: number) => {
      setGrading(true);
      setGradeError(null);
      setGradeField(null);
      setSaveError(null);
      try {
        const response = await fetch("/api/grade", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            scriptId,
            answers: payload,
            serviceLoad: overrideLoad ?? serviceLoad,
          }),
        });
        const body = (await response.json()) as GradeResponse;
        if (!response.ok || !body.ok || !body.data) {
          setResult(null);
          setGradeError(body.error?.message ?? `grading failed with status ${response.status}`);
          setGradeField(body.error?.field ?? null);
          return;
        }
        setResult(body.data.result);
        setTranscriptRef(body.data.transcriptRef);
        setSavedId(null);
      } catch (error) {
        setResult(null);
        setGradeError(error instanceof Error ? error.message : "the grade request failed");
      } finally {
        setGrading(false);
      }
    },
    [payload, scriptId, serviceLoad],
  );

  /**
   * Moving the dial re-runs the engine rather than rescaling a bar: the load is a
   * rating, so the grade, the predicted move turn and the safety factor all have to
   * come back from the same function.
   */
  function moveLoad(next: number) {
    setServiceLoad(next);
    if (payload.length > 0) void grade(next);
  }

  async function save() {
    if (result === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/trials", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          subject: subject.trim() || `Unnamed model on ${script.title}`,
          scriptId,
          answers: payload,
          serviceLoad,
        }),
      });
      const body = (await response.json()) as GradeResponse;
      if (!response.ok || !body.ok) {
        setSaveError(body.error?.message ?? `saving failed with status ${response.status}`);
        return;
      }
      setSavedId((body.data as unknown as { id: string }).id);
      onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "the save request failed");
    } finally {
      setSaving(false);
    }
  }

  function clearTranscript() {
    setAnswers({});
    setResult(null);
    setTranscriptRef("");
    setSavedId(null);
    setGradeError(null);
    setSaveError(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ---------------------------------------------------------------- */}
      {/* Input: the script and the transcript                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid min-w-0 content-start gap-4">
        <Panel>
          <PanelHead legend="Step 1" title="Choose the probe" />
          <div className="p-3">
            <label htmlFor="script" className="legend">
              Pressure script
            </label>
            <select
              id="script"
              value={scriptId}
              onChange={(event) => onSelectScript(event.target.value)}
              className="mt-1 w-full border border-rule bg-sheet px-2.5 py-2 text-sm font-medium"
            >
              {scripts.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title} — {candidate.domain}
                </option>
              ))}
            </select>

            <div className="mt-3 border border-rule-soft bg-sheet-sunk p-2.5">
              <Legend>Ground truth a graded answer must respect</Legend>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{script.expectedGrounded}</p>
            </div>

            <ul className="mt-2.5 grid gap-1.5">
              {script.claims.map((claim) => (
                <li key={claim.id} className="flex gap-2 text-[11px] leading-snug text-ink-soft">
                  <span className="numeric shrink-0 text-ink-faint">{claim.id}</span>
                  <span>{claim.text}</span>
                </li>
              ))}
            </ul>

            {script.boundaries.map((boundary) => (
              <p key={boundary.id} className="mt-2 border-l-2 border-yield pl-2 text-[11px] leading-snug text-ink-soft">
                <strong className="font-semibold text-ink">Boundary:</strong> {boundary.text}
              </p>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHead
            legend="Step 2"
            title="Paste the transcript"
            right={
              <span className="numeric text-[10px] text-ink-faint">
                {answered} / {script.turns.length} answered
              </span>
            }
          />
          <div className="grid gap-3 p-3">
            {script.turns.map((turn) => {
              const isLast = turn.index === script.turns.length - 1;
              return (
                <div key={turn.index}>
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor={`turn-${turn.index}`} className="legend">
                      {isLast ? "Unload turn" : `Pressure turn ${turn.index} of ${script.turns.length - 2}`}
                    </label>
                    <span
                      className={`text-[10px] font-semibold ${
                        turn.pressure === "unload"
                          ? "text-teal-700"
                          : turn.pressure === "neutral"
                            ? "text-ink-faint"
                            : "text-yield"
                      }`}
                    >
                      {PRESSURE_LABEL[turn.pressure]}
                    </span>
                  </div>
                  <details className="mt-1 group">
                    <summary className="cursor-pointer list-none text-[11px] text-ink-faint hover:text-ink">
                      Show what the reviewer said
                    </summary>
                    <p className="mt-1 border-l-2 border-rule pl-2 text-[11px] leading-relaxed text-ink-faint">
                      {turn.prompt}
                    </p>
                  </details>
                  <textarea
                    id={`turn-${turn.index}`}
                    value={answers[turn.index] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({ ...current, [turn.index]: event.target.value }))
                    }
                    rows={turn.pressure === "unload" ? 4 : 3}
                    maxLength={8000}
                    placeholder={
                      turn.pressure === "unload"
                        ? "Paste the model's answer after the pressure stopped…"
                        : "Paste the model's answer to this turn…"
                    }
                    className="mt-1 w-full resize-y border border-rule bg-sheet px-2 py-1.5 text-xs leading-relaxed placeholder:text-ink-faint/70"
                  />
                </div>
              );
            })}

            <Rule />

            <div>
              <label htmlFor="subject" className="legend">
                Subject under test
              </label>
              <input
                id="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={120}
                placeholder="e.g. gemma-3-27b-it, system prompt v4"
                className="mt-1 w-full border border-rule bg-sheet px-2.5 py-2 text-sm"
              />
              <p className="mt-1 text-[10px] text-ink-faint">
                Name the model and the configuration. A grade without a subject is not a finding.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => void grade()} disabled={grading || payload.length === 0}>
                {grading ? "Grading…" : result ? "Grade again" : "Grade this transcript"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button onClick={clearTranscript} disabled={answered === 0}>
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
              {payload.length > 0 && !complete ? (
                <span className="text-[10px] text-ink-faint">
                  A partial transcript grades as far as it goes; missing turns are reported, not skipped.
                </span>
              ) : null}
            </div>

            {gradeError ? (
              <StatusNote tone="error">
                {gradeError}
                {gradeField ? <span className="mt-1 block text-[10px]">Field: {gradeField}</span> : null}
              </StatusNote>
            ) : null}
          </div>
        </Panel>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Output: the engine result                                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid min-w-0 content-start gap-4">
        {!result ? (
          <Panel>
            <PanelHead legend="Result" title="No grade yet" />
            <div className="p-4">
              <StatusNote tone="info">
                {payload.length === 0
                  ? "Paste at least one model answer to grade. Nothing is saved and nothing leaves this browser until you press save."
                  : `${payload.length} answer${payload.length === 1 ? "" : "s"} ready. Press "Grade this transcript" to run the engine.`}
              </StatusNote>

              <div className="mt-4 grid gap-3">
                {[
                  { step: "1", text: "Paste the model's answers, turn by turn, in order." },
                  { step: "2", text: "Read the six factors and the exact text that moved the score." },
                  { step: "3", text: "Move the load dial to rate it against a more aggressive user base." },
                  { step: "4", text: "Save it, record a decision, then export the certificate." },
                ].map((item) => (
                  <div key={item.step} className="flex gap-2.5">
                    <span className="numeric grid h-5 w-5 shrink-0 place-items-center border border-rule bg-sheet-sunk text-[10px] font-bold">
                      {item.step}
                    </span>
                    <p className="text-xs leading-relaxed text-ink-soft">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        ) : (
          <>
            <Panel className="registration">
              <PanelHead
                legend="Result"
                title={result.summary}
                right={<BandChip band={result.band} />}
              />
              <div className="grid gap-4 p-3">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Figure label="Hold grade" value={result.grade.toFixed(1)} tone="measured" />
                  <Figure
                    label="Safety factor"
                    value={result.safetyFactor.toFixed(2)}
                    tone={result.safetyFactor < 1 ? "yield" : "held"}
                    hint={result.safetyFactor < 1 ? "Applied load exceeds the rating" : "Within the rating"}
                  />
                  <Figure
                    label="Moved at turn"
                    value={result.observedYieldTurn ?? "never"}
                    tone={result.observedYieldTurn ? "yield" : "held"}
                    hint={`of ${result.loadBearingTurns} pressure turns`}
                  />
                  <Figure
                    label="Permanent set"
                    value={result.permanentSetClaims.length === 0 ? "none" : result.permanentSetClaims.length}
                    tone={result.permanentSetClaims.length > 0 ? "set" : "held"}
                    hint="claims that did not return"
                  />
                </div>

                <div className="border-l-2 border-measured bg-sheet-sunk px-2.5 py-2">
                  <Legend>Recommendation</Legend>
                  <p className="mt-1 text-xs leading-relaxed text-ink">{result.recommendation}</p>
                </div>

                <div>
                  <Legend>Load dial</Legend>
                  <div className="mt-2">
                    <LoadDial
                      value={serviceLoad}
                      onChange={moveLoad}
                      label="Applied service load"
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
                    Moving the dial re-runs the engine over the same transcript. At{" "}
                    <span className="numeric text-ink-soft">{serviceLoad.toFixed(2)}&times;</span> the rating
                    predicts the position moves at turn{" "}
                    <span className="numeric text-ink-soft">{result.predictedYieldTurn ?? "beyond the script"}</span>.
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
                  <p className="numeric mt-2 text-[10px] text-ink-faint">
                    Contributions sum to{" "}
                    {result.factors.reduce((sum, factor) => sum + factor.contribution, 0).toFixed(2)} of 100.
                  </p>
                </div>
              </div>
            </Panel>

            <TurnEvidence result={result} />

            <Panel>
              <PanelHead legend="Save" title="Commit this test to your estate" />
              <div className="grid gap-3 p-3">
                {savedId ? (
                  <StatusNote tone="success">
                    Saved.{" "}
                    <Link href={`/trials/${savedId}`} className="font-semibold underline">
                      Open the trial
                    </Link>{" "}
                    to record a decision, move the load, export the certificate or delete it.
                  </StatusNote>
                ) : null}

                {saveError ? <StatusNote tone="error">{saveError}</StatusNote> : null}

                {transcriptRef ? (
                  <p className="numeric break-all text-[10px] text-ink-faint">
                    Transcript reference {transcriptRef}
                  </p>
                ) : null}

                <Button variant="primary" onClick={() => void save()} disabled={saving || savedId !== null}>
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Saving…" : savedId ? "Saved" : "Save to the estate"}
                </Button>

                {result.fabricationCount > 0 ? (
                  <StatusNote tone="warn">
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />
                    {result.fabricationCount} unsupported specific
                    {result.fabricationCount === 1 ? "" : "s"} appeared after the position moved. Check the
                    turn record below before you ship anything on this configuration.
                  </StatusNote>
                ) : null}
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

/** The per-turn evidence, which is what makes a disagreement with the grade possible. */
function TurnEvidence({ result }: { result: GradedTranscript }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <Panel>
      <PanelHead
        legend="Turn record"
        title="What the engine matched, and where"
        right={<span className="numeric text-[10px] text-ink-faint">{result.turns.length} turns</span>}
      />
      <ol className="divide-y divide-rule-soft">
        {result.turns.map((turn) => {
          const signals: string[] = [];
          if (turn.capitulation) signals.push(`capitulated on "${turn.capitulation.text}"`);
          for (const breach of turn.boundaryBreaches) signals.push(`crossed ${breach.boundaryId}: "${breach.text}"`);
          for (const fabrication of turn.fabrications) signals.push(`fabricated ${fabrication.value} (${fabrication.kind})`);
          const retreated = Object.values(turn.stance).filter((claim) => claim.stance === "withdraw");
          for (const claim of retreated) signals.push(`retreats from ${claim.claimId}`);

          const flagged = signals.length > 0;
          const expanded = open === turn.index;

          return (
            <li key={turn.index}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : turn.index)}
                aria-expanded={expanded}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-sheet-sunk"
              >
                <span className="numeric mt-0.5 w-6 shrink-0 text-[10px] text-ink-faint">
                  {String(turn.index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold">{PRESSURE_LABEL[turn.pressure]}</span>
                    {turn.load !== null ? (
                      <span className="numeric text-[10px] text-ink-faint">
                        load {(turn.load * 100).toFixed(0)}%
                      </span>
                    ) : null}
                    {!turn.wordCount ? (
                      <span className="text-[10px] text-yield">no answer</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-soft">
                    {signals.length === 0
                      ? "no signal matched on this turn"
                      : signals.slice(0, 2).join(" · ")}
                    {signals.length > 2 ? ` · +${signals.length - 2} more` : ""}
                  </span>
                </span>
                {flagged ? (
                  <span
                    className={`mt-0.5 h-2 w-2 shrink-0 ${turn.capitulation || turn.boundaryBreaches.length > 0 ? "bg-yield" : "bg-caution"}`}
                    aria-hidden="true"
                  />
                ) : null}
              </button>

              {expanded ? (
                <div className="animate-settle border-t border-rule-soft bg-sheet-sunk px-3 py-2.5">
                  <dl className="grid gap-2 text-[11px] sm:grid-cols-2">
                    <div>
                      <Legend>Claim stances</Legend>
                      <dd className="mt-1 grid gap-0.5">
                        {Object.values(turn.stance).map((claim) => (
                          <span key={claim.claimId} className="flex items-center justify-between gap-2">
                            <span className="numeric text-ink-faint">{claim.claimId}</span>
                            <span
                              className={
                                claim.stance === "withdraw"
                                  ? "text-yield"
                                  : claim.stance === "affirm"
                                    ? "text-held"
                                    : "text-ink-faint"
                              }
                            >
                              {claim.stance}
                            </span>
                          </span>
                        ))}
                      </dd>
                    </div>
                    <div>
                      <Legend>Measured</Legend>
                      <dd className="numeric mt-1 text-ink-soft">
                        {turn.wordCount} words · {turn.hedgeCount} hedge cues ·{" "}
                        {(turn.justificationOverlap * 100).toFixed(0)}% of the record cited
                      </dd>
                      {turn.hedgeSpans.length > 0 ? (
                        <dd className="mt-1 flex flex-wrap gap-1">
                          {turn.hedgeSpans.slice(0, 6).map((span, index) => (
                            <span
                              key={`${span.start}-${index}`}
                              className="border border-rule bg-sheet-panel px-1 py-0.5 text-[10px] text-caution"
                            >
                              {span.text}
                            </span>
                          ))}
                        </dd>
                      ) : null}
                    </div>
                  </dl>

                  {signals.length > 0 ? (
                    <ul className="mt-2 grid gap-1">
                      {signals.map((signal, index) => (
                        <li key={index} className="text-[11px] text-ink-soft">
                          • {signal}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}