/**
 * The single write path.
 *
 * Every mutation the product performs goes through this module: the UI, curl and
 * the agent tools all land here. Each call grades through the one engine, appends
 * one audit event, and returns the seal the caller can quote later. Nothing writes
 * to the database without an audit row.
 */

import { randomBytes } from "node:crypto";
import { getDb } from "./db/client";
import { ApiError } from "./errors";
import { grade } from "./engine";
import { getScript } from "./pressure-scripts";
import { appendAudit, replay } from "./integrity/audit";
import { transcriptRefFor } from "./transcript-ref";
import { requireOwnerId, assertSealMatches } from "./session";
import {
  DECISIONS,
  type Decision,
  type EstateSummary,
  type StoredTurn,
  type Trial,
  type TrialFilters,
  type TrialOrigin,
  type TrialSummary,
} from "./types";
import type { FactorBand } from "./engine";

interface TrialRow {
  id: string;
  owner_id: string;
  subject: string;
  script_id: string;
  script_version: number;
  origin: string;
  turns: unknown;
  result: unknown;
  transcript_ref: string;
  decision: string;
  notes: string;
  service_load: number;
  seal: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toTrial(row: TrialRow): Trial {
  return {
    id: row.id,
    ownerId: row.owner_id,
    subject: row.subject,
    scriptId: row.script_id,
    scriptVersion: Number(row.script_version),
    origin: row.origin as TrialOrigin,
    turns: row.turns as StoredTurn[],
    result: row.result as Trial["result"],
    transcriptRef: row.transcript_ref,
    decision: row.decision as Decision,
    notes: row.notes,
    serviceLoad: Number(row.service_load),
    seal: row.seal,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    deletedAt: row.deleted_at === null ? null : iso(row.deleted_at),
  };
}

/**
 * The listing shape.
 *
 * Built field by field rather than by deleting a key, so a new owner-scoped field
 * added to `Trial` cannot silently leak into a list response.
 */
function toSummary(row: TrialRow): TrialSummary {
  const trial = toTrial(row);
  return {
    id: trial.id,
    subject: trial.subject,
    scriptId: trial.scriptId,
    scriptVersion: trial.scriptVersion,
    origin: trial.origin,
    turns: trial.turns,
    result: trial.result,
    transcriptRef: trial.transcriptRef,
    decision: trial.decision,
    notes: trial.notes,
    serviceLoad: trial.serviceLoad,
    seal: trial.seal,
    createdAt: trial.createdAt,
    updatedAt: trial.updatedAt,
    deletedAt: trial.deletedAt,
  };
}

const SELECT_COLUMNS = `id, owner_id, subject, script_id, script_version, origin, turns, result,
  transcript_ref, decision, notes, service_load, seal, created_at, updated_at, deleted_at`;

export function newTrialId(): string {
  return `trl_${randomBytes(9).toString("hex")}`;
}

/**
 * Build the stored turns and the engine result for a set of answers.
 *
 * Exported so the grade endpoint and the agent tool produce byte-identical
 * records without either of them reimplementing the assembly.
 */
export function buildGraded(
  scriptId: string,
  answers: Array<{ index: number; text: string }>,
  serviceLoad: number,
): { turns: StoredTurn[]; result: Trial["result"]; transcriptRef: string } {
  const script = getScript(scriptId);
  if (!script) throw ApiError.badRequest(`unknown pressure script: ${scriptId}`, "scriptId");

  const byIndex = new Map(answers.map((entry) => [entry.index, entry.text]));
  const turns: StoredTurn[] = script.turns.map((turn) => ({
    index: turn.index,
    pressure: turn.pressure,
    prompt: turn.prompt,
    text: byIndex.get(turn.index) ?? "",
  }));

  const answered = answers
    .filter((entry) => entry.text.trim().length > 0)
    .sort((a, b) => a.index - b.index);

  const result = grade(
    { script, answers: answered.map((entry) => ({ index: entry.index, text: entry.text })) },
    { serviceLoad },
  );

  return {
    turns,
    result,
    transcriptRef: transcriptRefFor(script.id, script.version, answered.map((entry) => entry.text)),
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateTrialInput {
  subject: string;
  scriptId: string;
  answers: Array<{ index: number; text: string }>;
  serviceLoad: number;
  origin?: TrialOrigin;
  decision?: Decision;
  notes?: string;
  /** Reuse a caller-supplied id when an idempotency key replays the request. */
  id?: string;
}

export async function createTrial(input: CreateTrialInput): Promise<Trial> {
  const db = await getDb();
  const ownerId = await requireOwnerId();
  const { turns, result, transcriptRef } = buildGraded(input.scriptId, input.answers, input.serviceLoad);

  const id = input.id ?? newTrialId();

  const existing = await db.query<TrialRow>(
    `SELECT ${SELECT_COLUMNS} FROM trials WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  if (existing.length > 0) return toTrial(existing[0]);

  const { seal } = await appendAudit(db, id, "create", {
    subject: input.subject,
    scriptId: input.scriptId,
    scriptVersion: result.scriptVersion,
    origin: input.origin ?? "pasted",
    serviceLoad: input.serviceLoad,
    transcriptRef,
    grade: result.grade,
    band: result.band,
    transcriptSha: transcriptRef,
  });

  await db.query(
    `INSERT INTO trials
       (id, owner_id, subject, script_id, script_version, origin, turns, result,
        transcript_ref, decision, notes, service_load, seal)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13)`,
    [
      id,
      ownerId,
      input.subject,
      input.scriptId,
      result.scriptVersion,
      input.origin ?? "pasted",
      JSON.stringify(turns),
      JSON.stringify(result),
      transcriptRef,
      input.decision ?? "undecided",
      input.notes ?? "",
      input.serviceLoad,
      seal,
    ],
  );

  return getTrial(id, ownerId);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listTrials(filters: TrialFilters = {}): Promise<TrialSummary[]> {
  const db = await getDb();
  const ownerId = await requireOwnerId();

  const where: string[] = ["owner_id = $1", "deleted_at IS NULL"];
  const params: unknown[] = [ownerId];

  if (filters.band) {
    params.push(filters.band);
    where.push(`(result->>'band') = $${params.length}`);
  }
  if (filters.decision) {
    params.push(filters.decision);
    where.push(`decision = $${params.length}`);
  }
  if (filters.scriptId) {
    params.push(filters.scriptId);
    where.push(`script_id = $${params.length}`);
  }

  // Authored examples are always listed but never ranked: they are demonstrations
  // of the grader, not measurements of a model.
  const orderBy =
    filters.sort === "grade_asc"
      ? `(result->>'grade')::float ASC, id ASC`
      : filters.sort === "oldest"
        ? "created_at ASC, id ASC"
        : filters.sort === "grade_desc"
          ? `(result->>'grade')::float DESC, id ASC`
          : "created_at DESC, id ASC";

  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  params.push(limit);

  const rows = await db.query<TrialRow>(
    `SELECT ${SELECT_COLUMNS} FROM trials
      WHERE ${where.join(" AND ")}
      ORDER BY origin ASC, ${orderBy}
      LIMIT $${params.length}`,
    params,
  );

  return rows.map(toSummary);
}

/**
 * Read one live trial.
 *
 * A tombstoned trial reports 410 rather than 200: it has left the estate, and a
 * deleted record must never be presented as though it were still in use. The
 * verifier reads it through `verifyTrial`, which is the surface that exists to
 * inspect a tombstone.
 */
export async function getTrial(id: string, ownerId?: string): Promise<Trial> {
  const db = await getDb();
  const owner = ownerId ?? (await requireOwnerId());

  const rows = await db.query<TrialRow>(
    `SELECT ${SELECT_COLUMNS} FROM trials WHERE id = $1 AND owner_id = $2`,
    [id, owner],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound("no trial with that id in this session");

  const trial = toTrial(row);
  if (trial.deletedAt !== null) {
    throw new ApiError(
      "gone",
      "this trial was tombstoned; its transcript and seal chain are retained and still verifiable",
      undefined,
      { id: trial.id, tombstonedAt: trial.deletedAt, seal: trial.seal },
    );
  }
  return trial;
}

/**
 * Aggregate over the caller's own trials.
 *
 * Authored examples are excluded from every count and mean. They are the one thing
 * in the product that must never contribute to a claim about a model.
 */
export async function estateSummary(): Promise<EstateSummary> {
  const db = await getDb();
  const ownerId = await requireOwnerId();

  const rows = await db.query<{ result: unknown; script_id: string }>(
    `SELECT result, script_id FROM trials
      WHERE owner_id = $1 AND deleted_at IS NULL AND origin <> 'authored_example'`,
    [ownerId],
  );

  const byBand = new Map<FactorBand, number>();
  const byScript = new Map<string, { trials: number; total: number }>();
  let permanentSetModels = 0;
  let fabricated = 0;
  let total = 0;
  let weakest: FactorBand | null = null;
  let weakestGrade = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    const result = row.result as Trial["result"];
    const grade = Number(result.grade);
    total += 1;

    byBand.set(result.band, (byBand.get(result.band) ?? 0) + 1);
    if (grade < weakestGrade) {
      weakestGrade = grade;
      weakest = result.band;
    }
    if (result.permanentSetClaims.length > 0) permanentSetModels += 1;
    if (result.band === "fabricated") fabricated += 1;

    const entry = byScript.get(row.script_id) ?? { trials: 0, total: 0 };
    entry.trials += 1;
    entry.total += grade;
    byScript.set(row.script_id, entry);
  }

  return {
    trials: total,
    meanGrade: total === 0 ? null : Math.round((rows.reduce((sum, row) => sum + Number((row.result as Trial["result"]).grade), 0) / total) * 100) / 100,
    weakestBand: weakest,
    permanentSetModels,
    fabricated,
    byScript: [...byScript.entries()]
      .map(([scriptId, entry]) => ({
        scriptId,
        trials: entry.trials,
        meanGrade: Math.round((entry.total / entry.trials) * 100) / 100,
      }))
      .sort((a, b) => a.scriptId.localeCompare(b.scriptId)),
    byBand: [...byBand.entries()]
      .map(([band, trials]) => ({ band, trials }))
      .sort((a, b) => a.band.localeCompare(b.band)),
  };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdateTrialInput {
  id: string;
  notes?: string;
  decision?: Decision;
  serviceLoad?: number;
  /** Required when the grade is recomputed. */
  seal?: string;
}

export async function updateTrial(input: UpdateTrialInput): Promise<Trial> {
  const db = await getDb();
  const ownerId = await requireOwnerId();
  const current = await getTrial(input.id, ownerId);

  if (input.seal !== undefined) assertSealMatches(input.seal, current.seal);

  const nextDecision = input.decision ?? current.decision;
  const nextNotes = input.notes ?? current.notes;
  const nextLoad = input.serviceLoad ?? current.serviceLoad;

  // A changed service load re-runs the same engine over the same stored answers.
  // The transcript is untouched, so the transcript reference must not change.
  const result =
    input.serviceLoad !== undefined && input.serviceLoad !== current.serviceLoad
      ? grade(
          {
            script: getScript(current.scriptId)!,
            answers: current.turns
              .filter((turn) => turn.text.trim().length > 0)
              .map((turn) => ({ index: turn.index, text: turn.text })),
          },
          { serviceLoad: nextLoad },
        )
      : current.result;

  const action =
    input.serviceLoad !== undefined && input.serviceLoad !== current.serviceLoad
      ? "set_service_load"
      : input.decision !== undefined && input.decision !== current.decision
        ? "decide"
        : "annotate";

  const { seal } = await appendAudit(db, current.id, action, {
    decision: nextDecision,
    serviceLoad: nextLoad,
    notesLength: nextNotes.length,
    grade: result.grade,
    band: result.band,
    safetyFactor: result.safetyFactor,
    transcriptSha: current.transcriptRef,
  });

  await db.query(
    `UPDATE trials
        SET decision = $1, notes = $2, service_load = $3, result = $4::jsonb, seal = $5, updated_at = now()
      WHERE id = $6 AND owner_id = $7`,
    [nextDecision, nextNotes, nextLoad, JSON.stringify(result), seal, current.id, ownerId],
  );

  return getTrial(current.id, ownerId);
}

/**
 * Record a deployment decision.
 *
 * A decision is the reviewer's judgement, so it is a first-class audited event
 * rather than a field write: the chain records the band and safety factor in force
 * when the decision was made, which is what makes an old decision interpretable
 * after the load dial has moved.
 */
export async function recordDecision(input: {
  id: string;
  decision: Decision;
  notes?: string;
  seal?: string;
}): Promise<Trial> {
  return updateTrial({
    id: input.id,
    decision: input.decision,
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.seal !== undefined ? { seal: input.seal } : {}),
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Tombstone rather than removal.
 *
 * The row keeps its turns and its engine result so the audit chain stays
 * replayable after the trial leaves the estate. Listing filters on `deleted_at`,
 * so a deleted trial is gone from the product and still verifiable.
 */
export async function deleteTrial(id: string, presentedSeal: string): Promise<{ id: string; seal: string }> {
  const db = await getDb();
  const ownerId = await requireOwnerId();
  const current = await getTrial(id, ownerId);

  assertSealMatches(presentedSeal, current.seal);

  const { seal } = await appendAudit(db, current.id, "tombstone", {
    reason: "reviewer deleted the trial",
    gradeAtDeletion: current.result.grade,
    transcriptSha: current.transcriptRef,
  });

  await db.query(
    `UPDATE trials SET deleted_at = now(), seal = $1, updated_at = now() WHERE id = $2 AND owner_id = $3`,
    [seal, current.id, ownerId],
  );

  return { id: current.id, seal };
}

/** A tombstoned trial, readable only by the verifier route. */
export async function getTombstone(id: string): Promise<Trial | null> {
  const db = await getDb();
  const rows = await db.query<TrialRow>(
    `SELECT ${SELECT_COLUMNS} FROM trials WHERE id = $1 AND deleted_at IS NOT NULL`,
    [id],
  );
  return rows[0] ? toTrial(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Session settings
// ---------------------------------------------------------------------------

export interface SessionSettings {
  ownerId: string;
  serviceLoad: number;
  updatedAt: string;
}

/** The session's default service load. Missing row means the documented default. */
export async function getSettings(ownerId?: string): Promise<SessionSettings> {
  const db = await getDb();
  const owner = ownerId ?? (await requireOwnerId());
  const rows = await db.query<{ service_load: number; updated_at: Date | string }>(
    "SELECT service_load, updated_at FROM settings WHERE owner_id = $1",
    [owner],
  );
  const row = rows[0];
  return {
    ownerId: owner,
    serviceLoad: row ? Number(row.service_load) : 1,
    updatedAt: row ? iso(row.updated_at) : new Date(0).toISOString(),
  };
}

/**
 * Change the session default.
 *
 * Recorded as an audit event on a session-scoped entity so the setting a grade was
 * produced under is recoverable after the fact, the same way a trial decision is.
 */
export async function updateSettings(serviceLoad: number, ownerId?: string): Promise<SessionSettings> {
  const db = await getDb();
  const owner = ownerId ?? (await requireOwnerId());

  const before = await getSettings(owner);

  await db.query(
    `INSERT INTO settings (owner_id, service_load, updated_at) VALUES ($1,$2, now())
     ON CONFLICT (owner_id) DO UPDATE SET service_load = EXCLUDED.service_load, updated_at = now()`,
    [owner, serviceLoad],
  );

  await appendAudit(db, `session:${owner}`, "set_default_service_load", {
    from: before.serviceLoad,
    to: serviceLoad,
  });

  return getSettings(owner);
}

// ---------------------------------------------------------------------------
// Integrity and idempotency
// ---------------------------------------------------------------------------

/**
 * Replay a trial's chain, including a tombstone.
 *
 * Reads the row directly rather than through `getTrial`, because the whole point
 * of the verifier is to inspect a record that has already left the estate.
 */
export async function verifyTrial(id: string): Promise<{
  entityId: string;
  ok: boolean;
  checked: number;
  brokenAt: number | null;
  reason: string | null;
  headSeal: string;
  recordedSeal: string;
  sealedMatches: boolean;
  tombstoned: boolean;
  subject: string;
  grade: number;
}> {
  const db = await getDb();
  const ownerId = await requireOwnerId();

  const rows = await db.query<TrialRow>(
    `SELECT ${SELECT_COLUMNS} FROM trials WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound("no trial with that id in this session");

  const trial = toTrial(row);
  const result = await replay(db, trial.id);

  return {
    entityId: trial.id,
    ok: result.ok && result.headSeal === trial.seal,
    checked: result.checked,
    brokenAt: result.brokenAt,
    reason: result.reason,
    headSeal: result.headSeal,
    recordedSeal: trial.seal,
    sealedMatches: result.headSeal === trial.seal,
    tombstoned: trial.deletedAt !== null,
    subject: trial.subject,
    grade: trial.result.grade,
  };
}

export interface IdempotentOutcome<T> {
  replayed: boolean;
  value: T;
}

/**
 * Run a mutation once per (key, owner, endpoint).
 *
 * The stored result is returned on a replay rather than the work being repeated,
 * which is what lets an agent retry a create without producing a second trial.
 */
export async function withIdempotency<T>(
  ownerId: string,
  endpoint: string,
  key: string | null,
  run: () => Promise<T>,
): Promise<IdempotentOutcome<T>> {
  if (!key) return { replayed: false, value: await run() };

  const db = await getDb();
  const existing = await db.query<{ result: unknown }>(
    `SELECT result FROM idempotency WHERE key = $1 AND owner_id = $2 AND endpoint = $3`,
    [key, ownerId, endpoint],
  );

  if (existing.length > 0) {
    return { replayed: true, value: existing[0].result as T };
  }

  const value = await run();

  // `RETURNING` tells us whether this call was the one that wrote the row. A
  // concurrent writer that won the race makes the insert a no-op, and its result
  // is then read back below, so a retry never produces a second record and never
  // reports itself as the original.
  const inserted = await db.query<{ result: unknown }>(
    `INSERT INTO idempotency (key, owner_id, endpoint, result) VALUES ($1,$2,$3,$4::jsonb)
     ON CONFLICT (key, owner_id, endpoint) DO NOTHING
     RETURNING result`,
    [key, ownerId, endpoint, JSON.stringify(value)],
  );

  if (inserted.length > 0) {
    return { replayed: false, value };
  }

  const stored = await db.query<{ result: unknown }>(
    `SELECT result FROM idempotency WHERE key = $1 AND owner_id = $2 AND endpoint = $3`,
    [key, ownerId, endpoint],
  );

  return { replayed: true, value: (stored[0]?.result ?? value) as T };
}

export { DECISIONS };