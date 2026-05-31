import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface DbHandle {
  readonly db: Db;
  readonly sql: ReturnType<typeof postgres>;
  close(): Promise<void>;
}

/**
 * Construct a postgres.js client + Drizzle DB lazily, inside a factory. We never
 * open a connection at module import time so that unit tests can import the DB
 * modules (schema, query helpers) without touching a live database.
 */
export function createDb(databaseUrl: string): DbHandle {
  const sql = postgres(databaseUrl, { max: 10 });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
