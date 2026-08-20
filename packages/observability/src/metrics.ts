/**
 * A tiny, dependency-free metrics registry with Prometheus text exposition.
 *
 * This is the concrete backend behind the OpenTelemetry-shaped abstraction: it
 * lets the API and worker record counters, gauges, and histograms and expose
 * them at `/metrics` for scraping. It can be swapped for the OpenTelemetry SDK
 * Prometheus exporter without changing call sites, because the recording API
 * (`inc`/`set`/`observe`) mirrors OTel instrument semantics.
 *
 * Labels never carry high-cardinality or sensitive values (no tokens, emails,
 * raw IPs, or query strings) — only bounded dimensions such as route templates,
 * status classes, job types, and error categories.
 */

export type MetricLabels = Readonly<Record<string, string>>;

export type Counter = {
  readonly inc: (labels?: MetricLabels, value?: number) => void;
};

export type Gauge = {
  readonly set: (value: number, labels?: MetricLabels) => void;
  readonly inc: (labels?: MetricLabels, value?: number) => void;
  readonly dec: (labels?: MetricLabels, value?: number) => void;
};

export type Histogram = {
  readonly observe: (value: number, labels?: MetricLabels) => void;
};

export type MetricDefinition = {
  readonly name: string;
  readonly help: string;
  readonly labelNames?: readonly string[];
};

export type HistogramDefinition = MetricDefinition & {
  readonly buckets?: readonly number[];
};

export type MetricsRegistry = {
  readonly counter: (definition: MetricDefinition) => Counter;
  readonly gauge: (definition: MetricDefinition) => Gauge;
  readonly histogram: (definition: HistogramDefinition) => Histogram;
  readonly render: () => string;
  readonly reset: () => void;
};

export const DEFAULT_DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
] as const;

type SimpleMetric = {
  readonly kind: 'counter' | 'gauge';
  readonly definition: MetricDefinition;
  readonly values: Map<string, number>;
};

type HistogramState = {
  readonly bucketCounts: number[];
  sum: number;
  count: number;
};

type HistogramMetric = {
  readonly kind: 'histogram';
  readonly definition: MetricDefinition;
  readonly buckets: readonly number[];
  readonly series: Map<string, HistogramState>;
};

type RegisteredMetric = SimpleMetric | HistogramMetric;

export function createMetricsRegistry(): MetricsRegistry {
  const metrics = new Map<string, RegisteredMetric>();

  const ensureUnique = (name: string): void => {
    if (metrics.has(name)) {
      throw new Error(`Metric already registered: ${name}`);
    }
  };

  const registerSimple = (
    kind: 'counter' | 'gauge',
    definition: MetricDefinition,
  ): SimpleMetric => {
    ensureUnique(definition.name);
    const metric: SimpleMetric = { kind, definition, values: new Map() };
    metrics.set(definition.name, metric);
    return metric;
  };

  const counter = (definition: MetricDefinition): Counter => {
    const metric = registerSimple('counter', definition);
    return {
      inc: (labels, value = 1) => {
        if (value < 0) {
          throw new Error(`Counter ${definition.name} cannot decrease`);
        }
        const key = serializeLabels(definition.labelNames, labels);
        metric.values.set(key, (metric.values.get(key) ?? 0) + value);
      },
    };
  };

  const gauge = (definition: MetricDefinition): Gauge => {
    const metric = registerSimple('gauge', definition);
    const adjust = (labels: MetricLabels | undefined, delta: number): void => {
      const key = serializeLabels(definition.labelNames, labels);
      metric.values.set(key, (metric.values.get(key) ?? 0) + delta);
    };
    return {
      set: (value, labels) => {
        metric.values.set(serializeLabels(definition.labelNames, labels), value);
      },
      inc: (labels, value = 1) => adjust(labels, value),
      dec: (labels, value = 1) => adjust(labels, -value),
    };
  };

  const histogram = (definition: HistogramDefinition): Histogram => {
    ensureUnique(definition.name);
    const buckets = [...(definition.buckets ?? DEFAULT_DURATION_BUCKETS_SECONDS)].sort(
      (a, b) => a - b,
    );
    const metric: HistogramMetric = {
      kind: 'histogram',
      definition,
      buckets,
      series: new Map(),
    };
    metrics.set(definition.name, metric);
    return {
      observe: (value, labels) => {
        const key = serializeLabels(definition.labelNames, labels);
        let state = metric.series.get(key);
        if (state === undefined) {
          state = { bucketCounts: buckets.map(() => 0), sum: 0, count: 0 };
          metric.series.set(key, state);
        }
        state.sum += value;
        state.count += 1;
        for (let index = 0; index < buckets.length; index += 1) {
          const bound = buckets[index];
          if (bound !== undefined && value <= bound) {
            const current = state.bucketCounts[index] ?? 0;
            state.bucketCounts[index] = current + 1;
          }
        }
      },
    };
  };

  const render = (): string => {
    const lines: string[] = [];
    for (const metric of metrics.values()) {
      lines.push(`# HELP ${metric.definition.name} ${metric.definition.help}`);
      lines.push(`# TYPE ${metric.definition.name} ${metric.kind}`);
      if (metric.kind === 'histogram') {
        renderHistogram(metric, lines);
      } else {
        for (const [labelKey, value] of metric.values) {
          lines.push(`${metric.definition.name}${labelKey} ${value}`);
        }
      }
    }
    return `${lines.join('\n')}\n`;
  };

  const reset = (): void => {
    for (const metric of metrics.values()) {
      if (metric.kind === 'histogram') {
        metric.series.clear();
      } else {
        metric.values.clear();
      }
    }
  };

  return { counter, gauge, histogram, render, reset };
}

function renderHistogram(metric: HistogramMetric, lines: string[]): void {
  const { name } = metric.definition;
  for (const [labelKey, state] of metric.series) {
    let cumulative = 0;
    for (let index = 0; index < metric.buckets.length; index += 1) {
      cumulative = state.bucketCounts[index] ?? 0;
      const bound = metric.buckets[index];
      lines.push(`${name}_bucket${withLe(labelKey, formatNumber(bound ?? 0))} ${cumulative}`);
    }
    lines.push(`${name}_bucket${withLe(labelKey, '+Inf')} ${state.count}`);
    lines.push(`${name}_sum${labelKey} ${state.sum}`);
    lines.push(`${name}_count${labelKey} ${state.count}`);
  }
}

function withLe(labelKey: string, le: string): string {
  if (labelKey === '') {
    return `{le="${le}"}`;
  }
  // labelKey is like {a="b",c="d"}; splice the le label in.
  return `${labelKey.slice(0, -1)},le="${le}"}`;
}

function serializeLabels(
  labelNames: readonly string[] | undefined,
  labels: MetricLabels | undefined,
): string {
  if (labelNames === undefined || labelNames.length === 0) {
    return '';
  }
  const parts: string[] = [];
  for (const name of labelNames) {
    const value = labels?.[name] ?? '';
    parts.push(`${name}="${escapeLabelValue(value)}"`);
  }
  return `{${parts.join(',')}}`;
}

function escapeLabelValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toString();
}
