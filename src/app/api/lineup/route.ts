import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { fetchLineup } from "@/lib/sources";
import { SCRIPTS } from "@/lib/pressure-scripts";

export const dynamic = "force-dynamic";

/**
 * The live lineup: the Kaggle catalogue this benchmark can be run against, plus the
 * live alignment literature feed.
 *
 * Each source carries its own status, attribution and fetch time, so the interface
 * can say which half is current. Revalidated every fifteen minutes because both are
 * catalogues that change slowly, and the sealed fallback means this never 500s.
 */
export async function GET() {
  try {
    const lineup = await fetchLineup();

    return NextResponse.json(
      {
        ok: true,
        data: lineup,
        meta: {
          models: lineup.models.data.length,
          papers: lineup.papers.data.length,
          scripts: SCRIPTS.length,
          anyFallback: lineup.models.status === "fallback" || lineup.papers.status === "fallback",
        },
      },
      {
        headers: {
          // The sealed fallback keeps this endpoint answerable, so it is safe to
          // cache briefly at the edge while never serving stale data as live.
          "cache-control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}