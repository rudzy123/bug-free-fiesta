import { NextResponse } from 'next/server';
import { loadWebConfig } from '@esign/config';

export function GET(): NextResponse {
  loadWebConfig();
  return NextResponse.json({
    status: 'ok',
    service: 'web',
  });
}
