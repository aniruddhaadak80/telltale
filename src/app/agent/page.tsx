import type { Metadata } from "next";
import { SCRIPTS } from "@/lib/pressure-scripts";
import { AgentConsole } from "@/components/agent-console";
import { Legend } from "@/components/ui";

export const metadata: Metadata = {
  title: "Agent console",
  description:
    "A live MCP-style JSON-RPC 2.0 endpoint over the same service the interface uses: read, analyse and mutate trials with a request and response you can read.",
  alternates: { canonical: "/agent" },
};

export default function AgentPage() {
  const scripts = SCRIPTS.map((script) => ({
    id: script.id,
    title: script.title,
    domain: script.domain,
    premise: script.premise,
    expectedGrounded: script.expectedGrounded,
    turns: script.turns.map((turn) => ({
      index: turn.index,
      pressure: turn.pressure,
      prompt: turn.prompt,
    })),
    claims: script.claims.map((claim) => ({ id: claim.id, text: claim.text })),
  }));

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10">
      <Legend>The agent interface</Legend>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Agent console</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
        Eleven typed tools over JSON-RPC 2.0. The read tools analyse without writing. The write tools call
        the same service functions the bench calls, append to the same SHA-384 chain, and are idempotent on
        a key. Every request and response is shown as it goes on the wire.
      </p>

      <div className="mt-7">
        <AgentConsole scripts={scripts} />
      </div>
    </div>
  );
}