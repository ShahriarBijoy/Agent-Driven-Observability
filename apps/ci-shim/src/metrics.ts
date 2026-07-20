// A deliberately tiny Prometheus registry - counters, histograms, and
// callback gauges - exposed as text at /metrics and scraped by the laptop's
// Alloy over the tailnet (same path as Gitea's own /metrics).
//
// Scrape-side metrics beat OTLP-pushing here: CI events are sparse, and a
// pushed counter that only re-emits on the next pipeline run goes stale in
// Mimir between runs. A 30s scrape keeps every series continuously alive, so
// increase()/rate() in the DORA panels just work.

type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  return "{" + keys.map((k) => `${k}="${escapeLabel(labels[k] ?? "")}"`).join(",") + "}";
}

function escapeLabel(v: string): string {
  return v.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

export class Counter {
  private values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  inc(labels: Labels = {}, by = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + by);
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [key, value] of this.values) lines.push(`${this.name}${key} ${value}`);
    if (this.values.size === 0) lines.push(`${this.name} 0`);
    return lines.join("\n");
  }
}

export class Histogram {
  private buckets: number[];
  private series = new Map<string, { counts: number[]; sum: number; count: number }>();
  constructor(
    readonly name: string,
    readonly help: string,
    buckets: number[],
  ) {
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(labels: Labels, value: number): void {
    const key = labelKey(labels);
    let s = this.series.get(key);
    if (!s) {
      s = { counts: this.buckets.map(() => 0), sum: 0, count: 0 };
      this.series.set(key, s);
    }
    this.buckets.forEach((b, i) => {
      if (value <= b) s.counts[i] = (s.counts[i] ?? 0) + 1;
    });
    s.sum += value;
    s.count += 1;
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [key, s] of this.series) {
      // Splice the le label into the (sorted, brace-wrapped) label key.
      const inner = key === "" ? "" : key.slice(1, -1) + ",";
      this.buckets.forEach((b, i) => {
        lines.push(`${this.name}_bucket{${inner}le="${b}"} ${s.counts[i]}`);
      });
      lines.push(`${this.name}_bucket{${inner}le="+Inf"} ${s.count}`);
      lines.push(`${this.name}_sum${key} ${s.sum}`);
      lines.push(`${this.name}_count${key} ${s.count}`);
    }
    return lines.join("\n");
  }
}

/** Gauge whose value is computed at scrape time (e.g. oldest pending job age). */
export class CallbackGauge {
  constructor(
    readonly name: string,
    readonly help: string,
    private readonly collect: () => number,
  ) {}

  render(): string {
    return [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
      `${this.name} ${this.collect()}`,
    ].join("\n");
  }
}

export class Registry {
  private metrics: Array<Counter | Histogram | CallbackGauge> = [];

  register<T extends Counter | Histogram | CallbackGauge>(metric: T): T {
    this.metrics.push(metric);
    return metric;
  }

  render(): string {
    return this.metrics.map((m) => m.render()).join("\n") + "\n";
  }
}
