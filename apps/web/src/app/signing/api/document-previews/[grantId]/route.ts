import { previewGrantIdParamSchema } from '@esign/contracts';
import { NextResponse } from 'next/server';
import { proxyToApi } from '../../_proxy';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ grantId: string }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { grantId } = await context.params;
  const parsed = previewGrantIdParamSchema.safeParse(grantId);
  if (!parsed.success) {
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
  return proxyToApi(request, `/document-previews/${parsed.data}`);
}
