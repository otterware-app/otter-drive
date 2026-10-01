import { apiErrorSchema } from '@otterware/contracts'

export interface ApiRequestInit extends RequestInit {
  organizationId?: string | undefined
}

export async function api<T>(
  path: string,
  init: ApiRequestInit = {},
): Promise<T> {
  const { organizationId, ...requestInit } = init
  const headers = new Headers(requestInit.headers)
  headers.set('accept', 'application/json')
  if (organizationId) {
    headers.set('x-otterdrive-organization', organizationId)
  }
  if (requestInit.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const response = await fetch(path, { ...requestInit, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = apiErrorSchema.safeParse(body)
    throw new Error(
      parsed.success
        ? parsed.data.error.message
        : `Request failed (${response.status})`,
    )
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
