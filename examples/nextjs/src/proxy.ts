import type { NextRequest } from 'next/server'
import { createPreprMiddleware } from '@preprio/toolkit/nextjs'

export function proxy(request: NextRequest) {
  return createPreprMiddleware(request, { preview: true })
}