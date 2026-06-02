import {
  type Attributes,
  type Counter,
  type Histogram,
  type Meter,
  metrics,
  type UpDownCounter,
} from "@opentelemetry/api";

export type { Attributes, Counter, Histogram, Meter, UpDownCounter };

/** Get a named meter. Pass the service name so instruments are grouped per service. */
export function getMeter(name = "@obs/telemetry"): Meter {
  return metrics.getMeter(name);
}

/**
 * Create a histogram with explicit bucket boundaries via instrument `advice`.
 * The OTel default buckets are tuned for millisecond ranges, so always pass
 * boundaries that match the unit you record in (seconds, ratios, scores...).
 */
export function createHistogram(
  meter: Meter,
  name: string,
  opts: { description?: string; unit?: string; boundaries: number[] },
): Histogram {
  return meter.createHistogram(name, {
    description: opts.description,
    unit: opts.unit,
    advice: { explicitBucketBoundaries: opts.boundaries },
  });
}
