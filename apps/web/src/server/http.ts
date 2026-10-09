import { apiErrorSchema } from '@otterware/contracts'
import { ZodError } from 'zod'
import { StorageError } from './storage/driver'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return Response.json(data, { ...init, headers })
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json(
      apiErrorSchema.parse({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      }),
      { status: error.status },
    )
  }
  if (error instanceof StorageError) {
    // A connected bucket refused or failed; its reason helps its owner fix it.
    return json(
      { error: { code: 'storage_error', message: error.message } },
      { status: 502 },
    )
  }
  if (error instanceof ZodError) {
    return json(
      {
        error: {
          code: 'validation_error',
          message: 'The request was invalid.',
          details: error.issues,
        },
      },
      { status: 400 },
    )
  }
  console.error(error)
  return json(
    {
      error: { code: 'internal_error', message: 'An internal error occurred.' },
    },
    { status: 500 },
  )
}

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, 'invalid_json', 'Expected a JSON request body.')
  }
}
