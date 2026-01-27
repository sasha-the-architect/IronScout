/**
 * Signup Route - Proxies to API service
 *
 * This route forwards signup requests to the API service.
 * The web app never directly accesses the database.
 */

import { NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'
import { env } from '@/lib/env'

const logger = createLogger('api:signup')

const API_URL = env.NEXT_PUBLIC_API_URL

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // Forward to API
    const response = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    logger.error('Signup error', {}, error)
    return NextResponse.json(
      { error: 'An error occurred during signup' },
      { status: 500 }
    )
  }
}
