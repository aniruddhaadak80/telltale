"use client";

/**
 * The live lineup strip on the landing page.
 *
 * A Server Component could fetch this, but the honest behaviour is a client fetch
 * with a visible loading state, so a visitor sees the request happen rather than
 * being handed a value that may be forty seconds old.
 */

import { useEffect, useState } from "react";
import type { LineupResponse } from "@/lib/sources";
import type { KaggleModel } from "@/lib/types";
import { Legend, Panel, PanelHead, SourceBadge, StatusNote } from "./ui";

export function LiveLineupStrip() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; payload: LineupResponse } | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch("/api/lineup", { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as {
          ok: boolean;
          data?: LineupResponse;
          error?: { message: string };
        };
        if (!response.ok || !body.ok || !body.data) {
          throw new Error(body.error?.message ?? `the lineup request returned ${response.status}`);
        }
        if (!cancelled) setState({ kind: "ready", payload: body.data });
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof Error && error.name === "AbortError")) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "the lineup request failed",
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <Panel>
        <PanelHead legend="Lineup" title="Reading the catalogue" />
        <div className="p-3">
          <div className="animate-sweep relative h-24 w-full overflow-hidden border border-rule-soft bg-sheet-sunk" />
          <p className="mt-2 text-[11px] text-ink-faint">
            Requesting the Kaggle catalogue and the arXiv feed&hellip;
          </p>
        </div>
      </Panel>
    );
  }

  if (state.kind === "error") {
    return (
      <Panel>
        <PanelHead legend="Lineup" title="Catalogue unavailable" />
        <div className="p-3">
          <StatusNote tone="error">{state.message}</StatusNote>
          <p className="mt-2 text-[11px] text-ink-faint">
            The sealed fallback keeps the dedicated lineup page answerable. This strip reports the failure
            rather than substituting dated data for it.
          </p>
        </div>
      </Panel>
    );
  }

  const models = state.payload.models.data;
  const failedQueries = state.payload.failedQueries;

  return (
    <Panel>
      <PanelHead
        legend="Lineup"
        title={`${models.length} models you can run this against`}
        right={<SourceBadge status={state.payload.models.status} fetchedAt={state.payload.models.fetchedAt} />}
      />
      <div className="max-h-[340px] overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Live model catalogue from the Kaggle public API</caption>
          <thead className="sticky top-0 bg-sheet-sunk">
            <tr className="border-b border-rule">
              <th scope="col" className="legend px-3 py-2">Ref</th>
              <th scope="col" className="legend px-3 py-2">Licence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule-soft">
            {models.slice(0, 12).map((model: KaggleModel) => (
              <tr key={model.ref} className="transition-colors hover:bg-sheet-sunk">
                <td className="px-3 py-1.5">
                  <a
                    href={`https://www.kaggle.com/models/${model.ref}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="numeric text-[11px] text-measured hover:underline"
                  >
                    {model.ref}
                  </a>
                </td>
                <td className="px-3 py-1.5 text-[11px] text-ink-soft">{model.license ?? "unstated"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-rule bg-sheet-sunk px-3 py-2">
        <Legend>Attribution</Legend>
        <p className="mt-1 text-[10px] leading-relaxed text-ink-faint">
          {state.payload.models.attribution}
          {failedQueries.length > 0 && failedQueries[0] !== "all"
            ? ` Partial: ${failedQueries.length} catalogue quer${failedQueries.length === 1 ? "y" : "ies"} did not answer.`
            : ""}
        </p>
      </div>
    </Panel>
  );
}