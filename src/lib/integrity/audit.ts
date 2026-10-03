/**
 * Appending to, and replaying, an entity's audit chain.
 *
 * Every create, update, decision and delete appends one event. Deletion is a
 * tombstone rather than a row removal, so a chain stays replayable after the
 * record it describes is gone.
 */

import type { SqlClient } from "../db/client";
import { GENESIS_SEAL, replayChain, sealEvent, type ChainEvent, type ReplayResult } from "./seal";

export interface AppendResult {
  seq: number;
  prevSeal: string;
  seal: string;
}

export async function appendAudit(
  client: SqlClient,
  entityId: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<AppendResult> {
  const rows = await client.query<{ seq: number; seal: string }>(
    `SELECT seq, seal FROM audit_events WHERE entity_id = $1 ORDER BY seq DESC LIMIT 1`,
    [entityId],
  );

  const previous = rows[0]?.seal ?? GENESIS_SEAL;
  const seq = Number(rows[0]?.seq ?? 0) + 1;
  const at = new Date().toISOString();

  // The sealed material is exactly the fields replayChain recomputes, so a stored
  // row and a recomputed seal can never drift apart.
  const { prevSeal, seal } = sealEvent(previous, { seq, entityId, action, at, payload });

  await client.query(
    `INSERT INTO audit_events (entity_id, seq, action, at, payload, prev_seal, seal)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
     ON CONFLICT (entity_id, seq) DO NOTHING`,
    [entityId, seq, action, at, JSON.stringify(payload), prevSeal, seal],
  );

  return { seq, prevSeal, seal };
}

interface AuditRow {
  seq: number;
  action: string;
  at: Date | string;
  payload: Record<string, unknown>;
  prev_seal: string;
  seal: string;
}

export async function loadChain(
  client: SqlClient,
  entityId: string,
): Promise<Array<ChainEvent & { prevSeal: string; seal: string }>> {
  const rows = await client.query<AuditRow>(
    `SELECT seq, action, at, payload, prev_seal, seal
       FROM audit_events WHERE entity_id = $1 ORDER BY seq ASC`,
    [entityId],
  );

  return rows.map((row) => ({
    seq: Number(row.seq),
    entityId,
    action: row.action,
    at: row.at instanceof Date ? row.at.toISOString() : String(row.at),
    payload: row.payload ?? {},
    prevSeal: row.prev_seal,
    seal: row.seal,
  }));
}

export async function replay(
  client: SqlClient,
  entityId: string,
): Promise<ReplayResult & { entityId: string }> {
  const chain = await loadChain(client, entityId);
  return { entityId, ...replayChain(chain) };
}

/** Every entity that has a chain, newest first. */
export async function listAuditedEntities(
  client: SqlClient,
): Promise<Array<{ entityId: string; events: number }>> {
  const rows = await client.query<{ entity_id: string; events: string }>(
    `SELECT entity_id, count(*)::text AS events
       FROM audit_events GROUP BY entity_id ORDER BY entity_id ASC`,
  );
  return rows.map((row) => ({ entityId: row.entity_id, events: Number(row.events) }));
}