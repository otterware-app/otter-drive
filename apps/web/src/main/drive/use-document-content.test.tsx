// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDocumentContent } from './use-document-content'

const clients: QueryClient[] = []
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.unstubAllGlobals()
})
const input = {
  organizationId: 'org-1',
  slug: 'roadmap',
  version: 1,
  entryPath: 'README.md',
  kind: 'markdown' as const,
}
function setup() {
  const client = new QueryClient()
  clients.push(client)
  return renderHook((props: typeof input) => useDocumentContent(props), {
    initialProps: input,
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

describe('document content loading', () => {
  it('reuses immutable versions while keeping organizations and versions separate', async () => {
    const fetcher = vi.fn(
      async (path: string, init: RequestInit) =>
        new Response(
          `${new Headers(init.headers).get('x-otterdrive-organization')}:${new URL(path, 'https://drive.otterware.app').searchParams.get('version')}`,
        ),
    )
    vi.stubGlobal('fetch', fetcher)
    const { result, rerender } = setup()
    await waitFor(() =>
      expect(result.current.data).toEqual({ kind: 'text', text: 'org-1:1' }),
    )
    rerender({ ...input, version: 2 })
    await waitFor(() =>
      expect(result.current.data).toEqual({ kind: 'text', text: 'org-1:2' }),
    )
    rerender(input)
    await waitFor(() =>
      expect(result.current.data).toEqual({ kind: 'text', text: 'org-1:1' }),
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
    rerender({ ...input, organizationId: 'org-2' })
    await waitFor(() =>
      expect(result.current.data).toEqual({ kind: 'text', text: 'org-2:1' }),
    )
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('cancels a pending request when another version opens', async () => {
    let firstSignal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          (_path: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              firstSignal = init.signal as AbortSignal
              firstSignal.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError')),
              )
            }),
        )
        .mockResolvedValueOnce(new Response('# New version')),
    )
    const { result, rerender } = setup()
    rerender({ ...input, version: 2 })
    await waitFor(() =>
      expect(result.current.data).toEqual({
        kind: 'text',
        text: '# New version',
      }),
    )
    expect(firstSignal?.aborted).toBe(true)
    expect(result.current.error).toBeNull()
  })
})
