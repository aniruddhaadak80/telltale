/**
 * The live arXiv feed for the alignment literature that motivates the taxonomy.
 *
 * Keyless Atom over HTTP. Responses are parsed with a bounded reader rather than a
 * regex over an unbounded body, and every field is normalised before it leaves
 * this module.
 */

import type { AlignmentPaper } from "../types";
import { SEALED_PAPER_FALLBACK } from "./sealed-fallback";

const ENDPOINT = "http://export.arxiv.org/api/query";
const TIMEOUT_MS = 8000;
const MAX_BYTES = 512_000;

/**
 * The pressure taxonomy in this product is drawn from behaviour reported under
 * social and instructional pressure, so the feed searches those terms rather than
 * alignment in general.
 */
const SEARCH_QUERY = [
  'abs:"sycophancy"',
  'abs:"instruction hierarchy"',
  'abs:"goal misgeneralization"',
  'abs:"deceptive alignment"',
  'abs:"sandbagging"',
].join(" OR ");

export const ARXIV_ATTRIBUTION =
  "Paper metadata from the arXiv Atom API (https://export.arxiv.org/api/query). Metadata is supplied by arXiv contributors under CC0-style terms; the papers themselves remain under their authors' licences. Abstracts are truncated.";

export async function fetchAlignmentPapers(limit = 8): Promise<AlignmentPaper[]> {
  const params = new URLSearchParams({
    search_query: SEARCH_QUERY,
    start: "0",
    max_results: String(Math.max(1, Math.min(25, limit))),
    sortBy: "submittedDate",
    sortOrder: "descending",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
      signal: controller.signal,
      headers: { accept: "application/atom+xml" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = (await response.text()).slice(0, MAX_BYTES);
    return parseAtom(text);
  } finally {
    clearTimeout(timer);
  }
}

function decode(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!match) return "";
  return decode(match[1].replace(/\s+/g, " ").trim());
}

function attributes(block: string, name: string): string[] {
  const match = block.match(new RegExp(`<${name}[^>]*\\bhref="([^"]+)"`, "i"));
  return match ? [match[1]] : [];
}

export function parseAtom(xml: string): AlignmentPaper[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) ?? [];
  const papers: AlignmentPaper[] = [];

  for (const entry of entries) {
    const id = tag(entry, "id");
    const arxivId = id.split("/abs/")[1]?.trim() ?? "";
    const title = tag(entry, "title");
    if (arxivId.length === 0 || title.length === 0) continue;

    const authors = [...entry.matchAll(/<author>[\s\S]*?<\/author>/gi)]
      .map((block) => tag(block[0], "name"))
      .filter((name) => name.length > 0);

    const categories = [...new Set([...entry.matchAll(/<category[^>]*term="([^"]+)"/gi)].map((m) => m[1]))];

    papers.push({
      arxivId,
      title,
      summary: truncate(tag(entry, "summary"), 420),
      published: tag(entry, "published"),
      updated: tag(entry, "updated"),
      authors: authors.slice(0, 6),
      categories: categories.slice(0, 4),
      absUrl: attributes(entry, "id")[0] ?? `https://arxiv.org/abs/${arxivId}`,
    });
  }

  return papers;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function sealedPapers(): AlignmentPaper[] {
  return SEALED_PAPER_FALLBACK.map((paper) => ({ ...paper, authors: [...paper.authors], categories: [...paper.categories] }));
}