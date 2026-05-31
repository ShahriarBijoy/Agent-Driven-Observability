import { z } from "zod";

const EnvSchema = z.object({
  RETRIEVER_PORT: z.coerce.number().int().positive().default(8082),
  DATABASE_URL: z.string().min(1).default("postgres://lab:lab@localhost:5432/observability_lab"),
});

export interface Config {
  readonly port: number;
  readonly databaseUrl: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.parse(env);
  return {
    port: parsed.RETRIEVER_PORT,
    databaseUrl: parsed.DATABASE_URL,
  };
}
