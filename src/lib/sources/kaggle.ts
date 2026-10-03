/**
 * The Kaggle public model catalogue, read without authentication.
 *
 * This is the lineup the benchmark is meant to be run against: real instruction
 * and chat models that a reviewer can point the pressure scripts at, with the
 * licence they carry. Every field is normalised here so the rest of the app never
 * sees the wire shape.
 *
 * Endpoint: https://www.kaggle.com/api/v1/models/list
 * Every request is bounded by a timeout and degrades independently, so one slow
 * query never takes down the page.
 */

import type { KaggleModel } from "../types";
import { SEALED_KAGGLE_FALLBACK } from "./sealed-fallback";

const ENDPOINT = "https://www.kaggle.com/api/v1/models/list";
const TIMEOUT_MS = 7000;
const PAGE_SIZE = 8;

/** Refs that are weights or quantisations rather than a runnable chat surface. */
const EXCLUDED_REF_PATTERNS: readonly RegExp[] = [
  /\.(pth|pt|safetensors|gguf|bin|onnx|h5|ckpt|zip|tar)$/i,
  /\/finetune|-lora$|-adapter$/i,
];

/**
 * Curated queries. Each is a real model family a reviewer would plausibly put
 * under pressure, and together they span four providers and three licence
 * families, which is the point: a pressure finding from one family is not a
 * finding about the others.
 */
export const LINEUP_QUERIES: readonly string[] = [
  "gemma",
  "llama-3",
  "qwen3",
  "mistral-small",
  "deepseek",
  "phi-4",
  "gpt-oss",
];

interface KaggleInstance {
  licenseName?: string;
  framework?: string;
}

interface KaggleModelWire {
  ref?: string;
  title?: string;
  author?: string;
  voteCount?: number;
  updateTime?: string;
  instances?: KaggleInstance[];
}

export type { KaggleModelWire };

interface KaggleListWire {
  models?: KaggleModelWire[];
  totalResults?: number;
}

/** Exported for the unit tests that pin the normalisation contract. */
export function isRunnableCandidate(ref: string): boolean {
  return !EXCLUDED_REF_PATTERNS.some((pattern) => pattern.test(ref));
}

/** Exported for the unit tests that pin the normalisation contract. */
export function normalise(wire: KaggleModelWire): KaggleModel | null {
  if (typeof wire.ref !== "string" || wire.ref.length === 0) return null;
  const ref = wire.ref.trim();
  if (!isRunnableCandidate(ref)) return null;

  const instance = Array.isArray(wire.instances) && wire.instances.length > 0 ? wire.instances[0] : undefined;
  const author = ref.includes("/") ? ref.slice(0, ref.indexOf("/")) : (wire.author ?? null);

  return {
    ref,
    title: (wire.title ?? ref).trim(),
    provider: author,
    parametersB: null,
    license: instance?.licenseName ?? null,
    taskTypes: instance?.framework ? [instance.framework] : [],
    lastUpdated: wire.updateTime ?? null,
  };
}

async function fetchQuery(query: string): Promise<KaggleModel[]> {
  const url = `${ENDPOINT}?search=${encodeURIComponent(query)}&pageSize=${PAGE_SIZE}&sortBy=voteCount`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "telltale/1.0 (+https://telltale.vercel.app)" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as KaggleListWire;
    const models = Array.isArray(body.models) ? body.models : [];
    return models
      .map(normalise)
      .filter((model): model is KaggleModel => model !== null);
  } finally {
    clearTimeout(timer);
  }
}

export interface LineupFetch {
  models: KaggleModel[];
  /** Families that answered, so the interface can report partial coverage. */
  queries: string[];
  failures: string[];
}

/**
 * Fetch every curated query concurrently. A query that fails is recorded and
 * skipped; the lineup is only declared fallback-worthy when every query fails.
 */
export async function fetchKaggleLineup(): Promise<LineupFetch> {
  const settled = await Promise.allSettled(LINEUP_QUERIES.map((query) => fetchQuery(query)));

  const byRef = new Map<string, KaggleModel & { _rank: number }>();
  const queries: string[] = [];
  const failures: string[] = [];

  settled.forEach((outcome, position) => {
    const query = LINEUP_QUERIES[position];
    if (outcome.status === "fulfilled") {
      queries.push(query);
      for (const model of outcome.value) {
        const existing = byRef.get(model.ref);
        // Keep the richest record for a ref seen by more than one query.
        if (!existing || (model.license !== null && existing.license === null)) {
          // Remember which curated query introduced it, so the listing leads with
          // the families the pressure taxonomy was designed against rather than
          // with whatever sorts first alphabetically.
          byRef.set(model.ref, { ...model, _rank: position });
        }
      }
    } else {
      failures.push(query);
    }
  });

  const ranked = [...byRef.values()].sort((a, b) => a._rank - b._rank || a.ref.localeCompare(b.ref));
  // The rank is ordering metadata, not part of the published model shape.
  const models: KaggleModel[] = ranked.map((entry) => ({
    ref: entry.ref,
    title: entry.title,
    provider: entry.provider,
    parametersB: entry.parametersB,
    license: entry.license,
    taskTypes: entry.taskTypes,
    lastUpdated: entry.lastUpdated,
  }));

  return { models, queries, failures };
}

/** The dated snapshot used when the live catalogue cannot be reached. */
export function sealedKaggleFallback(): KaggleModel[] {
  return SEALED_KAGGLE_FALLBACK.map((model) => ({ ...model, taskTypes: [...model.taskTypes] }));
}

export const KAGGLE_ATTRIBUTION =
  "Model catalogue from the Kaggle public API (https://www.kaggle.com/api/v1/models/list), used under the Kaggle Terms of Use. Licences are reported as Kaggle lists them and are the reviewer's responsibility to check.";