/**
 * Input validation.
 *
 * Every external string is bounded here, before it reaches the engine, the
 * database or a query. Validation failures carry the offending field so a form
 * can mark the exact input rather than showing a generic error.
 */

import { DECISIONS, type Decision, type TrialOrigin } from "./types";
import { SCRIPTS, getScript } from "./pressure-scripts";
import { MIN_SERVICE_LOAD, MAX_SERVICE_LOAD } from "./engine";

export class ValidationError extends Error {
  readonly field: string;
  readonly details?: Record<string, string>;

  constructor(message: string, field: string, details?: Record<string, string>) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.details = details;
  }
}

export const LIMITS = {
  subject: 120,
  notes: 2000,
  turnText: 8000,
  turns: 32,
  passwordlessSeal: 96,
  idempotencyKey: 200,
  shareToken: 64,
} as const;

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`, field);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${field} must not be empty`, field);
  }
  if (trimmed.length > max) {
    throw new ValidationError(`${field} must be at most ${max} characters`, field, {
      actual: String(trimmed.length),
      max: String(max),
    });
  }
  return trimmed;
}

function optionalString(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return "";
  return requireString(value, field, max);
}

export function parseSubject(value: unknown): string {
  return requireString(value, "subject", LIMITS.subject);
}

export function parseNotes(value: unknown): string {
  return optionalString(value, "notes", LIMITS.notes);
}

export function parseNotesPatch(value: unknown): string {
  return optionalString(value, "notes", LIMITS.notes);
}

export function parseDecision(value: unknown): Decision {
  if (value === undefined || value === null) return "undecided";
  if (typeof value !== "string" || !DECISIONS.includes(value as Decision)) {
    throw new ValidationError(`decision must be one of ${DECISIONS.join(", ")}`, "decision");
  }
  return value as Decision;
}

export function parseOrigin(value: unknown): TrialOrigin {
  if (value === undefined || value === null) return "pasted";
  if (value !== "pasted" && value !== "agent" && value !== "authored_example") {
    throw new ValidationError("origin must be pasted, agent or authored_example", "origin");
  }
  return value;
}

export function parseScriptId(value: unknown): string {
  const id = requireString(value, "scriptId", 64);
  if (!getScript(id)) {
    throw new ValidationError(`unknown pressure script: ${id}`, "scriptId", {
      available: SCRIPTS.map((script) => script.id).join(", "),
    });
  }
  return id;
}

export function parseServiceLoad(value: unknown): number {
  if (value === undefined || value === null) return 1;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new ValidationError("serviceLoad must be a number", "serviceLoad");
  }
  if (numeric < MIN_SERVICE_LOAD || numeric > MAX_SERVICE_LOAD) {
    throw new ValidationError(
      `serviceLoad must be between ${MIN_SERVICE_LOAD} and ${MAX_SERVICE_LOAD}`,
      "serviceLoad",
    );
  }
  return Math.round(numeric * 100) / 100;
}

export function parseSeal(value: unknown): string {
  const seal = requireString(value, "seal", LIMITS.passwordlessSeal);
  if (!/^[a-f0-9]{96}$/.test(seal)) {
    throw new ValidationError("seal must be a 96 character lowercase hex digest", "seal");
  }
  return seal;
}

/** A graded answer with its turn index always resolved. */
export interface ParsedAnswer {
  index: number;
  text: string;
}

/**
 * Accepts the two shapes a reviewer is likely to paste, plus the structured form
 * the agent tool uses:
 *
 *   ["answer one", "answer two"]
 *   [{ "index": 0, "text": "answer one" }]
 *   { "0": "answer one", "1": "answer two" }
 */
export function parseAnswers(value: unknown): ParsedAnswer[] {
  let raw: unknown = value;

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    raw = "answers" in record ? record.answers : record;
  }

  const entries: Array<{ index: number; text: string }> = [];

  if (Array.isArray(raw)) {
    if (raw.length > LIMITS.turns) {
      throw new ValidationError(`a transcript may hold at most ${LIMITS.turns} turns`, "answers");
    }
    raw.forEach((item, position) => {
      if (typeof item === "string") {
        entries.push({ index: position, text: item });
        return;
      }
      if (item !== null && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const index = typeof record.index === "number" ? record.index : position;
        if (typeof record.text !== "string") {
          throw new ValidationError(`answer ${position} must have a text field`, `answers[${position}].text`);
        }
        entries.push({ index, text: record.text });
        return;
      }
      throw new ValidationError(
        `answer ${position} must be a string or an object with a text field`,
        `answers[${position}]`,
      );
    });
  } else if (raw !== null && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length > LIMITS.turns) {
      throw new ValidationError(`a transcript may hold at most ${LIMITS.turns} turns`, "answers");
    }
    for (const key of keys) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0) {
        throw new ValidationError(`answer key "${key}" must be a non-negative integer index`, "answers");
      }
      if (typeof record[key] !== "string") {
        throw new ValidationError(`answer ${key} must be a string`, `answers.${key}`);
      }
      entries.push({ index, text: record[key] });
    }
  } else {
    throw new ValidationError(
      "answers must be an array of strings, an array of {index,text}, or an object keyed by index",
      "answers",
    );
  }

  for (const entry of entries) {
    if (entry.text.trim().length === 0) continue;
    if (entry.text.length > LIMITS.turnText) {
      throw new ValidationError(
        `answer ${entry.index} must be at most ${LIMITS.turnText} characters`,
        `answers[${entry.index}]`,
        { actual: String(entry.text.length), max: String(LIMITS.turnText) },
      );
    }
  }

  const answered = entries.filter((entry) => entry.text.trim().length > 0).length;
  if (answered === 0) {
    throw new ValidationError("supply at least one model answer to grade", "answers");
  }
  // A partial transcript is graded as far as it goes. The interface reports how
  // many turns are unanswered, and the engine scores a gap as a non-response
  // rather than shifting later answers onto the wrong turn.

  entries.sort((a, b) => a.index - b.index);
  return entries.map((entry) => ({ index: entry.index, text: entry.text.slice(0, LIMITS.turnText) }));
}

export function parseIdempotencyKey(value: string | null): string | null {
  if (!value) return null;
  const key = value.trim();
  if (key.length === 0) return null;
  if (key.length > LIMITS.idempotencyKey) {
    throw new ValidationError(
      `idempotency key must be at most ${LIMITS.idempotencyKey} characters`,
      "idempotency-key",
    );
  }
  return key;
}