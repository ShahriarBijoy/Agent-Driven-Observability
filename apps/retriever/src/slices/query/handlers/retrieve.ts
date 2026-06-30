import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  DS_RETRIEVAL_RESULTS,
  DS_VECTOR_STORE_CHUNKS,
  JOB_RETRIEVE,
  type LineageEmitter,
  parentFromHeaders,
  withChildRun,
} from "@obs/lineage";
import { ErrorResponseSchema, RetrieveRequestSchema, RetrieveResponseSchema } from "@obs/contracts";
import { ServiceUnavailableError } from "../../../platform/errors";
import { getChaos, shouldFail } from "../../chaos/state";
import type { RetrieveService } from "../service";

const retrieveRoute = createRoute({
  method: "post",
  path: "/v1/retrieve",
  summary: "Retrieve the top-k most similar chunks for an embedding",
  request: {
    body: {
      content: { "application/json": { schema: RetrieveRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: RetrieveResponseSchema } },
      description: "The ranked chunks",
    },
    422: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
    503: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Simulated outage (chaos control plane)",
    },
  },
});

export function registerRetrieveRoute(
  app: OpenAPIHono,
  service: RetrieveService,
  lineage: LineageEmitter,
): void {
  app.openapi(retrieveRoute, async (c) => {
    // Chaos control plane (dev/lab only): short-circuit BEFORE opening a lineage
    // run so a simulated outage doesn't emit a spurious retrieve run.
    if (shouldFail(getChaos())) throw new ServiceUnavailableError();

    const { embedding, topK } = c.req.valid("json");
    // When called as part of an inference, emit a `rag.retrieve` sub-run linked
    // to the gateway's parent run (propagated via x-ol-parent-* headers).
    const parent = parentFromHeaders((name) => c.req.header(name));
    const results = await withChildRun(
      lineage,
      {
        job: JOB_RETRIEVE,
        inputs: [DS_VECTOR_STORE_CHUNKS],
        outputs: [DS_RETRIEVAL_RESULTS],
        parent,
      },
      () => service.retrieve(embedding, topK),
    );
    return c.json({ results }, 200);
  });
}
