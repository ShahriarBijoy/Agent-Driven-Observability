import { describe, expect, it } from "vitest";
import { makeTenant } from "@obs/domain";
import { createMemoryLimiter } from "./adapters/memory-limiter";

const tenant = makeTenant("abuser");

describe("in-memory token-bucket limiter", () => {
  it("allows exactly `capacity` requests then returns 429-worthy denials", async () => {
    // Freeze time so no refill occurs during the burst.
    const limiter = createMemoryLimiter(() => 1_000);
    const config = { capacity: 3, refillPerSecond: 0 };

    const first = await limiter.tryConsume(tenant, config);
    const second = await limiter.tryConsume(tenant, config);
    const third = await limiter.tryConsume(tenant, config);
    const fourth = await limiter.tryConsume(tenant, config);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(true);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("refills over elapsed time", async () => {
    let now = 0;
    const limiter = createMemoryLimiter(() => now);
    const config = { capacity: 2, refillPerSecond: 1 };

    // Drain the bucket.
    expect((await limiter.tryConsume(tenant, config)).allowed).toBe(true);
    expect((await limiter.tryConsume(tenant, config)).allowed).toBe(true);
    expect((await limiter.tryConsume(tenant, config)).allowed).toBe(false);

    // Advance one second → one token refilled.
    now = 1_000;
    expect((await limiter.tryConsume(tenant, config)).allowed).toBe(true);
    expect((await limiter.tryConsume(tenant, config)).allowed).toBe(false);
  });

  it("isolates buckets per tenant", async () => {
    const limiter = createMemoryLimiter(() => 0);
    const config = { capacity: 1, refillPerSecond: 0 };
    const acme = makeTenant("acme");

    expect((await limiter.tryConsume(acme, config)).allowed).toBe(true);
    expect((await limiter.tryConsume(acme, config)).allowed).toBe(false);
    // A different tenant still has its full bucket.
    expect((await limiter.tryConsume(tenant, config)).allowed).toBe(true);
  });
});
