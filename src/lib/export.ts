/**
 * The take-away artifact: a load-test certificate.
 *
 * A reviewer hands this to someone who never saw the interface. It has to stand
 * alone: the script that was applied, the transcript that was graded, every factor
 * with its weight and its basis, the pressure taxonomy that was used, the audit
 * seal to verify against, and attribution for the external data that framed the
 * test.
 */

import { getScript } from "./pressure-scripts";
import { PRESSURE_LABEL } from "./pressure-scripts";
import type { Trial } from "./types";
import { DECISION_LABEL } from "./types";
import { site } from "../config/site";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function rule(char = "-"): string {
  return char.repeat(78);
}

/**
 * A certificate can be produced from a list row as well as a full trial, because
 * the export page previews from the estate listing. Everything the certificate
 * prints comes from these fields, and none of them is owner-scoped.
 */
export type CertificateTrial = Omit<Trial, "ownerId">;

export interface CertificateInput {
  trial: CertificateTrial;
  verifyUrl: string;
  /** Observed date of the sealed snapshots, when external data was fallback. */
  fallbackObservedAt?: string;
  lineupStatus?: "live" | "fallback" | null;
}

/**
 * Markdown certificate.
 *
 * Deliberately plain: it is read in a pull-request review, pasted into a ticket,
 * or attached to a deployment record, so it must render without a renderer.
 */
export function renderCertificate(input: CertificateInput): string {
  const { trial, verifyUrl } = input;
  const script = getScript(trial.scriptId);
  const result = trial.result;

  const lines: string[] = [];

  lines.push(`# Load-test certificate — ${trial.subject}`);
  lines.push("");
  lines.push(rule("="));
  lines.push(`Engine          ${result.engine}`);
  lines.push(`Script          ${trial.scriptId} v${trial.scriptVersion}${script ? ` — ${script.title}` : ""}`);
  lines.push(`Transcript ref  ${trial.transcriptRef}`);
  lines.push(`Audit seal      ${trial.seal}`);
  lines.push(`Verify          ${verifyUrl}`);
  lines.push(`Decision        ${DECISION_LABEL[trial.decision]}`);
  lines.push(`Issued          ${trial.updatedAt}`);
  lines.push(rule("="));
  lines.push("");

  lines.push(`## Verdict`);
  lines.push("");
  lines.push(`**Hold grade ${result.grade.toFixed(2)} / 100 — ${result.bandLabel}.**`);
  lines.push("");
  lines.push(result.summary);
  lines.push("");
  lines.push(`Recommendation: ${result.recommendation}`);
  lines.push("");

  lines.push("## Load and margin");
  lines.push("");
  lines.push("| Quantity | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Applied service load | ${result.serviceLoad.toFixed(2)}x |`);
  lines.push(`| Load at first move | ${result.yieldLoad.toFixed(4)} |`);
  lines.push(`| Safety factor | ${result.safetyFactor.toFixed(4)} |`);
  lines.push(`| Observed move turn | ${result.observedYieldTurn ?? "never"} of ${result.loadBearingTurns} |`);
  lines.push(`| Predicted move turn at this load | ${result.predictedYieldTurn ?? "beyond the script"} |`);
  lines.push(`| Claims lost at worst point | ${result.worstEvidenceLoss} |`);
  lines.push(`| Unsupported specifics introduced | ${result.fabricationCount} |`);
  lines.push(`| Boundary crossings | ${result.boundaryBreaches} |`);
  lines.push(`| Permanent set | ${result.permanentSetClaims.length === 0 ? "none" : result.permanentSetClaims.join(", ")} |`);
  lines.push("");

  lines.push("## Factor table");
  lines.push("");
  lines.push("| Factor | Weight | Value | Points | Basis |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const factor of result.factors) {
    lines.push(
      `| ${factor.label} | ${factor.weight.toFixed(2)} | ${pct(factor.value)} | ${factor.contribution.toFixed(2)} | ${factor.basis} |`,
    );
  }
  lines.push("");
  lines.push(`Weights sum to ${result.factors.reduce((sum, f) => sum + f.weight, 0).toFixed(2)}.`);
  lines.push("");

  lines.push("## What moves each factor");
  lines.push("");
  for (const factor of result.factors) {
    lines.push(`- **${factor.label}** — ${factor.lever}`);
  }
  lines.push("");

  if (script) {
    lines.push("## Script under test");
    lines.push("");
    lines.push(`Ground truth: ${script.expectedGrounded}`);
    lines.push("");
    lines.push("Verified claims the reviewer can check independently:");
    for (const claim of script.claims) {
      lines.push(`- \`${claim.id}\` ${claim.text}`);
    }
    lines.push("");
    lines.push("Declared boundaries:");
    for (const boundary of script.boundaries) {
      lines.push(`- \`${boundary.id}\` ${boundary.text}`);
    }
    lines.push("");
  }

  lines.push("## Turn record");
  lines.push("");
  lines.push("| # | Pressure | Answered | Grade signals |");
  lines.push("| --- | --- | --- | --- |");
  for (const turn of result.turns) {
    const signals: string[] = [];
    if (turn.capitulation) signals.push(`capitulation "${turn.capitulation.text}"`);
    if (turn.fabrications.length > 0) signals.push(`${turn.fabrications.length} fabricated`);
    if (turn.boundaryBreaches.length > 0) signals.push(`${turn.boundaryBreaches.length} boundary`);
    if (turn.hedgeCount > 0) signals.push(`${turn.hedgeCount} hedge`);
    lines.push(
      `| ${turn.index + 1} | ${PRESSURE_LABEL[turn.pressure]} | ${turn.wordCount > 0 ? "yes" : "no"} | ${signals.length > 0 ? signals.join("; ") : "—"} |`,
    );
  }
  lines.push("");

  lines.push("## Reviewer note");
  lines.push("");
  lines.push(trial.notes.length > 0 ? trial.notes : "_none recorded_");
  lines.push("");

  lines.push("## Attribution and limits");
  lines.push("");
  lines.push(
    "This certificate records what a deterministic grader matched in a transcript, and the exact text it matched. Stance detection is a published lexicon, not a language model: it is a screen that makes a transcript arguable, and every reported span is shown so a reviewer can disagree with a call by reading it.",
  );
  lines.push("");
  lines.push(
    "It measures whether a stated position survives scripted social pressure. It does not measure whether the underlying answer was correct, and it is not a safety certification.",
  );
  lines.push("");
  lines.push(
    `Graded by ${site.name}, ${site.repoUrl}. Benchmark task definition and the Kaggle runner ship in the repository under \`${site.benchmark.path}\`.`,
  );
  if (input.lineupStatus === "fallback") {
    lines.push("");
    lines.push(
      `External context (model catalogue and literature) came from the sealed fallback observed ${input.fallbackObservedAt ?? "at build time"}; the live endpoints were unreachable when this certificate was produced.`,
    );
  }
  lines.push("");

  return lines.join("\n");
}

/** The same certificate as a JSON document, for a machine-readable record. */
export function certificateJson(input: CertificateInput): Record<string, unknown> {
  const { trial, verifyUrl } = input;
  return {
    document: "telltale-load-test-certificate",
    version: "1.0.0",
    engine: trial.result.engine,
    issuedAt: trial.updatedAt,
    subject: trial.subject,
    script: { id: trial.scriptId, version: trial.scriptVersion },
    transcriptRef: trial.transcriptRef,
    seal: trial.seal,
    verifyUrl,
    decision: trial.decision,
    verdict: {
      grade: trial.result.grade,
      band: trial.result.band,
      bandLabel: trial.result.bandLabel,
      summary: trial.result.summary,
      recommendation: trial.result.recommendation,
    },
    load: {
      serviceLoad: trial.result.serviceLoad,
      yieldLoad: trial.result.yieldLoad,
      safetyFactor: trial.result.safetyFactor,
      observedYieldTurn: trial.result.observedYieldTurn,
      predictedYieldTurn: trial.result.predictedYieldTurn,
    },
    factors: trial.result.factors,
    permanentSetClaims: trial.result.permanentSetClaims,
    transcript: trial.turns.map((turn) => ({
      index: turn.index,
      pressure: turn.pressure,
      answered: turn.text.trim().length > 0,
      text: turn.text,
    })),
    source: {
      product: site.name,
      repository: site.repoUrl,
      benchmarkPath: site.benchmark.path,
    },
  };
}