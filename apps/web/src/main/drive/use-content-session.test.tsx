// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useContentSession } from './use-content-session'

const clients: QueryClient[] = []
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  focusManager.setFocused(undefined)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function setup() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-02T08:00:00Z'))
  focusManager.setFocused(true)
  let grants = 0
  const fetcher = vi.fn(async (path: string, _init?: RequestInit) => {
    const url = new URL(path, 'https://drive.otterware.app')
    if (url.pathname.endsWith('/preview')) {
      const version = Number(url.searchParams.get('version'))
      return Response.json({
        data: {
          url: `https://usercontent.otterware.app/raw/session/grant-${++grants}`,
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          resourceBaseUrl: `https://usercontent.otterware.app/raw/a/artifact-1/version-${version}/`,
          contentType: 'text/markdown',
          version: {
            id: `version-${version}`,
            number: version,
            label: 'Release',
            entryPath: 'README.md',
            createdAt: new Date().toISOString(),
            createdBy: null,
            fileCount: 1,
            byteSize: 10,
            contentHash: 'hash',
          },
        },
      })
    }
    return new Response('# Readme')
  })
  vi.stubGlobal('fetch', fetcher)
  const client = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false } },
  })
  clients.push(client)
  const hook = renderHook(
    (props: { version: number; enabled: boolean }) =>
      useContentSession({
        folderId: 'org-test',
        slug: 'roadmap',
        ...props,
      }),
    {
      initialProps: { version: 1, enabled: true },
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  )
  const settle = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
  }
  return { ...hook, fetcher, settle }
}

describe('content session lifecycle', () => {
  it('establishes a cookie session and keeps resource URLs independent of five-minute grants', async () => {
    const { result, fetcher, settle } = setup()
    await settle()
    expect(result.current.data).toBe(
      'https://usercontent.otterware.app/raw/a/artifact-1/version-1/',
    )
    expect(fetcher).toHaveBeenCalledWith(
      'https://usercontent.otterware.app/raw/session/grant-1',
      expect.objectContaining({
        mode: 'no-cors',
        credentials: 'include',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get(
        'x-otterdrive-folder',
      ),
    ).toBe('org-test')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6 * 60_000)
    })
    expect(result.current.data).toBe(
      'https://usercontent.otterware.app/raw/a/artifact-1/version-1/',
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('refreshes an open reader before the four-hour content cookie expires', async () => {
    const { result, fetcher, settle } = setup()
    await settle()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * 60 * 60_000)
    })
    await settle()
    expect(fetcher).toHaveBeenCalledWith(
      'https://usercontent.otterware.app/raw/session/grant-2',
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(result.current.isSuccess).toBe(true)
  })

  it('renews a stale background reader on returning to the tab', async () => {
    const { result, fetcher, settle } = setup()
    await settle()
    focusManager.setFocused(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 60_000)
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    await act(async () => {
      focusManager.setFocused(true)
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(result.current.isSuccess).toBe(true)
  })

  it('establishes a separate session when the selected version changes', async () => {
    const { result, rerender, fetcher, settle } = setup()
    await settle()
    rerender({ version: 2, enabled: true })
    await settle()
    expect(result.current.data).toBe(
      'https://usercontent.otterware.app/raw/a/artifact-1/version-2/',
    )
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
})
