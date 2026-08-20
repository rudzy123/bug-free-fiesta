/**
 * OpenTelemetry-shaped tracing abstraction.
 *
 * The interfaces mirror the OpenTelemetry `Tracer`/`Span` API (start a span, set
 * attributes, record an exception, set status, end) so a real OTel SDK tracer
 * can be dropped in behind `Tracer` without touching call sites. Two default
 * implementations are provided:
 *
 * - `createNoopTracer()` — zero overhead; the safe default.
 * - `createLoggingTracer(logger)` — emits a structured log per completed span
 *   (name, duration, status, correlation id) for environments without an OTel
 *   collector. It records only safe attributes; callers must never attach
 *   tokens, PDF bytes, signatures, or other Restricted data as attributes.
 *
 * To wire the real SDK: implement `Tracer` by delegating to
 * `@opentelemetry/api` `trace.getTracer(...).startSpan(...)` and map
 * `SpanStatus` to `SpanStatusCode`. Propagation uses the correlation id.
 */

export type SpanAttributeValue = string | number | boolean;
export type SpanAttributes = Readonly<Record<string, SpanAttributeValue>>;
export type SpanStatus = 'unset' | 'ok' | 'error';

export type Span = {
  readonly setAttribute: (key: string, value: SpanAttributeValue) => void;
  readonly setAttributes: (attributes: SpanAttributes) => void;
  readonly recordException: (error: unknown) => void;
  readonly setStatus: (status: SpanStatus) => void;
  readonly end: () => void;
};

export type StartSpanOptions = {
  readonly attributes?: SpanAttributes;
};

export type Tracer = {
  readonly startSpan: (name: string, options?: StartSpanOptions) => Span;
};

export function createNoopTracer(): Tracer {
  const span: Span = {
    setAttribute: () => undefined,
    setAttributes: () => undefined,
    recordException: () => undefined,
    setStatus: () => undefined,
    end: () => undefined,
  };
  return { startSpan: () => span };
}

export type SpanLogger = {
  readonly debug: (fields: Record<string, unknown>, message: string) => void;
};

export type LoggingTracerOptions = {
  readonly now?: () => number;
};

export function createLoggingTracer(
  logger: SpanLogger,
  options: LoggingTracerOptions = {},
): Tracer {
  const now = options.now ?? (() => Date.now());
  return {
    startSpan: (name, startOptions) => {
      const startedAt = now();
      const attributes: Record<string, SpanAttributeValue> = { ...startOptions?.attributes };
      let status: SpanStatus = 'unset';
      let ended = false;
      return {
        setAttribute: (key, value) => {
          attributes[key] = value;
        },
        setAttributes: (next) => {
          Object.assign(attributes, next);
        },
        recordException: (error) => {
          status = 'error';
          attributes.exceptionType = error instanceof Error ? error.name : 'unknown';
        },
        setStatus: (next) => {
          status = next;
        },
        end: () => {
          if (ended) {
            return;
          }
          ended = true;
          logger.debug(
            { span: name, durationMs: now() - startedAt, status, ...attributes },
            'span completed',
          );
        },
      };
    },
  };
}
