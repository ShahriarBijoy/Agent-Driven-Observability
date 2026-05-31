import { createMiddleware } from "hono/factory";
import { UnauthorizedError } from "../../platform/errors";
import type { AppEnv } from "../../platform/http";
import { resolveByToken } from "./registry";

const BEARER_RE = /^Bearer\s+(.+)$/i;

/** Extract the raw bearer token from an `Authorization` header value. */
export function parseBearer(header: string | undefined | null): string | null {
  if (!header) return null;
  const match = BEARER_RE.exec(header.trim());
  if (!match) return null;
  const token = match[1]?.trim();
  return token && token.length > 0 ? token : null;
}

/**
 * Bearer-token middleware. Resolves a {@link Tenant} from the dev registry and
 * stashes it on the Hono context (`c.get("tenant")`). Missing or invalid tokens
 * raise an {@link UnauthorizedError} → 401 `{ error: { code: "unauthorized" } }`.
 */
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = parseBearer(c.req.header("authorization"));
  if (!token) {
    throw new UnauthorizedError();
  }
  const record = resolveByToken(token);
  if (!record) {
    throw new UnauthorizedError();
  }
  c.set("tenant", record.tenant);
  await next();
});
