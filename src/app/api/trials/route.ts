import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { RATE_LIMITS, consume } from "@/lib/rate-limit";
import { getOwnerId } from "@/lib/session";
import { createTrial, estateSummary, listTrials } from "@/lib/service";
import {
  LIMITS,
  parseAnswers,
  parseDecision,
  parseIdempotencyKey,
  parseNotes,
  parseOrigin,
  parseScriptId,
  parseServiceLoad,
  parseSubject,
  ValidationError,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

/** List the caller's trials. Filters and sort are real query predicates. */
export async function GET(request: Request) {
  try {
    const ownerId = await getOwnerId();
    const throttle = consume(`trials:read:${ownerId}`, RATE_LIMITS.read);
    if (!throttle.allowed) {
      return NextResponse.json(
        { ok: false, error: { code: "rate_limited", message: "too many reads, slow down" } },
        { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } },
      );
    }

    const url = new URL(request.url);
    const band = url.searchParams.get("band");
    const decision = url.searchParams.get("decision");
    const scriptId = url.searchParams.get("scriptId");
    const sort = url.searchParams.get("sort") as
      | "grade_asc"
      | "grade_desc"
      | "newest"
      | "oldest"
      | null;
    const limitRaw = url.searchParams.get("limit");

    const trials = await listTrials({
      ...(band ? { band: band as never } : {}),
      ...(decision ? { decision: decision as never } : {}),
      ...(scriptId ? { scriptId } : {}),
      ...(sort ? { sort } : {}),
      ...(limitRaw ? { limit: Number(limitRaw) } : {}),
    });

    const summary = await estateSummary();

    return NextResponse.json(
      {
        ok: true,
        data: trials,
        meta: {
          count: trials.length,
          summary,
          filter: { band, decision, scriptId, sort, limit: limitRaw },
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Grade a transcript and save it. */
export async function POST(request: Request) {
  try {
    const ownerId = await getOwnerId();
    const throttle = consume(`trials:create:${ownerId}`, RATE_LIMITS.create);
    if (!throttle.allowed) {
      return NextResponse.json(
        { ok: false, error: { code: "rate_limited", message: "too many trials created, slow down" } },
        { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const scriptId = parseScriptId(body.scriptId);
    const subject = parseSubject(body.subject);
    const serviceLoad = parseServiceLoad(body.serviceLoad);
    const origin = parseOrigin(body.origin);
    const decision = parseDecision(body.decision);
    const notes = parseNotes(body.notes);
    const answers = parseAnswers(body.answers);
    const idempotencyKey = parseIdempotencyKey(
      request.headers.get("idempotency-key") ??
        (typeof body.idempotencyKey === "string" ? body.idempotencyKey : null),
    );

    if (notes.length > LIMITS.notes) {
      throw new ValidationError(`notes must be at most ${LIMITS.notes} characters`, "notes");
    }

    const { withIdempotency } = await import("@/lib/service");
    const { replayed, value } = await withIdempotency(
      ownerId,
      "trials:create",
      idempotencyKey,
      () => createTrial({ subject, scriptId, answers, serviceLoad, origin, decision, notes }),
    );

    return NextResponse.json(
      { ok: true, data: value, meta: { replayed } },
      { status: replayed ? 200 : 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

