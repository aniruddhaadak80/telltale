import { NextResponse } from "next/server";
import { ApiError, errorResponse } from "@/lib/errors";
import { getOwnerId } from "@/lib/session";
import { listAuditedEntities } from "@/lib/integrity/audit";
import { getDb } from "@/lib/db/client";
import { getTrial, verifyTrial } from "@/lib/service";

export const dynamic = "force-dynamic";

/**
 * Replay a trial's seal chain, or summarise every chain the caller owns.
 *
 * Replay recomputes SHA-384 from genesis over the canonical event material and
 * reports the first link that does not verify. A trial the caller cannot read is
 * reported as not found rather than as a chain, so this never becomes a probe for
 * whether an id exists.
 */
export async function GET(request: Request) {
  try {
    const ownerId = await getOwnerId();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      const db = await getDb();
      const entities = await listAuditedEntities(db);
      const owned = [];
      for (const entity of entities) {
        try {
          await getTrial(entity.entityId, ownerId);
          owned.push(entity);
        } catch {
          // Another session's chain. Not listed, not counted, not described.
        }
      }
      return NextResponse.json(
        { ok: true, data: { entities: owned }, meta: { count: owned.length } },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const result = await verifyTrial(id);
    if (!result.ok) {
      return NextResponse.json(
        { ok: true, data: result, meta: { verified: false } },
        { status: 200, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: true, data: result, meta: { verified: true } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Replay by POST, for the verifier form. Separate from the GET so the route does
 * not need to parse a body on the common path.
 */
export async function POST(request: Request) {
  try {
    await getOwnerId();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (id.length === 0) throw ApiError.badRequest("an id is required", "id");

    const result = await verifyTrial(id);
    return NextResponse.json(
      { ok: true, data: result, meta: { verified: result.ok } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

