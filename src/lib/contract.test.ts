import { describe, expect, it } from "vitest";
import { parseAtom } from "./sources/arxiv";
import { isRunnableCandidate, normalise as normaliseModel } from "./sources/kaggle";
import { SCRIPTS, getScript, loadProfile, pressureTurns } from "./pressure-scripts";
import { ENGINE_VERSION, FACTOR_WEIGHTS } from "./engine";
import { TOOLS, MUTATING_TOOLS, READ_TOOLS, describeScript, describeScripts } from "./mcp/tools";

describe("pressure scripts", () => {
  it("ships at least one script", () => {
    expect(SCRIPTS.length).toBeGreaterThan(0);
  });

  it("gives every script a unique id", () => {
    const ids = SCRIPTS.map((script) => script.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("opens every script with a neutral turn and closes it with an unload turn", () => {
    for (const script of SCRIPTS) {
      expect(script.turns[0].pressure).toBe("neutral");
      expect(script.turns[script.turns.length - 1].pressure).toBe("unload");
    }
  });

  it("escalates through every load-bearing pressure class in order", () => {
    const expected = ["authority", "social_proof", "urgency", "sunk_cost", "direct_denial"];
    for (const script of SCRIPTS) {
      expect(pressureTurns(script).map((turn) => turn.pressure)).toEqual(expected);
    }
  });

  it("declares at least one verifiable claim and one boundary per script", () => {
    for (const script of SCRIPTS) {
      expect(script.claims.length).toBeGreaterThan(0);
      expect(script.boundaries.length).toBeGreaterThan(0);
    }
  });

  it("publishes retreat cues for every claim, because the detector must be checkable", () => {
    for (const script of SCRIPTS) {
      for (const claim of script.claims) {
        expect(claim.withdrawCues.length).toBeGreaterThan(0);
        expect(claim.terms.length).toBeGreaterThan(0);
      }
    }
  });

  it("publishes boundary cues for every boundary", () => {
    for (const script of SCRIPTS) {
      for (const boundary of script.boundaries) {
        expect(boundary.cues.length).toBeGreaterThan(0);
      }
    }
  });

  it("gives every claim a unique id within its script", () => {
    for (const script of SCRIPTS) {
      const ids = script.claims.map((claim) => claim.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("uses contiguous turn indices from zero", () => {
    for (const script of SCRIPTS) {
      expect(script.turns.map((turn) => turn.index)).toEqual(script.turns.map((_, index) => index));
    }
  });

  it("builds a load profile that rises monotonically to one", () => {
    for (const script of SCRIPTS) {
      const profile = loadProfile(script);
      expect(profile.length).toBe(pressureTurns(script).length);
      expect(profile[0]).toBeGreaterThan(0);
      expect(profile[profile.length - 1]).toBeCloseTo(1, 10);
      for (let index = 1; index < profile.length; index += 1) {
        expect(profile[index]).toBeGreaterThan(profile[index - 1]);
      }
    }
  });

  it("returns undefined for an unknown script id", () => {
    expect(getScript("nope")).toBeUndefined();
  });
});

describe("engine contract", () => {
  it("sums the published weights to exactly one", () => {
    const total = Object.values(FACTOR_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
  });

  it("version-stamps the engine", () => {
    expect(ENGINE_VERSION).toMatch(/^telltale-grade\/\d+\.\d+\.\d+$/);
  });
});

describe("mcp tool surface", () => {
  it("declares unique tool names", () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("includes at least one read tool, one analysis tool and one mutating tool", () => {
    expect(READ_TOOLS.length).toBeGreaterThan(0);
    expect(TOOLS.some((tool) => tool.name === "grade_transcript" && tool.annotations.readOnlyHint)).toBe(true);
    expect(MUTATING_TOOLS.length).toBeGreaterThan(0);
  });

  it("marks every mutating tool with a schema that accepts no unknown fields", () => {
    for (const tool of TOOLS.filter((candidate) => !candidate.annotations.readOnlyHint)) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });

  it("requires a seal on the destructive tool", () => {
    const destructive = TOOLS.find((tool) => tool.name === "delete_trial");
    expect(destructive?.annotations.destructiveHint).toBe(true);
    expect(destructive?.inputSchema.required).toContain("seal");
  });

  it("requires a seal on the mutating tools that guard a record", () => {
    for (const name of ["record_decision", "set_service_load"]) {
      const tool = TOOLS.find((candidate) => candidate.name === name)!;
      expect(tool.annotations.readOnlyHint).toBe(false);
      expect(tool.inputSchema.properties).toHaveProperty("seal");
    }
  });

  it("gives every tool a title and a description a reviewer can act on", () => {
    for (const tool of TOOLS) {
      expect(tool.title.length).toBeGreaterThan(3);
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it("summarises every script for the agent", () => {
    const summary = describeScripts();
    expect(summary.length).toBe(SCRIPTS.length);
    expect(summary[0]).toHaveProperty("expectedGrounded");
    expect(summary[0]).toHaveProperty("claims");
  });

  it("describes one script in full, with every scripted turn", () => {
    const script = getScript("seed-viability")!;
    const described = describeScript("seed-viability");
    expect(described).not.toBeNull();
    expect(described!.turns).toHaveLength(script.turns.length);
    expect(described!.claims).toHaveLength(script.claims.length);
  });

  it("returns null for an unknown script", () => {
    expect(describeScript("nope")).toBeNull();
  });
});

describe("kaggle model normalisation", () => {
  it("keeps a runnable chat model ref", () => {
    expect(isRunnableCandidate("google/gemma-3")).toBe(true);
    expect(isRunnableCandidate("qwen-lm/qwen-3")).toBe(true);
  });

  it("excludes weight files and quantisations", () => {
    expect(isRunnableCandidate("zhenhuaw/pretrained_minigpt4_llama2_7b.pth")).toBe(false);
    expect(isRunnableCandidate("someone/model.gguf")).toBe(false);
    expect(isRunnableCandidate("someone/model-lora")).toBe(false);
  });

  it("normalises a wire record into the domain shape", () => {
    const model = normaliseModel({
      ref: "google/gemma-3",
      title: "Gemma 3",
      instances: [{ licenseName: "Gemma", framework: "pyTorch" }],
      updateTime: "2026-09-01T00:00:00Z",
    });
    expect(model).not.toBeNull();
    expect(model!.provider).toBe("google");
    expect(model!.license).toBe("Gemma");
    expect(model!.taskTypes).toEqual(["pyTorch"]);
  });

  it("tolerates a record with no instances, leaving licence unstated rather than inventing one", () => {
    const model = normaliseModel({ ref: "acme/thing", title: "Thing", instances: [] });
    expect(model!.license).toBeNull();
    expect(model!.taskTypes).toEqual([]);
  });

  it("rejects a record with no ref", () => {
    expect(normaliseModel({ title: "No ref" })).toBeNull();
    expect(normaliseModel({ ref: "" })).toBeNull();
  });
});

describe("arxiv atom parsing", () => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2601.00001v1</id>
    <updated>2026-01-02T00:00:00Z</updated>
    <published>2026-01-01T00:00:00Z</published>
    <title>A title about sycophancy</title>
    <summary>An abstract with &lt;markup&gt; and an &amp; entity.</summary>
    <author><name>A Author</name></author>
    <author><name>B Author</name></author>
    <category term="cs.CL" />
    <category term="cs.AI" />
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2601.00002v1</id>
    <published>2026-01-03T00:00:00Z</published>
    <updated>2026-01-03T00:00:00Z</updated>
    <title>Second paper</title>
    <summary>Second abstract.</summary>
    <author><name>C Author</name></author>
  </entry>
</feed>`;

  it("parses every entry", () => {
    expect(parseAtom(feed)).toHaveLength(2);
  });

  it("extracts the arxiv id and the abstract url", () => {
    const [first] = parseAtom(feed);
    expect(first.arxivId).toBe("2601.00001v1");
    expect(first.absUrl).toContain("2601.00001v1");
  });

  it("decodes entities in the summary", () => {
    const [first] = parseAtom(feed);
    expect(first.summary).toContain("<markup>");
    expect(first.summary).toContain("&");
  });

  it("collects authors and deduplicates categories", () => {
    const [first] = parseAtom(feed);
    expect(first.authors).toEqual(["A Author", "B Author"]);
    expect(first.categories).toEqual(["cs.CL", "cs.AI"]);
  });

  it("skips an entry with no title rather than emitting a half record", () => {
    const broken = `<feed><entry><id>http://arxiv.org/abs/1</id><summary>no title</summary></entry></feed>`;
    expect(parseAtom(broken)).toHaveLength(0);
  });

  it("returns an empty list for an empty feed", () => {
    expect(parseAtom("<feed></feed>")).toEqual([]);
  });

  it("returns an empty list rather than throwing on malformed xml", () => {
    expect(parseAtom("not xml at all")).toEqual([]);
  });
});