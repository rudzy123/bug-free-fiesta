import { describe, expect, it } from 'vitest';
import { createMetricsRegistry } from './metrics.js';

describe('metrics registry', () => {
  it('renders counters with labels in Prometheus format', () => {
    const registry = createMetricsRegistry();
    const counter = registry.counter({
      name: 'esign_test_total',
      help: 'test counter',
      labelNames: ['route'],
    });
    counter.inc({ route: '/a' });
    counter.inc({ route: '/a' }, 2);
    counter.inc({ route: '/b' });
    const output = registry.render();
    expect(output).toContain('# TYPE esign_test_total counter');
    expect(output).toContain('esign_test_total{route="/a"} 3');
    expect(output).toContain('esign_test_total{route="/b"} 1');
  });

  it('rejects negative counter increments', () => {
    const registry = createMetricsRegistry();
    const counter = registry.counter({ name: 'esign_c_total', help: 'c' });
    expect(() => counter.inc(undefined, -1)).toThrow(/cannot decrease/);
  });

  it('supports gauge set/inc/dec', () => {
    const registry = createMetricsRegistry();
    const gauge = registry.gauge({ name: 'esign_g', help: 'g', labelNames: ['state'] });
    gauge.set(5, { state: 'pending' });
    gauge.inc({ state: 'pending' }, 2);
    gauge.dec({ state: 'pending' });
    expect(registry.render()).toContain('esign_g{state="pending"} 6');
  });

  it('renders histogram buckets, sum, and count', () => {
    const registry = createMetricsRegistry();
    const histogram = registry.histogram({
      name: 'esign_h_seconds',
      help: 'h',
      labelNames: ['op'],
      buckets: [0.1, 0.5, 1],
    });
    histogram.observe(0.05, { op: 'x' });
    histogram.observe(0.4, { op: 'x' });
    histogram.observe(2, { op: 'x' });
    const output = registry.render();
    expect(output).toContain('esign_h_seconds_bucket{op="x",le="0.1"} 1');
    expect(output).toContain('esign_h_seconds_bucket{op="x",le="0.5"} 2');
    expect(output).toContain('esign_h_seconds_bucket{op="x",le="+Inf"} 3');
    expect(output).toContain('esign_h_seconds_count{op="x"} 3');
    expect(output).toContain('esign_h_seconds_sum{op="x"} 2.45');
  });

  it('escapes label values and rejects duplicate registration', () => {
    const registry = createMetricsRegistry();
    const counter = registry.counter({ name: 'esign_e_total', help: 'e', labelNames: ['v'] });
    counter.inc({ v: 'a"b\\c' });
    expect(registry.render()).toContain('esign_e_total{v="a\\"b\\\\c"} 1');
    expect(() => registry.counter({ name: 'esign_e_total', help: 'dup' })).toThrow(
      /already registered/,
    );
  });
});
