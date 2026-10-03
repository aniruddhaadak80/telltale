"use client";

/**
 * The verifier form.
 *
 * Replays the chain through the API and shows the real result, including a broken
 * chain rather than a generic failure. The id is kept in the URL so a verification
 * can be linked.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button, StatusNote } from "./ui";

interface VerifyPayload {
  ok: boolean;
  data?: {
    entityId: string;
    ok: boolean;
    checked: number;
    brokenAt: number | null;
    reason: string | null;
    headSeal: string;
    recordedSeal: string;
    sealedMatches: boolean;
    tombstoned: boolean;
  };
  error?: { code: string; message: string };
}

export function VerifyForm({ initialId }: { initialId: string }) {
  const router = useRouter();
  const [id, setId] = useState(initialId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      setError("Enter a trial id to replay.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/integrity?id=${encodeURIComponent(trimmed)}`, {
        cache: "no-store",
      });
      const body = (await response.json()) as VerifyPayload;
      if (!response.ok || !body.ok) {
        setError(body.error?.message ?? `verification failed with status ${response.status}`);
        return;
      }
      // Re-render server-side so the verdict panel reflects the stored result.
      router.push(`/verify?id=${encodeURIComponent(trimmed)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "the verification request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-rule bg-sheet-panel p-4">
      <label htmlFor="verify-id" className="legend">
        Trial id
      </label>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <input
          id="verify-id"
          value={id}
          onChange={(event) => setId(event.target.value)}
          placeholder="trl_…"
          maxLength={64}
          spellCheck={false}
          className="numeric flex-1 border border-rule bg-sheet px-2.5 py-2 text-sm"
        />
        <Button type="submit" variant="primary" disabled={pending}>
          <Play className="h-3.5 w-3.5" />
          {pending ? "Replaying…" : "Replay chain"}
        </Button>
      </div>
      {error ? (
        <div className="mt-3">
          <StatusNote tone="error">{error}</StatusNote>
        </div>
      ) : null}
    </form>
  );
}