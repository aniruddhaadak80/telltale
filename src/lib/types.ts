/**
 * Domain and live-source types.
 *
 * External data is normalised here rather than at the edge, so the UI, the REST
 * surface and the agent tools all consume the same shape and every response
 * carries its attribution, the moment it was fetched, and whether it came from
 * the live source or the sealed fallback.
 */

import type { FactorBand, GradedTranscript } from "./engine";
import type { PressureClass } from "./pressure-scripts";

export type { GradedTranscript } from "./engine";
export type { PressureClass } from "./pressure-scripts";

// ---------------------------------------------------------------------------
// Live sources
// ---------------------------------------------------------------------------

export type SourceStatus = "live" | "fallback";

export interface SourceEnvelope<T> {
  data: T;
  status: SourceStatus;
  /** Attribution: who published it and under what terms. */
  attribution: string;
  /** ISO timestamp of the fetch that produced `data`. */
  fetchedAt: string;
  /** The upstream identifier, when the source exposes one. */
  upstreamId: string | null;
  /** What went wrong when status is `fallback`. */
  degradedReason: string | null;
}

/** One model in the live Kaggle catalogue that this benchmark can be run against. */
export interface KaggleModel {
  /** Fully qualified ref, e.g. `google/gemma-3-27b-it`. */
  ref: string;
  title: string;
  /** Provider slug as Kaggle reports it. */
  provider: string | null;
  /** Kaggle's own parameter count where published, in billions. */
  parametersB: number | null;
  license: string | null;
  taskTypes: string[];
  lastUpdated: string | null;
}

/** An alignment-relevant paper from the live arXiv feed. */
export interface AlignmentPaper {
  arxivId: string;
  title: string;
  summary: string;
  published: string;
  updated: string;
  authors: string[];
  categories: string[];
  absUrl: string;
}

export interface LineupResult {
  models: KaggleModel[];
  papers: AlignmentPaper[];
  /** Which pressure scripts the catalogue can be run against. */
  scriptIds: string[];
}

// ---------------------------------------------------------------------------
// Trials
// ---------------------------------------------------------------------------

export type TrialOrigin = "pasted" | "agent" | "authored_example";

export type Decision = "undecided" | "ship" | "ship_gated" | "hold_back" | "blocked";

export const DECISIONS: readonly Decision[] = [
  "undecided",
  "ship",
  "ship_gated",
  "hold_back",
  "blocked",
];

export const DECISION_LABEL: Record<Decision, string> = {
  undecided: "Undecided",
  ship: "Ship",
  ship_gated: "Ship with a gate",
  hold_back: "Hold back",
  blocked: "Blocked",
};

/** One model answer as the reviewer supplied it. */
export interface StoredTurn {
  index: number;
  pressure: PressureClass;
  prompt: string;
  text: string;
}

export interface Trial {
  id: string;
  ownerId: string;
  /** The model under test, as the reviewer names it. */
  subject: string;
  scriptId: string;
  scriptVersion: number;
  origin: TrialOrigin;
  turns: StoredTurn[];
  /** The full engine result, stored verbatim so a read-back never disagrees. */
  result: GradedTranscript;
  /** Reference over the graded input, computed server-side. */
  transcriptRef: string;
  decision: Decision;
  notes: string;
  /** Applied service load, 0.5 to 3. */
  serviceLoad: number;
  /** SHA-384 head of the audit chain at the last write. */
  seal: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Trial without owner scoping fields, used in list responses. */
export type TrialSummary = Omit<Trial, "ownerId" | "transcriptRef"> & {
  transcriptRef: string;
};

export interface TrialFilters {
  band?: FactorBand;
  decision?: Decision;
  scriptId?: string;
  sort?: "grade_asc" | "grade_desc" | "newest" | "oldest";
  limit?: number;
}

/** Aggregate over the caller's own trials. Authored examples are never counted. */
export interface EstateSummary {
  trials: number;
  meanGrade: number | null;
  weakestBand: FactorBand | null;
  permanentSetModels: number;
  fabricated: number;
  byScript: Array<{ scriptId: string; trials: number; meanGrade: number | null }>;
  byBand: Array<{ band: FactorBand; trials: number }>;
}

export interface ApiOk<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErr {
  ok: false;
  error: { code: string; message: string; field?: string; details?: Record<string, string> };
}