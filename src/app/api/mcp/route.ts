import { NextResponse } from "next/server";
import { ApiError } from "@/lib/errors";
import { RATE_LIMITS, consume } from "@/lib/rate-limit";
import { getOwnerId } from "@/lib/session";
import {
  createTrial,
  deleteTrial,
  estateSummary,
  getTrial,
  listTrials,
  recordDecision,
  updateTrial,
  withIdempotency,
} from "@/lib/service";
import { fetchLineup } from "@/lib/sources";
import { renderCertificate } from "@/lib/export";
import { TOOLS, describeScript, describeScripts } from "@/lib/mcp/tools";
import { getScript } from "@/lib/pressure-scripts";
import { ENGINE_VERSION } from "@/lib/engine";
import {
  ValidationError,
  parseAnswers,
  parseDecision,
  parseIdempotencyKey,
  parseNotes,
  parseScriptId,
  parseSeal,
  parseServiceLoad,
  parseSubject,
} from "@/lib/validation";


export const dynamic = "force-dynamic";

/**
 * JSON-RPC 2.0 tool surface.
 *
 * Speaks MCP's method names (`initialize`, `tools/list`, `tools/call`) over a plain
 * HTTP transport. Mutating tools call the same service functions the interface
 * calls, so an agent and a reviewer cannot produce different records for the same
 * input, and every mutation appends to the same audit chain.
 */

const PROTOCOL_VERSION = "2025-06-18";

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const JSONRPC_PARSE = -32700;
const JSONRPC_INVALID_REQUEST = -32600;
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INVALID_PARAMS = -32602;
const JSONRPC_INTERNAL = -32603;

/** JSON-RPC uses numeric codes; the HTTP status stays honest alongside them. */
function rpcError(id: string | number | null, code: number, message: string, data?: unknown) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } },
    { status: code === JSONRPC_INVALID_PARAMS ? 422 : 400, headers: { "cache-control": "no-store" } },
  );
}


export async function POST(request: Request) {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return rpcError(null, JSONRPC_PARSE, "request body is not valid JSON");
  }

  // A single call is the common case and gets the single-call response shape; a
  // batch gets an array back, in order, with one entry per call.
  const batch = Array.isArray(parsed);
  const calls: RpcRequest[] = batch ? (parsed as RpcRequest[]) : [parsed as RpcRequest];

  if (calls.length === 0) {
    return rpcError(null, JSONRPC_INVALID_REQUEST, "a batch must contain at least one call");
  }
  if (calls.length > 20) {
    return rpcError(null, JSONRPC_INVALID_REQUEST, "a batch may contain at most 20 calls");
  }

  const responses: unknown[] = [];

  for (const call of calls) {
    if (!call || typeof call !== "object" || call.jsonrpc !== "2.0" || typeof call.method !== "string") {
      responses.push({
        jsonrpc: "2.0",
        id: (call as RpcRequest | null)?.id ?? null,
        error: { code: JSONRPC_INVALID_REQUEST, message: "a call needs jsonrpc \"2.0\" and a method" },
      });
      continue;
    }

    const ownerId = await getOwnerId();
    const throttle = consume(`mcp:${ownerId}`, RATE_LIMITS.mcp);
    if (!throttle.allowed) {
      responses.push({
        jsonrpc: "2.0",
        id: call.id ?? null,
        error: { code: JSONRPC_METHOD_NOT_FOUND, message: "rate limit exceeded for this session" },
      });
      continue;
    }

    const outcome = await dispatch(call, ownerId);
    if ("error" in outcome) {
      responses.push({ jsonrpc: "2.0", id: call.id ?? null, error: outcome.error });
    } else {
      responses.push({ jsonrpc: "2.0", id: call.id ?? null, result: outcome.result });
    }
  }

  if (batch) {
    return NextResponse.json(responses, { headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json(responses[0], { headers: { "cache-control": "no-store" } });
}

type Dispatch =
  | { result: unknown }
  | { error: { code: number; message: string; data?: unknown } };

function toRpcError(error: unknown): { code: number; message: string; data?: unknown } {
  if (error instanceof ApiError) {
    return {
      code: error.code === "not_found" ? JSONRPC_INVALID_PARAMS : JSONRPC_INVALID_PARAMS,
      message: error.message,
      data: error.code,
    };
  }
  if (error instanceof ValidationError) {
    return { code: JSONRPC_INVALID_PARAMS, message: error.message, data: { field: error.field } };
  }
  console.error("[telltale:mcp] unhandled error:", error);
  return { code: JSONRPC_INTERNAL, message: "an unexpected error occurred" };
}

async function dispatch(call: RpcRequest, ownerId: string): Promise<Dispatch> {
  const params = call.params ?? {};

  switch (call.method) {
    case "initialize":
      return {
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "telltale", version: "1.0.0" },
          instructions:
            "Telltale load-tests a model's stated position under escalating social pressure. Start with list_scripts, run one script against a model, then call grade_transcript to read the factors before saving with create_trial. verify_integrity replays a trial's SHA-384 seal chain.",
          engine: ENGINE_VERSION,
        },
      };

    case "notifications/initialized":
      return { result: {} };

    case "ping":
      return { result: {} };

    case "tools/list":
      return {
        result: {
          tools: TOOLS.map((tool) => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
          })),
        },
      };

    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const definition = TOOLS.find((tool) => tool.name === name);
      if (!definition) {
        return { error: { code: JSONRPC_METHOD_NOT_FOUND, message: `unknown tool: ${name || "(none)"}` } };
      }
      try {
        const text = await callTool(name, args, ownerId);
        return {
          result: {
            content: [{ type: "text", text }],
            structuredContent: safeStructured(name, args, ownerId, text),
            isError: false,
          },
        };
      } catch (error) {
        const mapped = toRpcError(error);
        // A tool that fails is reported as a tool result with isError, which is how
        // an agent expects to see a domain failure rather than a transport fault.
        return {
          result: {
            content: [{ type: "text", text: `${mapped.message}` }],
            structuredContent: { error: mapped.message, code: mapped.data ?? null },
            isError: true,
          },
        };
      }
    }

    default:
      return { error: { code: JSONRPC_METHOD_NOT_FOUND, message: `unknown method: ${call.method}` } };
  }
}

/** A second structured view for agents that prefer typed data over prose. */
async function safeStructured(name: string, args: Record<string, unknown>, ownerId: string, text: string) {
  void ownerId;
  switch (name) {
    case "grade_transcript":
      return { transcript: text };
    case "lineup_signals":
      return { lineup: text };
    default:
      return { args, text };
  }
}

async function callTool(name: string, args: Record<string, unknown>, ownerId: string): Promise<string> {
  switch (name) {
    case "list_scripts":
      return JSON.stringify(describeScripts(), null, 2);

    case "get_script": {
      const script = describeScript(parseScriptId(args.scriptId));
      if (!script) throw ApiError.notFound("unknown pressure script");
      return JSON.stringify(script, null, 2);
    }

    case "grade_transcript": {
      const scriptId = parseScriptId(args.scriptId);
      const script = getScript(scriptId)!;
      const serviceLoad = parseServiceLoad(args.serviceLoad);
      const answers = parseAnswers(args.answers);
      const { grade } = await import("@/lib/engine");
      const result = grade(
        { script, answers: answers.map((entry) => ({ index: entry.index, text: entry.text })) },
        { serviceLoad },
      );
      return JSON.stringify(result, null, 2);
    }

    case "rank_trial": {
      const trials = await listTrials({
        ...(typeof args.band === "string" ? { band: args.band as never } : {}),
        ...(typeof args.scriptId === "string" ? { scriptId: args.scriptId } : {}),
        ...(typeof args.sort === "string" ? { sort: args.sort as never } : {}),
        ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
      });
      const summary = await estateSummary();
      return JSON.stringify(
        {
          summary,
          trials: trials.map((trial) => ({
            id: trial.id,
            subject: trial.subject,
            scriptId: trial.scriptId,
            grade: trial.result.grade,
            band: trial.result.band,
            safetyFactor: trial.result.safetyFactor,
            permanentSet: trial.result.permanentSetClaims.length,
            decision: trial.decision,
            serviceLoad: trial.serviceLoad,
            origin: trial.origin,
          })),
        },
        null,
        2,
      );
    }

    case "get_trial": {
      const trial = await getTrial(parseTrialId(args.id));
      return JSON.stringify(trial, null, 2);
    }

    case "create_trial": {
      const scriptId = parseScriptId(args.scriptId);
      const subject = parseSubject(args.subject);
      const serviceLoad = parseServiceLoad(args.serviceLoad);
      const answers = parseAnswers(args.answers);
      const decision = parseDecision(args.decision);
      const notes = parseNotes(args.notes);
      const key = parseIdempotencyKey(typeof args.idempotencyKey === "string" ? args.idempotencyKey : null);

      const { replayed, value } = await withIdempotency(ownerId, "mcp:create_trial", key, () =>
        createTrial({ subject, scriptId, answers, serviceLoad, origin: "agent", decision, notes }),
      );

      return JSON.stringify({ replayed, trial: value }, null, 2);
    }

    case "record_decision": {
      const id = parseTrialId(args.id);
      const decision = parseDecision(args.decision);
      const notes = parseNotes(args.notes);
      const seal = typeof args.seal === "string" ? args.seal : undefined;
      const trial = await recordDecision({ id, decision, notes, seal });
      return JSON.stringify(trial, null, 2);
    }

    case "set_service_load": {
      const id = parseTrialId(args.id);
      const serviceLoad = parseServiceLoad(args.serviceLoad);
      const seal = typeof args.seal === "string" ? args.seal : undefined;
      const trial = await updateTrial({ id, serviceLoad, seal });
      return JSON.stringify(trial, null, 2);
    }

    case "delete_trial": {
      const id = parseTrialId(args.id);
      const seal = parseSeal(args.seal);
      const result = await deleteTrial(id, seal);
      return JSON.stringify({ ...result, deleted: "tombstoned" }, null, 2);
    }

    case "export_certificate": {
      const trial = await getTrial(parseTrialId(args.id));
      const verifyUrl = `/verify?id=${encodeURIComponent(trial.id)}`;
      return renderCertificate({ trial, verifyUrl, lineupStatus: "live" });
    }

    case "verify_integrity": {
      const id = parseTrialId(args.id);
      const { verifyTrial } = await import("@/lib/service");
      const result = await verifyTrial(id);
      return JSON.stringify(result, null, 2);
    }

    case "lineup_signals": {
      const lineup = await fetchLineup();
      return JSON.stringify(lineup, null, 2);
    }

    default:
      throw ApiError.badRequest(`unknown tool: ${name}`, "name");
  }
}

function parseTrialId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw ApiError.badRequest("a trial id is required", "id");
  }
  const id = value.trim();
  if (id.length > 64 || !/^[a-z0-9_]+$/i.test(id)) {
    throw ApiError.badRequest("trial id contains unexpected characters", "id");
  }
  return id;
}

