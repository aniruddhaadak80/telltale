import { errorResponse } from "@/lib/errors";
import { RATE_LIMITS, consume } from "@/lib/rate-limit";
import { getOwnerId } from "@/lib/session";
import { getTrial } from "@/lib/service";
import { certificateJson, renderCertificate } from "@/lib/export";
import { ApiError } from "@/lib/errors";
import { SEALED_FALLBACK_OBSERVED_AT } from "@/lib/sources";

export const dynamic = "force-dynamic";

/**
 * Download the load-test certificate.
 *
 * `?format=md` streams Markdown for a ticket or a review; `?format=json` returns the
 * machine-readable record. Both are real files with real content, not a placeholder.
 */
export async function GET(request: Request) {
  try {
    const ownerId = await getOwnerId();
    const throttle = consume(`export:${ownerId}`, RATE_LIMITS.export);
    if (!throttle.allowed) {
      throw new ApiError("rate_limited", "too many exports, slow down");
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const format = url.searchParams.get("format") ?? "md";

    if (!id) throw ApiError.badRequest("an id is required", "id");
    if (format !== "md" && format !== "json") {
      throw ApiError.badRequest("format must be md or json", "format");
    }

    const trial = await getTrial(id);
    const origin = url.origin;
    const verifyUrl = `${origin}/verify?id=${encodeURIComponent(trial.id)}`;

    const safeSubject = trial.subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    const filename = `telltale-${safeSubject || "trial"}-${trial.id}.${format === "json" ? "json" : "md"}`;

    if (format === "json") {
      const document = certificateJson({
        trial,
        verifyUrl,
        fallbackObservedAt: SEALED_FALLBACK_OBSERVED_AT,
      });
      return new Response(`${JSON.stringify(document, null, 2)}\n`, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
          "cache-control": "no-store",
        },
      });
    }

    const markdown = renderCertificate({
      trial,
      verifyUrl,
      fallbackObservedAt: SEALED_FALLBACK_OBSERVED_AT,
      lineupStatus: "live",
    });

    return new Response(markdown, {
      status: 200,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}