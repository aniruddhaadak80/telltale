import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { RATE_LIMITS, consume } from "@/lib/rate-limit";
import { getOwnerId, requireOwnerId } from "@/lib/session";
import { getSettings, updateSettings } from "@/lib/service";
import { parseServiceLoad } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    const settings = await getSettings(ownerId);
    return NextResponse.json({ ok: true, data: settings }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await requireOwnerId();
    const throttle = consume(`settings:${ownerId}`, RATE_LIMITS.update);
    if (!throttle.allowed) {
      return NextResponse.json(
        { ok: false, error: { code: "rate_limited", message: "too many setting changes, slow down" } },
        { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const serviceLoad = parseServiceLoad(body.serviceLoad);
    const settings = await updateSettings(serviceLoad, ownerId);

    return NextResponse.json({ ok: true, data: settings }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}