import { apiErrorSchema } from '@otterware/contracts'
import type { Profile } from './config'

export class ApiClient {
  readonly baseUrl: string

  constructor(private readonly profile: Profile) {
    this.baseUrl = profile.apiUrl.replace(/\/$/, '')
  }

  async request<T>(
    path: string,
    init: RequestInit & { raw?: boolean } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('accept', init.raw ? '*/*' : 'application/json')
    if (this.profile.apiKey) headers.set('x-api-key', this.profile.apiKey)
    if (this.profile.accessToken) {
      headers.set('authorization', `Bearer ${this.profile.accessToken}`)
    }
    if (this.profile.folderId) {
      headers.set('x-otterdrive-folder', this.profile.folderId)
    }
    if (
      init.body &&
      typeof init.body === 'string' &&
      !headers.has('content-type')
    ) {
      headers.set('content-type', 'application/json')
    }

    const response = await fetch(
      path.startsWith('http') ? path : `${this.baseUrl}${path}`,
      { ...init, headers },
    )
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      const parsed = apiErrorSchema.safeParse(body)
      const generic =
        typeof body === 'object' && body !== null
          ? (body as Record<string, unknown>)
          : null
      const message = parsed.success
        ? parsed.data.error.message
        : typeof generic?.error === 'string'
          ? `${generic.error}: ${String(generic.error_description ?? generic.message ?? '')}`
          : `${response.status} ${response.statusText}`
      throw new Error(message)
    }
    if (init.raw) return response as T
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path)
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method: 'POST' }
    if (body !== undefined) init.body = JSON.stringify(body)
    return this.request<T>(path, init)
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }
}
