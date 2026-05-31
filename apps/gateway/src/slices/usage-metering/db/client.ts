import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/** Build a Drizzle client over postgres.js bound to the usage-metering schema. */
export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 5 });
  return drizzle(client, { schema });
}
