// OpenLineage spec/facet identifiers. Versions verified against the live
// OpenLineage spec (2-0-2) — see docs/adr/004-data-observability.md.

/** This emitter's producer URI (stamped into every event and facet). */
export const PRODUCER =
  "https://github.com/ai-observability-lab/observability-tools/tree/main/packages/lineage";

/** RunEvent schema URL (OpenLineage spec 2-0-2, JSON-Schema draft 2020-12). */
export const RUN_EVENT_SCHEMA_URL =
  "https://openlineage.io/spec/2-0-2/OpenLineage.json#/$defs/RunEvent";

/** ParentRunFacet schema URL (facet 1-1-0). */
export const PARENT_RUN_FACET_SCHEMA_URL =
  "https://openlineage.io/spec/facets/1-1-0/ParentRunFacet.json#/$defs/ParentRunFacet";

/** NominalTimeRunFacet schema URL (facet 1-0-1). */
export const NOMINAL_TIME_FACET_SCHEMA_URL =
  "https://openlineage.io/spec/facets/1-0-1/NominalTimeRunFacet.json#/$defs/NominalTimeRunFacet";

/** ErrorMessageRunFacet schema URL (facet 1-0-0) — used on FAIL events. */
export const ERROR_MESSAGE_FACET_SCHEMA_URL =
  "https://openlineage.io/spec/facets/1-0-0/ErrorMessageRunFacet.json#/$defs/ErrorMessageRunFacet";

/**
 * Custom run facet summarising retrieval relevance. The schema is not published;
 * Marquez stores unrecognised facets verbatim, so `_schemaURL` is informational.
 */
export const RETRIEVAL_STATS_FACET_SCHEMA_URL =
  "https://github.com/ai-observability-lab/observability-tools/blob/main/packages/lineage/facets/RetrievalStatsRunFacet.json#/$defs/RetrievalStatsRunFacet";

/** Default OpenLineage namespace for this lab's jobs and datasets. */
export const DEFAULT_NAMESPACE = "ai-observability-lab";
