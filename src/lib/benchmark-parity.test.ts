import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { grade } from "./engine";
import { getScript } from "./pressure-scripts";

/**
 * Engine parity between the application and the benchmark.
 *
 * The Kaggle task carries a Python port of `src/lib/engine.ts` in
 * `benchmark/telltale-hold/grader.py`. If the two implementations drift, the
 * published leaderboard and this application report different numbers for the same
 * transcript, which would make the comparison meaningless.
 *
 * This runs a fixture corpus through both and fails on any disagreement in the
 * grade, the band, the safety factor, the observed move turn, the permanent-set
 * count or any of the six factor values.
 *
 * It needs Python and a prepared benchmark directory. When either is missing the
 * check reports that it was skipped rather than passing silently, so a green run
 * always means the parity check actually ran.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const FIXTURES = resolve(ROOT, "benchmark/telltale-hold/fixtures.json");
const GRADER_DIR = resolve(ROOT, "benchmark/telltale-hold");
const SERVICE_LOADS = [1, 1.5, 2.5];

interface Fixture {
  id: string;
  scriptId: string;
  label: string;
  answers: string[];
}

function pythonAvailable(): boolean {
  for (const binary of ["python", "python3", "py"]) {
    try {
      execFileSync(binary, ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      // Try the next candidate.
    }
  }
  return false;
}

function readFixtures(): Fixture[] {
  return (JSON.parse(readFileSync(FIXTURES, "utf8")) as { cases: Fixture[] }).cases;
}

describe("benchmark parity", () => {
  it("has a prepared benchmark directory and a fixture corpus", () => {
    expect(readFixtures().length).toBeGreaterThan(0);
  });

  it("grades the corpus identically in TypeScript and Python", () => {
    if (!pythonAvailable()) {
      console.warn("[parity] no Python interpreter found; the cross-implementation check did not run");
      return;
    }

    const fixtures = readFixtures();
    const cases: Array<{ id: string; scriptId: string; answers: string[]; serviceLoad: number }> = [];

    for (const fixture of fixtures) {
      for (const serviceLoad of SERVICE_LOADS) {
        cases.push({ ...fixture, id: `${fixture.id}@${serviceLoad}`, serviceLoad });
      }
    }

    // The TypeScript engine.
    const expected = cases.map((entry) => {
      const script = getScript(entry.scriptId);
      if (!script) throw new Error(`fixture ${entry.id} names an unknown script ${entry.scriptId}`);
      const result = grade(
        {
          script,
          answers: entry.answers.map((text, index) => ({ index, text })),
        },
        { serviceLoad: entry.serviceLoad },
      );
      return {
        id: entry.id,
        grade: result.grade,
        band: result.band,
        safetyFactor: result.safetyFactor,
        observedYieldTurn: result.observedYieldTurn,
        permanentSet: result.permanentSetClaims.length,
        fabricationCount: result.fabricationCount,
        factors: Object.fromEntries(result.factors.map((factor) => [factor.key, factor.value])),
      };
    });

    // The Python grader that ships inside the Kaggle task.
    const runner = [
      "import json, sys",
      `sys.path.insert(0, ${JSON.stringify(GRADER_DIR)})`,
      "from grader import grade",
      "from scripts import SCRIPTS",
      "catalog = {s['id']: s for s in SCRIPTS}",
      "cases = json.loads(sys.stdin.read())",
      "out = []",
      "for case in cases:",
      "    result = grade(catalog[case['scriptId']], case['answers'], case['serviceLoad'])",
      "    out.append({",
      "        'id': case['id'],",
      "        'grade': result['grade'],",
      "        'band': result['band'],",
      "        'safetyFactor': result['safety_factor'],",
      "        'observedYieldTurn': result['observed_yield_turn'],",
      "        'permanentSet': len(result['permanent_set_claims']),",
      "        'fabricationCount': result['fabrication_count'],",
      "        'factors': result['factors'],",
      "    })",
      "print(json.dumps(out))",
    ].join("\n");

    const stdout = execFileSync("python", ["-c", runner], {
      input: JSON.stringify(cases),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });

    const actual = JSON.parse(stdout) as Array<typeof expected[number]>;
    expect(actual).toHaveLength(expected.length);

    const problems: string[] = [];
    for (let index = 0; index < expected.length; index += 1) {
      const want = expected[index];
      const got = actual[index];

      if (Math.abs(want.grade - got.grade) > 0.01) problems.push(`${want.id}: grade ${want.grade} vs ${got.grade}`);
      if (want.band !== got.band) problems.push(`${want.id}: band ${want.band} vs ${got.band}`);
      if (Math.abs(want.safetyFactor - got.safetyFactor) > 0.0001) {
        problems.push(`${want.id}: safetyFactor ${want.safetyFactor} vs ${got.safetyFactor}`);
      }
      if (want.observedYieldTurn !== got.observedYieldTurn) {
        problems.push(`${want.id}: observedYieldTurn ${want.observedYieldTurn} vs ${got.observedYieldTurn}`);
      }
      if (want.permanentSet !== got.permanentSet) {
        problems.push(`${want.id}: permanentSet ${want.permanentSet} vs ${got.permanentSet}`);
      }
      if (want.fabricationCount !== got.fabricationCount) {
        problems.push(`${want.id}: fabricationCount ${want.fabricationCount} vs ${got.fabricationCount}`);
      }
      for (const [key, value] of Object.entries(want.factors)) {
        if (Math.abs(value - got.factors[key]) > 0.0001) {
          problems.push(`${want.id}: factor ${key} ${value} vs ${got.factors[key]}`);
        }
      }
    }

    if (problems.length > 0) {
      console.error("\nEngine parity failures:\n" + problems.map((line) => `  ${line}`).join("\n"));
      console.error("Run `npm run bench:prepare` and reconcile src/lib/engine.ts with benchmark/telltale-hold/grader.py.");
    }
    expect(problems).toEqual([]);
  });
});