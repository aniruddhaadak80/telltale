import type { Metadata } from "next";
import { getOwnerId } from "@/lib/session";
import { getDb } from "@/lib/db/client";
import { resolveAdapter } from "@/lib/db/client";
import { estateSummary } from "@/lib/service";
import { SCRIPTS } from "@/lib/pressure-scripts";
import { ENGINE_VERSION } from "@/lib/engine";
import { TOOLS } from "@/lib/mcp/tools";
import { Legend, Panel, PanelHead, StatusNote } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";

export const metadata: Metadata = {
  title: "Settings",
  description: "Store configuration, adapter identity and the surface this build exposes.",
  alternates: { canonical: "/settings" },
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ownerId = await getOwnerId();
  const summary = await estateSummary();

  let adapter = resolveAdapter();
  let storageDetail = "Not probed on this render.";
  let probeError: string | null = null;

  try {
    const db = await getDb();
    const rows = await db.query<{ adapter: string }>(
      "SELECT current_setting('server_version') AS adapter",
    );
    storageDetail = rows[0]?.adapter
      ? `Server version reported as ${rows[0].adapter}.`
      : "Statement round-trip succeeded.";
    adapter = db.adapter;
  } catch (error) {
    probeError = error instanceof Error ? error.message : "the store could not be probed";
  }

  const settingsRows = await getDb()
    .then((db) => db.query<{ service_load: number }>(
      "SELECT service_load FROM settings WHERE owner_id = $1",
      [ownerId],
    ))
    .catch(() => [] as Array<{ service_load: number }>);

  const storedServiceLoad = Number(settingsRows[0]?.service_load ?? 1);

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-10">
      <header>
        <Legend>Configuration</Legend>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          The default service load for new trials in this session, and exactly what this deployment is
          running. There are no accounts and no API keys: ownership is an anonymous cookie in this browser.
        </p>
      </header>

      <Panel className="mt-7">
        <PanelHead legend="Session default" title="Applied service load for new trials" />
        <div className="p-4">
          <SettingsForm initialServiceLoad={storedServiceLoad} />
        </div>
      </Panel>

      <Panel className="mt-4">
        <PanelHead legend="Runtime" title="What this deployment actually is" />
        <dl className="grid gap-3 p-4 sm:grid-cols-2">
          {[
            { label: "Engine", value: ENGINE_VERSION },
            { label: "Store adapter", value: adapter },
            { label: "Store is hosted", value: adapter === "neon-postgres" ? "yes, Neon over HTTP" : "no, embedded local store" },
            { label: "Published probes", value: `${SCRIPTS.length} scripts, ${SCRIPTS.reduce((sum, script) => sum + script.turns.length, 0)} scripted turns` },
            { label: "Agent tools", value: `${TOOLS.length} (${TOOLS.filter((tool) => !tool.annotations.readOnlyHint).length} mutating)` },
            { label: "Trials in this session", value: String(summary.trials) },
          ].map((row) => (
            <div key={row.label} className="grid gap-0.5">
              <dt className="legend">{row.label}</dt>
              <dd className="numeric text-ink-soft">{row.value}</dd>
            </div>
          ))}
        </dl>
        {probeError ? (
          <div className="px-4 pb-4">
            <StatusNote tone="error">Store probe failed: {probeError}</StatusNote>
          </div>
        ) : (
          <div className="border-t border-rule bg-sheet-sunk px-4 py-2">
            <p className="numeric text-[10px] text-ink-faint">{storageDetail}</p>
          </div>
        )}
      </Panel>

      <Panel className="mt-4">
        <PanelHead legend="Security model" title="Who can do what" />
        <div className="grid gap-2 p-4 text-xs leading-relaxed text-ink-soft">
          <p>
            <strong className="text-ink">Ownership.</strong> An unguessable 128-bit owner id is set in an
            HTTP-only cookie before any render. Every query is scoped to it, so one visitor cannot read or
            mutate another visitor&rsquo;s trials. Ownership is per browser, so clearing cookies starts a new
            empty estate.
          </p>
          <p>
            <strong className="text-ink">Destructive operations.</strong> A tombstone requires the
            record&rsquo;s current seal, which is only readable by someone who can already read the record.
            A stale link cannot delete a trial.
          </p>
          <p>
            <strong className="text-ink">Abuse controls.</strong> Writes are throttled per owner. On a
            serverless runtime that counter is per instance and therefore a hint rather than a guarantee; the
            real limits are the bounded list sizes, the input size caps and the database constraints. A
            deployment that needs a hard global limit should put a rate limiter in front of the routes.
          </p>
          <p>
            <strong className="text-ink">Input.</strong> Every external string is bounded before it reaches
            the engine or the database, every query is parameterised, and error responses carry a stable code
            and message rather than a stack trace.
          </p>
        </div>
      </Panel>
    </div>
  );
}