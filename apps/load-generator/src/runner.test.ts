import { describe, expect, it } from "vitest";
import type { Config } from "./platform/config";
import type { FetchFn } from "./runner";
import { runLoad, sendRequest } from "./runner";

const baseConfig: Config = {
  gatewayUrl: "http://gateway:8080",
  targetQps: 1000,
  durationSeconds: 0.05,
  requestTimeoutMs: 1000,
  concurrency: 16,
};

describe("sendRequest", () => {
  it("classifies a 200 response as ok and records latency", async () => {
    const fetchFn: FetchFn = async () => new Response("{}", { status: 200 });
    const req = { scenario: "happy" as const, url: "http://x/v1/chat", init: { method: "POST" } };
    let t = 0;
    const now = () => {
      const v = t;
      t += 12;
      return v;
    };
    const result = await sendRequest(req, fetchFn, 1000, now);
    expect(result.bucket).toBe("ok");
    expect(result.latencyMs).toBe(12);
  });

  it("classifies a thrown abort/network error as timeout", async () => {
    const fetchFn: FetchFn = async () => {
      throw new DOMException("aborted", "AbortError");
    };
    const req = { scenario: "happy" as const, url: "http://x/v1/chat", init: { method: "POST" } };
    const result = await sendRequest(req, fetchFn, 1000, () => 0);
    expect(result.bucket).toBe("timeout");
  });
});

describe("runLoad", () => {
  it("drives requests through the fake fetch and aggregates buckets", async () => {
    let calls = 0;
    const fetchFn: FetchFn = async () => {
      calls++;
      return new Response("{}", { status: 200 });
    };
    const summary = await runLoad({ config: baseConfig, fetchFn });
    expect(summary.total).toBe(calls);
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.counts.ok).toBe(summary.total);
  });

  it("buckets mixed statuses correctly across the run", async () => {
    let n = 0;
    const fetchFn: FetchFn = async () => {
      n++;
      const status = n % 2 === 0 ? 429 : 200;
      return new Response("{}", { status });
    };
    const summary = await runLoad({ config: baseConfig, fetchFn });
    expect(summary.counts.ok + summary.counts.rateLimited).toBe(summary.total);
    expect(summary.counts.rateLimited).toBeGreaterThan(0);
  });
});
