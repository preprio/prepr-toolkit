import { createPreprMiddleware } from '@preprio/toolkit/nextjs';
import type { NextRequest } from 'next/server';

// `/static` stands in for a production deployment: the middleware runs with
// preview off. Every other route is a preview render.
export function proxy(request: NextRequest) {
  return createPreprMiddleware(request, {
    preview: request.nextUrl.pathname !== '/static',
  });
}
