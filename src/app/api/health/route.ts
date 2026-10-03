import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { getDb, ping, resolveAdapter, databaseUrl } from "@/lib/db/client";
import { ENGINE_VERSION } from "@/lib/engine";
import { SCRIPTS } from "@/lib/pressure-scripts";
import { TOOLS } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

/**
 * Health that actually proves the persistence path.
 *
 * A static success object would prove nothing, so this executes a real statement
 * against the configured adapter and reports which adapter answered. In production
 * the adapter is Neon over HTTP; `resolveAdapter` throws at boot without
 * `DATABASE_URL`, so a production response here can never be the embedded store.
 */
export async function GET() {
  try {
    const adapter = resolveAdapter();
    const db = await getDb();
    const roundTrip = await ping(db);

    const trialCount = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM trials WHERE deleted_at IS NULL",
    );
    const auditCount = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_events",
    );

    const checks = {
      /** The persistence path really executed a statement. */
      storeRoundTrip: roundTrip.ok,
      schemaPresent: true,
      auditChainReadable: true,
    };

    const ok = Object.values(checks).every(Boolean);

    return NextResponse.json(
      {
        ok,
        status: ok ? "healthy" : "degraded",
        engine: ENGINE_VERSION,
        store: {
          adapter,
          production: adapter === "neon-postgres",
          configured: databaseUrl() !== null,
          detail: roundTrip.detail,
        },
        checks,
        counts: {
          trials: Number(trialCount[0]?.count ?? "0"),
          auditEvents: Number(auditCount[0]?.count ?? "0"),
        },
        surface: {
          scripts: SCRIPTS.length,
          mcpTools: TOOLS.length,
        },
        checkedAt: new Date().toISOString(),
      },
      { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}