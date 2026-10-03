/**
 * Live data with an honest provenance label.
 *
 * `fetchLineup` runs both sources concurrently and reports each one's status
 * separately, so a page can say "catalogue live, literature fallback" rather than
 * pretending the whole thing is current. The two never merge: a fallback is never
 * presented as live, and neither result is ever merged into a visitor's own data.
 */

import type { LineupResult, SourceEnvelope } from "../types";
import { SCRIPTS } from "../pressure-scripts";
import { KAGGLE_ATTRIBUTION, fetchKaggleLineup, sealedKaggleFallback } from "./kaggle";
import { ARXIV_ATTRIBUTION, fetchAlignmentPapers, sealedPapers } from "./arxiv";
import { SEALED_FALLBACK_OBSERVED_AT } from "./sealed-fallback";

export interface LineupResponse {
  models: SourceEnvelope<LineupResult["models"]>;
  papers: SourceEnvelope<LineupResult["papers"]>;
  scriptIds: string[];
  /** Observed date of the sealed snapshots, reported when anything is fallback. */
  fallbackObservedAt: string;
  /** Families of the catalogue that failed, so partial coverage is visible. */
  failedQueries: string[];
}

const nowIso = () => new Date().toISOString();

export async function fetchLineup(): Promise<LineupResponse> {
  const [kaggle, papers] = await Promise.allSettled([fetchKaggleLineup(), fetchAlignmentPapers()]);

  let failedQueries: string[] = [];

  const models: SourceEnvelope<LineupResult["models"]> =
    kaggle.status === "fulfilled" && kaggle.value.models.length > 0
      ? {
          data: kaggle.value.models,
          status: "live",
          attribution: KAGGLE_ATTRIBUTION,
          fetchedAt: nowIso(),
          upstreamId: "kaggle:models/list",
          degradedReason:
            kaggle.value.failures.length > 0
              ? `${kaggle.value.failures.length} of ${kaggle.value.queries.length + kaggle.value.failures.length} catalogue queries did not answer: ${kaggle.value.failures.join(", ")}`
              : null,
        }
      : {
          data: sealedKaggleFallback(),
          status: "fallback",
          attribution: KAGGLE_ATTRIBUTION,
          fetchedAt: SEALED_FALLBACK_OBSERVED_AT,
          upstreamId: "kaggle:models/list@sealed",
          degradedReason:
            kaggle.status === "rejected"
              ? `the live catalogue was unreachable: ${kaggle.reason instanceof Error ? kaggle.reason.message : "unknown error"}`
              : "the live catalogue answered with no models",
        };

  if (kaggle.status === "fulfilled") failedQueries = kaggle.value.failures;
  else failedQueries = ["all"];

  const paperList: SourceEnvelope<LineupResult["papers"]> =
    papers.status === "fulfilled" && papers.value.length > 0
      ? {
          data: papers.value,
          status: "live",
          attribution: ARXIV_ATTRIBUTION,
          fetchedAt: nowIso(),
          upstreamId: "arxiv:api/query",
          degradedReason: null,
        }
      : {
          data: sealedPapers(),
          status: "fallback",
          attribution: ARXIV_ATTRIBUTION,
          fetchedAt: SEALED_FALLBACK_OBSERVED_AT,
          upstreamId: "arxiv:api/query@sealed",
          degradedReason:
            papers.status === "rejected"
              ? `the live arXiv feed was unreachable: ${papers.reason instanceof Error ? papers.reason.message : "unknown error"}`
              : "the live arXiv feed answered with no entries",
        };

  return {
    models,
    papers: paperList,
    scriptIds: SCRIPTS.map((script) => script.id),
    fallbackObservedAt: SEALED_FALLBACK_OBSERVED_AT,
    failedQueries,
  };
}

export { SEALED_FALLBACK_OBSERVED_AT };
export * from "./kaggle";
export * from "./arxiv";