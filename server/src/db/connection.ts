import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { config } from "../config/index.js";
import fs from "fs";
import path from "path";

export interface DbQueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = any>(text: string, params?: any[]): Promise<DbQueryResult<T>>;
  exec(sql: string): Promise<void>;
}

let pgPool: pg.Pool | null = null;
let pgliteInstance: PGlite | null = null;

export async function getDb(): Promise<DbClient> {
  if (config.databaseUrl && !config.databaseUrl.startsWith("embedded")) {
    if (!pgPool) {
      pgPool = new pg.Pool({
        connectionString: config.databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
      });
    }
    return {
      async query<T = any>(text: string, params?: any[]): Promise<DbQueryResult<T>> {
        const res = await pgPool!.query(text, params);
        return { rows: res.rows, rowCount: res.rowCount ?? 0 };
      },
      async exec(sql: string): Promise<void> {
        await pgPool!.query(sql);
      },
    };
  }

  // Embedded PGlite
  if (!pgliteInstance) {
    if (config.dbDataDir && config.dbDataDir !== ":memory:") {
      const dir = path.dirname(config.dbDataDir);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      pgliteInstance = new PGlite(config.dbDataDir);
    } else {
      pgliteInstance = new PGlite();
    }
    await pgliteInstance.waitReady;
  }

  return {
    async query<T = any>(text: string, params?: any[]): Promise<DbQueryResult<T>> {
      const res = await pgliteInstance!.query<T>(text, params);
      const count = (res as any).affectedRows ?? res.rows.length;
      return { rows: res.rows, rowCount: count };
    },
    async exec(sql: string): Promise<void> {
      await pgliteInstance!.exec(sql);
    },
  };
}

export async function query<T = any>(text: string, params?: any[]): Promise<DbQueryResult<T>> {
  const db = await getDb();
  return db.query<T>(text, params);
}

export async function exec(sql: string): Promise<void> {
  const db = await getDb();
  return db.exec(sql);
}

export async function transaction<T>(callback: (client: DbClient) => Promise<T>): Promise<T> {
  const db = await getDb();
  await db.query("BEGIN");
  try {
    const result = await callback(db);
    await db.query("COMMIT");
    return result;
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}

export async function closeDb(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  if (pgliteInstance) {
    await pgliteInstance.close();
    pgliteInstance = null;
  }
}
