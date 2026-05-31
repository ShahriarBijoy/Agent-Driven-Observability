import { describe, expect, it } from "vitest";
import { classify, classifyError, classifyStatus } from "./classify";

describe("classifyStatus", () => {
  it("buckets 200 as ok", () => {
    expect(classifyStatus(200)).toBe("ok");
  });

  it("buckets other 2xx as ok", () => {
    expect(classifyStatus(204)).toBe("ok");
  });

  it("buckets 429 as rateLimited", () => {
    expect(classifyStatus(429)).toBe("rateLimited");
  });

  it("buckets 422 as clientError", () => {
    expect(classifyStatus(422)).toBe("clientError");
  });

  it("buckets other 4xx (401) as clientError", () => {
    expect(classifyStatus(401)).toBe("clientError");
  });

  it("buckets 500 as serverError", () => {
    expect(classifyStatus(500)).toBe("serverError");
  });

  it("buckets 502 as serverError", () => {
    expect(classifyStatus(502)).toBe("serverError");
  });

  it("buckets 504 as timeout (not serverError)", () => {
    expect(classifyStatus(504)).toBe("timeout");
  });
});

describe("classifyError", () => {
  it("buckets a client abort as timeout", () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    expect(classifyError(abort)).toBe("timeout");
  });

  it("buckets a TimeoutError as timeout", () => {
    const err = new DOMException("The operation timed out.", "TimeoutError");
    expect(classifyError(err)).toBe("timeout");
  });

  it("buckets a generic network error as timeout", () => {
    expect(classifyError(new TypeError("fetch failed"))).toBe("timeout");
  });
});

describe("classify", () => {
  it("dispatches a status outcome through classifyStatus", () => {
    expect(classify({ kind: "status", status: 429 })).toBe("rateLimited");
  });

  it("dispatches an error outcome through classifyError", () => {
    expect(classify({ kind: "error", error: new Error("boom") })).toBe("timeout");
  });
});
