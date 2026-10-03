import { NextResponse } from "next/server";
import { SCRIPTS } from "@/lib/pressure-scripts";

export const dynamic = "force-dynamic";

/**
 * The published probe library.
 *
 * Served rather than imported into a Server Component so the exact same document
 * the grader uses is what the API, the interface and a curl caller receive.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const script = SCRIPTS.find((candidate) => candidate.id === id);
    if (!script) {
      return NextResponse.json(
        { ok: false, error: { code: "not_found", message: `unknown pressure script: ${id}` } },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, data: script },
      { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      data: SCRIPTS,
      meta: { count: SCRIPTS.length },
    },
    { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}