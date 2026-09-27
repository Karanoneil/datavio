import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Storage for contacts, consent history and unsubscribes.
 *
 *  - DATABASE_URL set  → Postgres (use this in production: Neon, Supabase, RDS, Cloud SQL…)
 *  - otherwise         → a local SQLite file (MAIL_SQLITE_PATH, default ./.data/datavio-mail.db)
 *
 * SQLite needs a persistent disk, so it's for local use and single-server hosting only. On
 * serverless hosts (Vercel, Netlify) the filesystem is thrown away, so set DATABASE_URL there.
 *
 * SQL is written once with `?` placeholders in the subset both engines share
 * (ON CONFLICT … DO UPDATE, RETURNING, TEXT timestamps, INTEGER booleans).
 */

export type Row = Record<string, unknown>;

export interface Queryable {
  all<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

export interface Db extends Queryable {
  kind: "postgres" | "sqlite";
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
}

function schema(kind: Db["kind"]): string[] {
  const id = kind === "postgres" ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
  return [
    `CREATE TABLE IF NOT EXISTS mail_contacts (
      id ${id},
      email TEXT NOT NULL UNIQUE,
      first_name TEXT,
      status TEXT NOT NULL DEFAULT 'subscribed',
      consent INTEGER,
      consent_source TEXT,
      consent_at TEXT,
      interest TEXT,
      attributes TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status_changed_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS mail_contacts_status ON mail_contacts (status)`,
    // Append-only history: GDPR Art. 7(1) requires being able to show when and how consent was given or withdrawn.
    `CREATE TABLE IF NOT EXISTS mail_events (
      id ${id},
      contact_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      source TEXT,
      detail TEXT,
      campaign_id INTEGER,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS mail_events_contact ON mail_events (contact_id)`,
    // After an erasure request we keep only a SHA-256 of the address, so a later import can't re-add them.
    `CREATE TABLE IF NOT EXISTS mail_suppressions (
      email_hash TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS mail_campaigns (
      id ${id},
      slug TEXT NOT NULL,
      brand TEXT,
      subject TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS mail_sends (
      id ${id},
      campaign_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      variant TEXT,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS mail_sends_contact ON mail_sends (contact_id)`,
    `CREATE TABLE IF NOT EXISTS mail_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  ];
}

/** `?` → `$1, $2…` for Postgres. Our SQL never contains a literal `?`. */
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

interface PgLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
}

function pgQueryable(c: PgLike): Queryable {
  return {
    all: async <T,>(sql: string, params: unknown[] = []) => (await c.query(toPg(sql), params)).rows as T[],
    get: async <T,>(sql: string, params: unknown[] = []) => (await c.query(toPg(sql), params)).rows[0] as T | undefined,
    run: async (sql: string, params: unknown[] = []) => ({ changes: (await c.query(toPg(sql), params)).rowCount ?? 0 }),
  };
}

async function openPostgres(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: Number(process.env.MAIL_DB_POOL ?? 5) });
  for (const stmt of schema("postgres")) await pool.query(stmt);
  const q = pgQueryable(pool);
  return {
    kind: "postgres",
    ...q,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(pgQueryable(client));
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

interface SqliteStmt {
  all(...params: unknown[]): Row[];
  get(...params: unknown[]): Row | undefined;
  run(...params: unknown[]): { changes: number | bigint };
}
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStmt;
}

function openSqlite(): Db {
  // getBuiltinModule keeps the bundler from trying to resolve node:sqlite at build time.
  const mod = process.getBuiltinModule("node:sqlite") as { DatabaseSync: new (file: string) => SqliteDb } | undefined;
  if (!mod) throw new Error("This Node.js version has no built-in SQLite (needs Node 22.5+). Set DATABASE_URL to use Postgres.");
  // Runtime data file, not source: tell Turbopack not to trace it (otherwise the whole project is bundled).
  const file = path.resolve(/*turbopackIgnore: true*/ process.env.MAIL_SQLITE_PATH || path.join(process.cwd(), ".data", "datavio-mail.db"));
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new mod.DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  for (const stmt of schema("sqlite")) db.exec(stmt);
  // node:sqlite rejects booleans/undefined; normalise to what SQLite stores.
  const norm = (params: unknown[]) => params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
  const q: Queryable = {
    all: async <T,>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...norm(params)) as T[],
    get: async <T,>(sql: string, params: unknown[] = []) => db.prepare(sql).get(...norm(params)) as T | undefined,
    run: async (sql: string, params: unknown[] = []) => ({ changes: Number(db.prepare(sql).run(...norm(params)).changes) }),
  };
  return {
    kind: "sqlite",
    ...q,
    // Every call above completes synchronously, so no other request can interleave inside a transaction.
    async tx(fn) {
      db.exec("BEGIN");
      try {
        const out = await fn(q);
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

// Cached on globalThis so dev-mode hot reloads don't open a new pool each time.
const g = globalThis as unknown as { __datavioMailDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__datavioMailDb) {
    const url = process.env.DATABASE_URL;
    g.__datavioMailDb = (url ? openPostgres(url) : Promise.resolve().then(openSqlite)).catch((e) => {
      g.__datavioMailDb = undefined; // allow a retry on the next request
      throw e;
    });
  }
  return g.__datavioMailDb;
}

/** Same as getDb, but returns the error instead of throwing, for features that degrade gracefully. */
export async function tryDb(): Promise<{ db: Db | null; error?: string }> {
  try {
    return { db: await getDb() };
  } catch (e) {
    return { db: null, error: e instanceof Error ? e.message : "Database unavailable" };
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
