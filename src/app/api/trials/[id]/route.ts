import { NextResponse } from "next/server";
import { ApiError, errorResponse } from "@/lib/errors";
import { RATE_LIMITS, consume } from "@/lib/rate-limit";
import { getOwnerId } from "@/lib/session";
import { deleteTrial, getTrial, updateTrial } from "@/lib/service";
import {
  ValidationError,
  parseDecision,
  parseNotes,
  parseSeal,
  parseServiceLoad,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** One trial with its transcript and engine result. */
export async function GET(_request: Request, context: Params) {
  try {
    const ownerId = await getOwnerId();
    const throttle = consume(`trials:read:${ownerId}`, RATE_LIMITS.read);
    if (!throttle.allowed) {
      return NextResponse.json(
        { ok: false, error: { code: "rate_limited", message: "too many reads, slow down" } },
        { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } },
      );
    }

    const { id } = await context.params;
    const trial = await getTrial(id);
    return NextResponse.json({ ok: true, data: trial }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Update notes, decision or the applied service load.
 *
 * Only the fields present in the body are touched. A service-load change re-runs
 * the engine over the stored transcript, so the transcript and its reference never
 * move while the rating does.
 */
export async function PATCH(request: Request, context: Params) {
  try {
    const ownerId = await getOwnerId();
    const throttle = consume(`trials:update:${ownerId}`, RATE_LIMITS.update);
    if (!throttle.allowed) {
      return NextResponse.json(
        { ok: false, error: { code: "rate_limited", message: "too many updates, slow down" } },
        { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } },
      );
    }

    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const hasAny = ["notes", "decision", "serviceLoad"].some((key) => key in body);
    if (!hasAny) {
      throw new ValidationError("supply at least one of notes, decision or serviceLoad", "body");
    }

    const trial = await updateTrial({
      id,
      ...("notes" in body ? { notes: parseNotes(body.notes) } : {}),
      ...("decision" in body ? { decision: parseDecision(body.decision) } : {}),
      ...("serviceLoad" in body ? { serviceLoad: parseServiceLoad(body.serviceLoad) } : {}),
      ...("seal" in body ? { seal: parseSeal(body.seal) } : {}),
    });

    return NextResponse.json({ ok: true, data: trial }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Tombstone a trial. Requires the current seal, so a third party cannot delete it. */
export async function DELETE(request: Request, context: Params) {
  try {
    const ownerId = await getOwnerId();
    const throttle = consume(`trials:delete:${ownerId}`, RATE_LIMITS.delete);
    if (!throttle.allowed) {
      return NextResponse.json(
        { ok: false, error: { code: "rate_limited", message: "too many deletions, slow down" } },
        { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } },
      );
    }

    const { id } = await context.params;

    let seal: string | null = null;
    const header = request.headers.get("x-telltale-seal");
    if (header) seal = header;
    else {
      const text = await request.text();
      if (text.trim().length > 0) {
        const body = (await JSON.parse(text)) as Record<string, unknown>;
        if (typeof body.seal === "string") seal = body.seal;
      }
    }

    // An absent seal is a malformed request; a present but wrong seal is a
    // conflict with the record's current state. Keeping the two distinct tells a
    // caller whether to retry.
    if (!seal) {
      throw ApiError.badRequest(
        "a seal is required to tombstone a trial; read the trial first",
        "seal",
      );
    }

    const result = await deleteTrial(id, parseSeal(seal));

    return NextResponse.json(
      {
        ok: true,
        data: {
          ...result,
          deleted: "tombstoned" as const,
          note: "The row and its audit chain are retained so the seal chain stays replayable. The trial reports 410 from the reading API and is excluded from the estate listing.",
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}