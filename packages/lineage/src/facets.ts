// OpenLineage facet builders. Each facet carries the required underscore-keys
// (`_producer`, `_schemaURL`) per the OpenLineage facet convention.

import {
  ERROR_MESSAGE_FACET_SCHEMA_URL,
  NOMINAL_TIME_FACET_SCHEMA_URL,
  PARENT_RUN_FACET_SCHEMA_URL,
  PRODUCER,
  RETRIEVAL_STATS_FACET_SCHEMA_URL,
} from "./spec";

/** Base keys present on every OpenLineage facet. */
interface FacetBase {
  readonly _producer: string;
  readonly _schemaURL: string;
}

/** Custom run facet: summary statistics over retrieval relevance scores. */
export interface RetrievalStatsRunFacet extends FacetBase {
  readonly count: number;
  readonly min: number | null;
  readonly max: number | null;
  readonly mean: number | null;
}

/**
 * Summarise a set of retrieval relevance scores (count/min/max/mean). An empty
 * retrieval yields `count: 0` and `null` stats — never `NaN`.
 */
export function retrievalStatsFacet(scores: readonly number[]): RetrievalStatsRunFacet {
  if (scores.length === 0) {
    return {
      _producer: PRODUCER,
      _schemaURL: RETRIEVAL_STATS_FACET_SCHEMA_URL,
      count: 0,
      min: null,
      max: null,
      mean: null,
    };
  }
  let min = scores[0]!;
  let max = scores[0]!;
  let sum = 0;
  for (const score of scores) {
    if (score < min) min = score;
    if (score > max) max = score;
    sum += score;
  }
  return {
    _producer: PRODUCER,
    _schemaURL: RETRIEVAL_STATS_FACET_SCHEMA_URL,
    count: scores.length,
    min,
    max,
    mean: sum / scores.length,
  };
}

/** ParentRunFacet — links a child run to its parent run + job. */
export interface ParentRunFacet extends FacetBase {
  readonly run: { readonly runId: string };
  readonly job: { readonly namespace: string; readonly name: string };
}

export interface ParentRef {
  readonly runId: string;
  readonly jobNamespace: string;
  readonly jobName: string;
}

export function parentRunFacet(parent: ParentRef): ParentRunFacet {
  return {
    _producer: PRODUCER,
    _schemaURL: PARENT_RUN_FACET_SCHEMA_URL,
    run: { runId: parent.runId },
    job: { namespace: parent.jobNamespace, name: parent.jobName },
  };
}

/** NominalTimeRunFacet — the logical start (and optional end) time of a run. */
export interface NominalTimeRunFacet extends FacetBase {
  readonly nominalStartTime: string;
  readonly nominalEndTime?: string;
}

export function nominalTimeFacet(start: string, end?: string): NominalTimeRunFacet {
  return {
    _producer: PRODUCER,
    _schemaURL: NOMINAL_TIME_FACET_SCHEMA_URL,
    nominalStartTime: start,
    ...(end === undefined ? {} : { nominalEndTime: end }),
  };
}

/** ErrorMessageRunFacet — attached to FAIL events. */
export interface ErrorMessageRunFacet extends FacetBase {
  readonly message: string;
  readonly programmingLanguage: string;
  readonly stackTrace?: string;
}

export function errorMessageFacet(message: string, stackTrace?: string): ErrorMessageRunFacet {
  return {
    _producer: PRODUCER,
    _schemaURL: ERROR_MESSAGE_FACET_SCHEMA_URL,
    message,
    programmingLanguage: "JavaScript",
    ...(stackTrace === undefined ? {} : { stackTrace }),
  };
}
