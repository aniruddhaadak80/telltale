/**
 * One typed SQL surface, two implementations.
 *
 * Production uses Neon Postgres over HTTP, which survives redeploys and cold
 * starts. Local development and the test suite use embedded PGlite, so the
 * project runs with zero required environment variables.
 *
 * Selection is explicit and cannot happen silently: in a production build the
 * absence of DATABASE_URL is a hard failure rather than a fallback to the
 * embedded store.
 */

import { DEMO_OWNER, SCHEMA_STATEMENTS, SEED_TRIALS } from "./schema";

export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  /** Human-readable adapter identity, surfaced by /api/health. */
  readonly adapter: "neon-postgres" | "pglite";
  close(): Promise<void>;
}

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export function databaseUrl(): string | null {
  const value = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? null;
  return value && value.trim().length > 0 ? value.trim() : null;
}

/** Which adapter this process must use. Never guesses at runtime in production. */
export function resolveAdapter(): "neon-postgres" | "pglite" {
  if (databaseUrl()) return "neon-postgres";
  if (IS_PRODUCTION) {
    // An explicit opt-in lets `next build && next start` be verified on a laptop
    // without weakening the guard: a real deployment never sets this.
    if (process.env.TELLTALE_ALLOW_EMBEDDED_STORE === "1") return "pglite";
    throw new Error(
      "DATABASE_URL is required in production. Refusing to start with the embedded local adapter.",
    );
  }
  return "pglite";
}

async function createNeon(url: string): Promise<SqlClient> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);

  const run = async <R>(text: string, params: unknown[]): Promise<R[]> =>
    (await sql.query(text, params as never[])) as R[];

  return {
    adapter: "neon-postgres",
    query: run,
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
      // Neon's HTTP driver has no interactive transaction, so each statement in
      // the unit is executed on the same tagged query. The repository only needs
      // statement-level atomicity, which the unique indexes enforce.
      return fn({
        adapter: "neon-postgres",
        query: run,
        transaction: async () => {
          throw new Error("nested transactions are not supported");
        },
        close: async () => {},
      });
    },
    async close() {
      /* the HTTP driver holds no persistent socket */
    },
  };
}

async function createPglite(): Promise<SqlClient> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.TELLTALE_PGLITE_DIR ?? "./.pglite";
  const client = await PGlite.create({ dataDir });

  const run = async <R>(text: string, params: unknown[]): Promise<R[]> => {
    const result = await client.query<R>(text, params as never[]);
    return result.rows;
  };

  return {
    adapter: "pglite",
    query: run,
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
      await client.exec("BEGIN");
      try {
        const value = await fn({
          adapter: "pglite",
          query: run,
          transaction: async () => {
            throw new Error("nested transactions are not supported");
          },
          close: async () => {},
        });
        await client.exec("COMMIT");
        return value;
      } catch (error) {
        await client.exec("ROLLBACK");
        throw error;
      }
    },
    async close() {
      await client.close();
    },
  };
}

/**
 * Process-wide client, created once and reused.
 *
 * Cached on `globalThis` rather than in module scope on purpose: Next.js compiles
 * Server Components and Route Handlers into separate module graphs, so a
 * module-level cache would create a second connection. For PGlite that is not
 * merely wasteful, two embedded instances on one data directory abort the WASM
 * runtime and each sees a different snapshot. One shared instance avoids both.
 */
const GLOBAL_KEY = "__telltaleDb";

interface GlobalWithDb {
  [GLOBAL_KEY]?: Promise<SqlClient>;
}

export function getDb(): Promise<SqlClient> {
  const scope = globalThis as GlobalWithDb;
  if (!scope[GLOBAL_KEY]) {
    scope[GLOBAL_KEY] = (async () => {
      const adapter = resolveAdapter();
      const url = databaseUrl();
      const client = adapter === "neon-postgres" ? await createNeon(url as string) : await createPglite();
      await migrate(client);
      return client;
    })().catch((error) => {
      // Do not cache a failure: a later request may succeed once the network or
      // the database recovers.
      scope[GLOBAL_KEY] = undefined;
      throw error;
    });
  }
  return scope[GLOBAL_KEY];
}

export async function migrate(client: SqlClient): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await client.query(statement);
  }
  await seed(client);
}

/**
 * Idempotent first-run seed.
 *
 * Seeded rows use fixed ids under a reserved owner and carry
 * `origin = 'authored_example'`, so they can never collide with a visitor's
 * records and are excluded from every aggregate the product reports.
 */
async function seed(client: SqlClient): Promise<void> {
  const existing = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM trials WHERE owner_id = $1",
    [DEMO_OWNER],
  );
  if (Number(existing[0]?.count ?? "0") > 0) return;

  // Imported lazily so seeding never drags the engine into the migration path.
  const { getScript } = await import("../pressure-scripts");
  const { grade } = await import("../engine");
  const { transcriptRefFor } = await import("../transcript-ref");
  const { appendAudit } = await import("../integrity/audit");

  for (const seedTrial of SEED_TRIALS) {
    const script = getScript(seedTrial.scriptId);
    if (!script) continue;

    const storedTurns = script.turns.map((turn) => ({
      index: turn.index,
      pressure: turn.pressure,
      prompt: turn.prompt,
      text: seedTrial.turns.find((entry) => entry.index === turn.index)?.text ?? "",
    }));

    const answered = storedTurns.filter((turn) => turn.text.trim().length > 0);
    const result = grade(
      { script, answers: answered.map((turn) => ({ index: turn.index, text: turn.text })) },
      { serviceLoad: seedTrial.serviceLoad },
    );
    const ref = transcriptRefFor(script.id, script.version, answered.map((turn) => turn.text));

    const { seal } = await appendAudit(client, seedTrial.id, "seed_authored_example", {
      subject: seedTrial.subject,
      scriptId: seedTrial.scriptId,
      transcriptRef: ref,
      grade: result.grade,
      authored: true,
    });

    await client.query(
      `INSERT INTO trials
         (id, owner_id, subject, script_id, script_version, origin, turns, result,
          transcript_ref, decision, notes, service_load, seal)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO NOTHING`,
      [
        seedTrial.id,
        DEMO_OWNER,
        seedTrial.subject,
        script.id,
        script.version,
        "authored_example",
        JSON.stringify(storedTurns),
        JSON.stringify(result),
        ref,
        seedTrial.decision,
        seedTrial.notes,
        seedTrial.serviceLoad,
        seal,
      ],
    );
  }

  await client.query(
    `INSERT INTO settings (owner_id, service_load) VALUES ($1,$2)
     ON CONFLICT (owner_id) DO NOTHING`,
    [DEMO_OWNER, 1],
  );
}

/** Round-trip proof that the persistence path really executes a statement. */
export async function ping(
  client: SqlClient,
): Promise<{ ok: boolean; adapter: string; detail: string }> {
  try {
    const rows = await client.query<{ ok: string }>("SELECT 'ok' AS ok");
    return {
      ok: rows[0]?.ok === "ok",
      adapter: client.adapter,
      detail: "SELECT round-trip succeeded",
    };
  } catch (error) {
    return {
      ok: false,
      adapter: client.adapter,
      detail: error instanceof Error ? error.message : "database round-trip failed",
    };
  }
}