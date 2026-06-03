import { tracedFetch } from "@obs/telemetry";
import { UpstreamError, UpstreamTimeoutError } from "./errors";

/**
 * A successful upstream HTTP exchange. `status` is the upstream status code and
 * `body` is the parsed JSON payload. Adapters decide what a given status means.
 */
export interface UpstreamResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface UpstreamClient {
  /** POST `json` to `<baseUrl><path>`; never throws on a non-2xx status. */
  postJson(path: string, json: unknown): Promise<UpstreamResponse>;
}

export interface UpstreamClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  /** Name surfaced in error messages, e.g. "embedder". */
  readonly name: string;
  /**
   * Optional provider of extra per-request headers (evaluated on every call).
   * Used to propagate the OpenLineage parent run to lineage-emitting upstreams.
   */
  readonly headers?: () => Record<string, string>;
}

function isTimeout(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
}

/**
 * Shared upstream HTTP client. Uses `AbortSignal.timeout` so a slow upstream
 * surfaces as a 504 `upstream_timeout`; a network failure surfaces as a 502
 * `upstream_error`. A non-2xx response is returned (not thrown) so adapters can
 * map specific codes (e.g. model-proxy 429 → model_overloaded).
 */
export function createUpstreamClient(opts: UpstreamClientOptions): UpstreamClient {
  const base = opts.baseUrl.replace(/\/$/, "");
  return {
    async postJson(path, json) {
      let res: Response;
      try {
        res = await tracedFetch(
          `${base}${path}`,
          {
            method: "POST",
            headers: { "content-type": "application/json", ...opts.headers?.() },
            body: JSON.stringify(json),
            signal: AbortSignal.timeout(opts.timeoutMs),
          },
          { spanName: `POST ${opts.name}` },
        );
      } catch (err) {
        if (isTimeout(err)) {
          throw new UpstreamTimeoutError(`${opts.name} timed out after ${opts.timeoutMs}ms`);
        }
        const reason = err instanceof Error ? err.message : String(err);
        throw new UpstreamError(`${opts.name} network error: ${reason}`);
      }

      let body: unknown = null;
      const text = await res.text();
      if (text.length > 0) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = null;
        }
      }
      return { status: res.status, body };
    },
  };
}
