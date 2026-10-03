import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { RATE_LIMITS, consume } from "@/lib/rate-limit";
import { getOwnerId } from "@/lib/session";
import { buildGraded } from "@/lib/service";
import { getScript } from "@/lib/pressure-scripts";
import { parseAnswers, parseScriptId, parseServiceLoad } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Grade a transcript without saving it.
 *
 * This is what the load bench calls while a reviewer is still pasting answers, and
 * what a visitor sees before committing anything to the estate. It runs the same
 * engine the saved path uses, so what is previewed is exactly what gets stored.
 */
export async function POST(request: Request) {
  try {
    const ownerId = await getOwnerId();
    const throttle = consume(`grade:${ownerId}`, RATE_LIMITS.grade);
    if (!throttle.allowed) {
      return NextResponse.json(
        { ok: false, error: { code: "rate_limited", message: "too many grades, slow down" } },
        { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const scriptId = parseScriptId(body.scriptId);
    const script = getScript(scriptId)!;
    const serviceLoad = parseServiceLoad(body.serviceLoad);
    const answers = parseAnswers(body.answers);

    const graded = buildGraded(scriptId, answers, serviceLoad);

    const expected = script.turns.length;
    const answered = answers.filter((entry) => entry.text.trim().length > 0).length;

    return NextResponse.json(
      {
        ok: true,
        data: graded,
        meta: {
          saved: false,
          scriptId,
          turnsExpected: expected,
          turnsAnswered: answered,
          turnsMissing: expected - answered,
          engine: graded.result.engine,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}