import { describe, expect, it } from 'vitest'
import { isAllowedHostPath, isApplicationAsset } from './host-policy'
import type { Env } from './types'

const env = {
  APP_URL: 'https://drive.otterware.app',
  CONTENT_URL: 'https://usercontent.otterware.app',
} as Env

describe('production host isolation', () => {
  it('serves application routes only on the app host', () => {
    expect(
      isAllowedHostPath(new Request('https://drive.otterware.app/login'), env),
    ).toBe(true)
    expect(
      isAllowedHostPath(
        new Request('https://usercontent.otterware.app/login'),
        env,
      ),
    ).toBe(false)
  })

  it('serves raw routes only on the content host', () => {
    expect(
      isAllowedHostPath(
        new Request('https://usercontent.otterware.app/raw/session/grant'),
        env,
      ),
    ).toBe(true)
    expect(
      isAllowedHostPath(
        new Request('https://usercontent.otterware.app/raw/thumbnail/grant'),
        env,
      ),
    ).toBe(true)
    expect(
      isAllowedHostPath(
        new Request('https://drive.otterware.app/raw/session/grant'),
        env,
      ),
    ).toBe(false)
    expect(
      isAllowedHostPath(
        new Request('https://usercontent.otterware.app/raw/not-a-route'),
        env,
      ),
    ).toBe(false)
  })

  it('allows local development and rejects unknown production hosts', () => {
    expect(
      isAllowedHostPath(new Request('http://localhost:3000/login'), env),
    ).toBe(true)
    expect(
      isAllowedHostPath(new Request('https://example.com/login'), env),
    ).toBe(false)
  })

  it('serves application routes on the worker preview host', () => {
    expect(
      isAllowedHostPath(
        new Request('https://abcd1234-otterware.chris.workers.dev/login'),
        env,
      ),
    ).toBe(true)
    expect(
      isAllowedHostPath(
        new Request('https://otterware.chris.workers.dev/login'),
        env,
      ),
    ).toBe(true)
    expect(
      isAllowedHostPath(
        new Request(
          'https://abcd1234-otterware.chris.workers.dev/raw/session/grant',
        ),
        env,
      ),
    ).toBe(false)
    expect(
      isAllowedHostPath(
        new Request('https://other-worker.chris.workers.dev/login'),
        env,
      ),
    ).toBe(false)
    expect(
      isApplicationAsset(
        new Request(
          'https://abcd1234-otterware.chris.workers.dev/assets/app.js',
        ),
        env,
      ),
    ).toBe(true)
  })

  it('serves static application assets only on the app host', () => {
    expect(
      isApplicationAsset(
        new Request('https://drive.otterware.app/assets/app.js'),
        env,
      ),
    ).toBe(true)
    expect(
      isApplicationAsset(
        new Request('https://drive.otterware.app/manifest.json'),
        env,
      ),
    ).toBe(true)
    expect(
      isApplicationAsset(
        new Request('https://drive.otterware.app/favicon.svg'),
        env,
      ),
    ).toBe(true)
    expect(
      isApplicationAsset(
        new Request('https://usercontent.otterware.app/assets/app.js'),
        env,
      ),
    ).toBe(false)
  })
})
