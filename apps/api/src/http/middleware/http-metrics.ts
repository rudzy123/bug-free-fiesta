import type { RequestHandler } from 'express';
import type { ObservabilityMetrics, Tracer } from '@esign/observability';

/**
 * Records HTTP latency and request counts, and wraps each request in a trace
 * span. The route label is the Express route template (never the raw path with
 * ids) plus the mount base, so metric cardinality stays bounded and no
 * identifiers leak into labels. Errors are counted by status class here; the
 * error handler adds the specific error code.
 */
export function createHttpMetrics(metrics: ObservabilityMetrics, tracer: Tracer): RequestHandler {
  return (req, res, next) => {
    const startedNs = process.hrtime.bigint();
    const span = tracer.startSpan(req.method, {
      attributes: { 'http.method': req.method, correlationId: req.correlationId ?? 'unknown' },
    });

    res.on('finish', () => {
      const route = routeTemplate(req);
      const durationSeconds = Number(process.hrtime.bigint() - startedNs) / 1e9;
      metrics.recordHttpRequest({
        method: req.method,
        route,
        statusCode: res.statusCode,
        durationSeconds,
      });
      span.setAttributes({ 'http.route': route, 'http.status_code': res.statusCode });
      span.setStatus(res.statusCode >= 500 ? 'error' : 'ok');
      span.end();
    });

    next();
  };
}

export function routeTemplate(req: {
  baseUrl?: string;
  route?: { path?: string | string[] } | undefined;
  path?: string;
}): string {
  const routePath = req.route?.path;
  if (routePath === undefined) {
    return 'unmatched';
  }
  const template = Array.isArray(routePath) ? routePath.join('|') : routePath;
  const base = req.baseUrl ?? '';
  const combined = `${base}${template}`;
  return combined === '' ? '/' : combined;
}
