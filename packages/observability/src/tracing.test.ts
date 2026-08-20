import { describe, expect, it, vi } from 'vitest';
import { createLoggingTracer, createNoopTracer } from './tracing.js';

describe('noop tracer', () => {
  it('does nothing and never throws', () => {
    const tracer = createNoopTracer();
    const span = tracer.startSpan('x', { attributes: { a: 1 } });
    expect(() => {
      span.setAttribute('k', 'v');
      span.recordException(new Error('boom'));
      span.setStatus('error');
      span.end();
    }).not.toThrow();
  });
});

describe('logging tracer', () => {
  it('logs one span-completed record with duration and status', () => {
    const debug = vi.fn();
    let clock = 1000;
    const tracer = createLoggingTracer({ debug }, { now: () => clock });
    const span = tracer.startSpan('POST /auth/login', { attributes: { route: '/auth/login' } });
    clock = 1042;
    span.setStatus('ok');
    span.end();
    span.end(); // idempotent

    expect(debug).toHaveBeenCalledTimes(1);
    const [fields, message] = debug.mock.calls[0] ?? [];
    expect(message).toBe('span completed');
    expect(fields).toMatchObject({
      span: 'POST /auth/login',
      durationMs: 42,
      status: 'ok',
      route: '/auth/login',
    });
  });

  it('marks status error and records exception type', () => {
    const debug = vi.fn();
    const tracer = createLoggingTracer({ debug });
    const span = tracer.startSpan('job');
    span.recordException(new TypeError('bad'));
    span.end();
    const [fields] = debug.mock.calls[0] ?? [];
    expect(fields).toMatchObject({ status: 'error', exceptionType: 'TypeError' });
  });
});
