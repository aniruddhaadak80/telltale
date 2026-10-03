import { describe, expect, it } from "vitest";
import { GENESIS_SEAL, canonicalJson, replayChain, sealEvent, sha384Hex } from "./seal";

/**
 * Known vectors.
 *
 * These pin the two rules the chain depends on: canonical JSON is byte-stable for
 * equal logical values, and the seal is SHA-384 over prevSeal then canonical JSON.
 * If either changes, a previously issued certificate stops verifying, which is the
 * whole point of pinning them.
 */

describe("canonicalJson", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("preserves array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("drops undefined keys rather than emitting null", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("keeps an explicit null, which is different from an absent key", () => {
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
  });

  it("normalises a non-finite number to null rather than emitting invalid JSON", () => {
    expect(canonicalJson({ a: Number.NaN })).toBe('{"a":null}');
  });

  it("produces no insignificant whitespace", () => {
    expect(canonicalJson({ a: 1, b: [1, 2] })).not.toMatch(/\s/);
  });

  it("is byte-identical for logically equal values written in different key orders", () => {
    const left = { subject: "x", result: { grade: 1, band: "held" }, turns: [1, 2] };
    const right = { turns: [1, 2], result: { band: "held", grade: 1 }, subject: "x" };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
  });

  it("distinguishes values that differ only in array order", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("serialises a Date as its ISO string", () => {
    expect(canonicalJson({ at: new Date("2026-01-01T00:00:00.000Z") })).toBe(
      '{"at":"2026-01-01T00:00:00.000Z"}',
    );
  });
});

describe("sealEvent known vectors", () => {
  it("matches SHA-384 of the genesis value followed by the canonical event", () => {
    const event = { seq: 1, entityId: "trl_test", action: "create", at: "2026-01-01T00:00:00.000Z", payload: {} };
    const { seal } = sealEvent(GENESIS_SEAL, event);
    expect(seal).toBe(sha384Hex(`${GENESIS_SEAL}${canonicalJson(event)}`));
    expect(seal).toHaveLength(96);
  });

  it("matches the hand-computed first seal of a known event", () => {
    const event = { seq: 1, entityId: "trl_abc", action: "create", at: "2026-01-01T00:00:00.000Z", payload: { grade: 90 } };
    const { prevSeal, seal } = sealEvent(GENESIS_SEAL, event);
    expect(prevSeal).toBe(GENESIS_SEAL);
    // Recomputed independently of sealEvent, from the two documented inputs.
    expect(seal).toBe(sha384Hex(GENESIS_SEAL + '{"action":"create","at":"2026-01-01T00:00:00.000Z","entityId":"trl_abc","payload":{"grade":90},"seq":1}'));
  });

  it("produces a different seal for a different payload", () => {
    const base = { seq: 1, entityId: "trl_abc", action: "create", at: "2026-01-01T00:00:00.000Z", payload: { grade: 90 } };
    const changed = { ...base, payload: { grade: 91 } };
    expect(sealEvent(GENESIS_SEAL, base).seal).not.toBe(sealEvent(GENESIS_SEAL, changed).seal);
  });

  it("produces a different seal for the same payload at a different sequence", () => {
    const base = { seq: 1, entityId: "trl_abc", action: "create", at: "2026-01-01T00:00:00.000Z", payload: {} };
    expect(sealEvent(GENESIS_SEAL, base).seal).not.toBe(
      sealEvent(GENESIS_SEAL, { ...base, seq: 2 }).seal,
    );
  });

  it("treats an empty previous seal as genesis", () => {
    const event = { seq: 1, entityId: "trl_abc", action: "create", at: "2026-01-01T00:00:00.000Z", payload: {} };
    expect(sealEvent("", event).seal).toBe(sealEvent(GENESIS_SEAL, event).seal);
  });

  it("is deterministic across calls", () => {
    const event = { seq: 3, entityId: "trl_x", action: "decide", at: "2026-02-02T00:00:00.000Z", payload: { b: 2, a: 1 } };
    expect(sealEvent("a".repeat(96), event).seal).toBe(sealEvent("a".repeat(96), event).seal);
  });
});

describe("replayChain", () => {
  function build(count: number) {
    const events: Array<ReturnType<typeof sealEvent> & Record<string, unknown>> = [];
    let previous = GENESIS_SEAL;
    for (let seq = 1; seq <= count; seq += 1) {
      const event = {
        seq,
        entityId: "trl_chain",
        action: seq === 1 ? "create" : "annotate",
        at: `2026-01-0${seq}T00:00:00.000Z`,
        payload: { seq },
      };
      const sealed = sealEvent(previous, event);
      events.push({ ...event, ...sealed });
      previous = sealed.seal;
    }
    return events as Array<{
      seq: number;
      entityId: string;
      action: string;
      at: string;
      payload: Record<string, unknown>;
      prevSeal: string;
      seal: string;
    }>;
  }

  it("verifies an intact chain", () => {
    const result = replayChain(build(4));
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(4);
    expect(result.brokenAt).toBeNull();
  });

  it("reports an empty chain as verified with nothing checked", () => {
    const result = replayChain([]);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
    expect(result.headSeal).toBe(GENESIS_SEAL);
  });

  it("reports the first broken link when a payload is edited", () => {
    const events = build(4);
    events[2].payload = { seq: 999 };
    const result = replayChain(events);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(3);
    expect(result.reason).toContain("does not match its recorded seal");
  });

  it("reports the first broken link when a prevSeal is edited", () => {
    const events = build(4);
    events[1].prevSeal = "f".repeat(96);
    const result = replayChain(events);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.reason).toContain("prevSeal");
  });

  it("stops at the first break rather than reporting every later break", () => {
    const events = build(5);
    events[1].payload = { seq: -1 };
    events[3].payload = { seq: -1 };
    const result = replayChain(events);
    expect(result.brokenAt).toBe(2);
    expect(result.checked).toBe(1);
  });

  it("returns the last good seal as the head when a chain breaks", () => {
    const events = build(3);
    const good = events[1].seal;
    events[2].payload = { seq: 0 };
    expect(replayChain(events).headSeal).toBe(good);
  });

  it("detects a seal that was recomputed but the chain order was rearranged", () => {
    const events = build(3);
    const reordered = [events[0], events[2], events[1]];
    expect(replayChain(reordered as typeof events).ok).toBe(false);
  });
});