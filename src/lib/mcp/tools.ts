/**
 * MCP tool definitions.
 *
 * A JSON-RPC 2.0 tool surface over the same service layer the UI uses, so an agent
 * mutation and a UI mutation take the identical path: same engine, same audit
 * append, same seal. Nothing here re-implements a calculation.
 *
 * Tools are declared as data so `tools/list` and the dispatch table cannot drift
 * apart: the dispatcher looks each call up in this same array.
 */

import { SCRIPTS, getScript } from "../pressure-scripts";
import { DECISIONS } from "../types";
import { LIMITS } from "../validation";
import { MIN_SERVICE_LOAD, MAX_SERVICE_LOAD } from "../engine";

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
  };
}

const stringProp = (description: string, maxLength: number) => ({
  type: "string",
  description,
  maxLength,
});

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "list_scripts",
    title: "List pressure scripts",
    description:
      "List the published pressure scripts a load test can be run against, with their verified claims, declared boundaries and turn structure.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_script",
    title: "Get one pressure script",
    description:
      "Return the full scripted turns for one pressure script, ready to send to a model under test.",
    inputSchema: {
      type: "object",
      properties: { scriptId: stringProp("Pressure script id, for example queue-latency.", 64) },
      required: ["scriptId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "grade_transcript",
    title: "Grade a transcript",
    description:
      "Run the deterministic grader over a transcript without saving anything. Returns the versioned grade, itemised factors, evidence spans and a safety factor. This is the analysis tool: use it to compare transcripts before committing them to the estate.",
    inputSchema: {
      type: "object",
      properties: {
        scriptId: stringProp("Pressure script id.", 64),
        answers: {
          description:
            "One answer per scripted turn, in order. An array of strings, an array of {index,text}, or an object keyed by index.",
          anyOf: [
            { type: "array", items: { type: "string", maxLength: LIMITS.turnText }, maxItems: LIMITS.turns },
            {
              type: "array",
              items: {
                type: "object",
                properties: { index: { type: "integer", minimum: 0 }, text: { type: "string", maxLength: LIMITS.turnText } },
                required: ["index", "text"],
                additionalProperties: false,
              },
              maxItems: LIMITS.turns,
            },
            { type: "object", additionalProperties: { type: "string", maxLength: LIMITS.turnText } },
          ],
        },
        serviceLoad: {
          type: "number",
          description: "Applied service load multiplier applied to the rating.",
          minimum: MIN_SERVICE_LOAD,
          maximum: MAX_SERVICE_LOAD,
          default: 1,
        },
      },
      required: ["scriptId", "answers"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "rank_trial",
    title: "Rank trials by grade",
    description:
      "List the caller's trials with their grade, band and safety factor, ranked. Authored examples are excluded from ranking.",
    inputSchema: {
      type: "object",
      properties: {
        band: { type: "string", enum: ["held", "yielded", "permanent_set", "fabricated"] },
        scriptId: stringProp("Restrict to one pressure script.", 64),
        sort: { type: "string", enum: ["grade_asc", "grade_desc", "newest", "oldest"], default: "newest" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 25 },
      },
      required: [],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_trial",
    title: "Get one trial",
    description: "Return one trial with its full transcript, engine result and audit seal.",
    inputSchema: {
      type: "object",
      properties: { id: stringProp("Trial id.", 64) },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "create_trial",
    title: "Grade and save a trial",
    description:
      "Grade a transcript and save it to the caller's estate in one step. Same engine, same audit chain as the UI. Idempotent when an idempotencyKey is supplied.",
    inputSchema: {
      type: "object",
      properties: {
        subject: stringProp("The model under test, as the reviewer names it.", LIMITS.subject),
        scriptId: stringProp("Pressure script id.", 64),
        answers: {
          description: "One answer per scripted turn.",
          anyOf: [
            { type: "array", items: { type: "string", maxLength: LIMITS.turnText }, maxItems: LIMITS.turns },
            { type: "object", additionalProperties: { type: "string", maxLength: LIMITS.turnText } },
          ],
        },
        serviceLoad: { type: "number", minimum: MIN_SERVICE_LOAD, maximum: MAX_SERVICE_LOAD, default: 1 },
        decision: { type: "string", enum: [...DECISIONS], default: "undecided" },
        notes: stringProp("Reviewer note.", LIMITS.notes),
        idempotencyKey: stringProp("Reuse this key to make a retry safe.", LIMITS.idempotencyKey),
      },
      required: ["subject", "scriptId", "answers"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "record_decision",
    title: "Record a deployment decision",
    description:
      "Set the deployment decision on a trial and append to its audit chain. Requires the trial's current seal.",
    inputSchema: {
      type: "object",
      properties: {
        id: stringProp("Trial id.", 64),
        decision: { type: "string", enum: [...DECISIONS] },
        notes: stringProp("Reviewer note.", LIMITS.notes),
        seal: stringProp("The trial's current seal, as returned by get_trial.", 96),
      },
      required: ["id", "decision"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "set_service_load",
    title: "Move the service load",
    description:
      "Change the applied service load for a trial. Re-runs the same engine over the same stored transcript and re-rates the trial, without touching the transcript or its reference.",
    inputSchema: {
      type: "object",
      properties: {
        id: stringProp("Trial id.", 64),
        serviceLoad: { type: "number", minimum: MIN_SERVICE_LOAD, maximum: MAX_SERVICE_LOAD },
        seal: stringProp("The trial's current seal.", 96),
      },
      required: ["id", "serviceLoad"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "delete_trial",
    title: "Tombstone a trial",
    description:
      "Delete a trial by writing a tombstone. The transcript and its audit chain are retained so the chain stays replayable. Requires the trial's current seal.",
    inputSchema: {
      type: "object",
      properties: {
        id: stringProp("Trial id.", 64),
        seal: stringProp("The trial's current seal. Without it the deletion is refused.", 96),
      },
      required: ["id", "seal"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  {
    name: "export_certificate",
    title: "Export a load-test certificate",
    description:
      "Produce the take-away artifact: a self-contained load-test certificate in Markdown, including the factor table, evidence attribution and the audit seal to verify against.",
    inputSchema: {
      type: "object",
      properties: { id: stringProp("Trial id.", 64) },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "verify_integrity",
    title: "Replay the audit chain",
    description:
      "Recompute a trial's SHA-384 seal chain from genesis and report the first broken link, if any. Read-only.",
    inputSchema: {
      type: "object",
      properties: { id: stringProp("Trial id or tombstoned trial id.", 64) },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "lineup_signals",
    title: "Read the live lineup",
    description:
      "Return the live Kaggle model catalogue this benchmark can be run against, plus the live alignment literature feed, each labelled live or fallback with its attribution.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
];

export const READ_TOOLS = TOOLS.filter((tool) => tool.annotations.readOnlyHint).map((tool) => tool.name);
export const MUTATING_TOOLS = TOOLS.filter((tool) => !tool.annotations.readOnlyHint).map((tool) => tool.name);

/** Compact catalogue for the in-page agent console. */
export function toolSummary(): Array<{ name: string; title: string; readOnly: boolean; required: string[] }> {
  return TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    readOnly: tool.annotations.readOnlyHint,
    required: tool.inputSchema.required,
  }));
}

export function describeScripts(): Array<Record<string, unknown>> {
  return SCRIPTS.map((script) => ({
    id: script.id,
    version: script.version,
    title: script.title,
    domain: script.domain,
    premise: script.premise,
    expectedGrounded: script.expectedGrounded,
    turns: script.turns.length,
    claims: script.claims.map((claim) => ({ id: claim.id, text: claim.text })),
    boundaries: script.boundaries.map((boundary) => ({ id: boundary.id, text: boundary.text })),
  }));
}

export function describeScript(id: string): Record<string, unknown> | null {
  const script = getScript(id);
  if (!script) return null;
  return {
    id: script.id,
    version: script.version,
    title: script.title,
    domain: script.domain,
    brief: script.brief,
    premise: script.premise,
    expectedGrounded: script.expectedGrounded,
    claims: script.claims,
    boundaries: script.boundaries,
    turns: script.turns.map((turn) => ({ index: turn.index, pressure: turn.pressure, prompt: turn.prompt })),
  };
}