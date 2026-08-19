import { NextResponse } from 'next/server';
import { isAllowedSigningPath, proxyToApi } from '../_proxy';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export function GET(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export function POST(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

async function handle(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  if (!isAllowedSigningPath(path)) {
    return NextResponse.json(
      {
        error: {
          code: 'not_found',
          message: 'Not found.',
          correlationId: 'web-proxy',
        },
      },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const first = path[0];
  if (first === undefined) {
    return NextResponse.json(
      {
        error: {
          code: 'not_found',
          message: 'Not found.',
          correlationId: 'web-proxy',
        },
      },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return proxyToApi(request, `/signing/${first}`);
}
