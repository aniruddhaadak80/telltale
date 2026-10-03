"use client";

/**
 * The session's default service load.
 *
 * Persisted server-side rather than in the browser, because the value a reviewer
 * is working under is part of how a grade should be interpreted and should survive a
 * refresh on the same device.
 */

import { useState } from "react";
import { Save } from "lucide-react";
import { Button, StatusNote } from "./ui";
import { LoadDial } from "./load-figure";

export function SettingsForm({ initialServiceLoad }: { initialServiceLoad: number }) {
  const [value, setValue] = useState(initialServiceLoad);
  const [saved, setSaved] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = value !== initialServiceLoad;

  async function save() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serviceLoad: value }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        data?: { serviceLoad: number };
        error?: { message: string };
      };
      if (!response.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? `saving failed with status ${response.status}`);
        return;
      }
      setSaved(body.data.serviceLoad);
      setValue(body.data.serviceLoad);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "the save request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <LoadDial value={value} onChange={setValue} label="Default applied service load" />

      <p className="text-xs leading-relaxed text-ink-soft">
        New trials in this session start at this load. A trial records the load it was saved at, so moving
        this default never rewrites an existing grade.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => void save()} disabled={!dirty || pending}>
          <Save className="h-3.5 w-3.5" />
          {pending ? "Saving…" : "Save default"}
        </Button>
        {saved !== null && !dirty ? (
          <span className="numeric text-[11px] text-held" role="status">
            Saved at {saved.toFixed(2)}&times;
          </span>
        ) : null}
        {dirty && saved === null ? (
          <span className="text-[11px] text-caution" role="status">
            Unsaved change
          </span>
        ) : null}
      </div>

      {error ? <StatusNote tone="error">{error}</StatusNote> : null}
    </div>
  );
}