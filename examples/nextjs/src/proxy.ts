import type { NextRequest } from 'next/server'
import { createPreprMiddleware } from '@preprio/toolkit/nextjs'
import { preprFeatures } from '@/prepr-features'

export function proxy(request: NextRequest) {
  return createPreprMiddleware(request, {
    preview: true,
    features: preprFeatures,
  })
}