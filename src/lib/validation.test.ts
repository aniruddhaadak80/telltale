import { describe, expect, it } from "vitest";
import {
  LIMITS,
  ValidationError,
  parseAnswers,
  parseDecision,
  parseNotes,
  parseScriptId,
  parseSeal,
  parseServiceLoad,
  parseSubject,
} from "./validation";
import { SCRIPTS } from "./pressure-scripts";
import { MAX_SERVICE_LOAD, MIN_SERVICE_LOAD } from "./engine";

describe("parseSubject", () => {
  it("accepts a normal subject", () => {
    expect(parseSubject("gemma-3-27b-it, system prompt v4")).toBe("gemma-3-27b-it, system prompt v4");
  });

  it("trims surrounding whitespace", () => {
    expect(parseSubject("  llama-3.1  ")).toBe("llama-3.1");
  });

  it("rejects an empty subject", () => {
    expect(() => parseSubject("   ")).toThrow(ValidationError);
  });

  it("rejects a subject over the limit and reports both lengths", () => {
    try {
      parseSubject("x".repeat(LIMITS.subject + 1));
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validation = error as ValidationError;
      expect(validation.field).toBe("subject");
      expect(validation.details?.max).toBe(String(LIMITS.subject));
    }
  });

  it("rejects a non-string subject", () => {
    expect(() => parseSubject(42)).toThrow(ValidationError);
    expect(() => parseSubject(null)).toThrow(ValidationError);
    expect(() => parseSubject({})).toThrow(ValidationError);
  });
});

describe("parseNotes", () => {
  it("treats an absent note as empty", () => {
    expect(parseNotes(undefined)).toBe("");
    expect(parseNotes(null)).toBe("");
  });

  it("rejects a note over the limit", () => {
    expect(() => parseNotes("x".repeat(LIMITS.notes + 1))).toThrow(ValidationError);
  });
});

describe("parseDecision", () => {
  it("defaults to undecided", () => {
    expect(parseDecision(undefined)).toBe("undecided");
  });

  it("accepts every published decision", () => {
    for (const decision of ["ship", "ship_gated", "hold_back", "blocked"] as const) {
      expect(parseDecision(decision)).toBe(decision);
    }
  });

  it("rejects an unknown decision", () => {
    expect(() => parseDecision("deploy_immediately")).toThrow(ValidationError);
  });
});

describe("parseScriptId", () => {
  it("accepts a published script", () => {
    expect(parseScriptId("queue-latency")).toBe("queue-latency");
  });

  it("rejects an unknown script and lists what is available", () => {
    try {
      parseScriptId("not-a-script");
      throw new Error("should have thrown");
    } catch (error) {
      const validation = error as ValidationError;
      expect(validation.field).toBe("scriptId");
      expect(validation.details?.available).toBe(SCRIPTS.map((script) => script.id).join(", "));
    }
  });
});

describe("parseServiceLoad", () => {
  it("defaults to one", () => {
    expect(parseServiceLoad(undefined)).toBe(1);
  });

  it("accepts a numeric string", () => {
    expect(parseServiceLoad("1.25")).toBe(1.25);
  });

  it("rejects a load outside the published bounds", () => {
    expect(() => parseServiceLoad(MAX_SERVICE_LOAD + 0.01)).toThrow(ValidationError);
    expect(() => parseServiceLoad(MIN_SERVICE_LOAD - 0.01)).toThrow(ValidationError);
  });

  it("rejects a non-numeric load", () => {
    expect(() => parseServiceLoad("heavy")).toThrow(ValidationError);
    expect(() => parseServiceLoad(Number.NaN)).toThrow(ValidationError);
  });
});

describe("parseSeal", () => {
  it("accepts a 96 character lowercase hex digest", () => {
    const seal = "a".repeat(96);
    expect(parseSeal(seal)).toBe(seal);
  });

  it("rejects uppercase hex, because seals are stored lowercase", () => {
    expect(() => parseSeal("A".repeat(96))).toThrow(ValidationError);
  });

  it("rejects a digest of the wrong length", () => {
    expect(() => parseSeal("a".repeat(95))).toThrow(ValidationError);
  });

  it("rejects a missing seal", () => {
    expect(() => parseSeal("")).toThrow(ValidationError);
    expect(() => parseSeal(undefined)).toThrow(ValidationError);
  });
});

describe("parseAnswers", () => {
  it("accepts an array of strings and assigns positional indices", () => {
    const parsed = parseAnswers(["a", "b"]);
    expect(parsed).toEqual([
      { index: 0, text: "a" },
      { index: 1, text: "b" },
    ]);
  });

  it("accepts an array of objects", () => {
    expect(parseAnswers([{ index: 2, text: "third" }])).toEqual([{ index: 2, text: "third" }]);
  });

  it("accepts an object keyed by index", () => {
    expect(parseAnswers({ "0": "first", "1": "second" })).toEqual([
      { index: 0, text: "first" },
      { index: 1, text: "second" },
    ]);
  });

  it("unwraps an answers envelope", () => {
    expect(parseAnswers({ answers: ["only"] })).toEqual([{ index: 0, text: "only" }]);
  });

  it("sorts by index so order of arrival cannot change the result", () => {
    const parsed = parseAnswers([{ index: 3, text: "d" }, { index: 1, text: "b" }]);
    expect(parsed.map((entry) => entry.index)).toEqual([1, 3]);
  });

  it("keeps blank entries out of the answer set but leaves the gap", () => {
    const parsed = parseAnswers(["a", "   ", "c"]);
    expect(parsed.filter((entry) => entry.text.trim().length > 0).length).toBe(2);
  });

  it("rejects an empty answer set", () => {
    expect(() => parseAnswers([])).toThrow(ValidationError);
    expect(() => parseAnswers(["", "  "])).toThrow(ValidationError);
  });

  it("rejects more turns than the transcript limit", () => {
    const many = Array.from({ length: LIMITS.turns + 1 }, (_, index) => `t${index}`);
    expect(() => parseAnswers(many)).toThrow(ValidationError);
  });

  it("rejects a single answer over the per-turn limit and reports the length", () => {
    try {
      parseAnswers(["x".repeat(LIMITS.turnText + 1)]);
      throw new Error("should have thrown");
    } catch (error) {
      const validation = error as ValidationError;
      expect(validation.field).toContain("answers[0]");
      expect(validation.details?.max).toBe(String(LIMITS.turnText));
    }
  });

  it("rejects rather than silently truncating an over-long answer", () => {
    // Evidence must never be altered by validation: a truncated answer would be
    // graded as if the model had written less than it did.
    expect(() => parseAnswers(["x".repeat(LIMITS.turnText + 50)])).toThrow(ValidationError);
  });

  it("rejects a malformed entry", () => {
    expect(() => parseAnswers([42])).toThrow(ValidationError);
    expect(() => parseAnswers([{ index: 0 }])).toThrow(ValidationError);
  });

  it("rejects a non-array, non-object answer payload", () => {
    expect(() => parseAnswers("just a string")).toThrow(ValidationError);
    expect(() => parseAnswers(null)).toThrow(ValidationError);
  });

  it("rejects an object key that is not a turn index", () => {
    expect(() => parseAnswers({ first: "a" })).toThrow(ValidationError);
    expect(() => parseAnswers({ "-1": "a" })).toThrow(ValidationError);
  });

  it("rejects an object value that is not a string", () => {
    expect(() => parseAnswers({ "0": 5 })).toThrow(ValidationError);
  });

  it("accepts a partial transcript, because a gap is a legitimate state", () => {
    expect(parseAnswers(["only the opening"]).length).toBe(1);
  });
});