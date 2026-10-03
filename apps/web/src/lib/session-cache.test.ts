// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readSessionCache,
  removeSessionCachePrefix,
  writeSessionCache,
} from './session-cache'

describe('session cache', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.useRealTimers()
  })

  it('returns fresh values and expires stale values', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T20:00:00Z'))
    writeSessionCache('otterdrive:test', { value: 42 })
    expect(
      readSessionCache<{ value: number }>('otterdrive:test', 1_000)?.value,
    ).toEqual({ value: 42 })
    vi.setSystemTime(new Date('2026-07-11T20:00:02Z'))
    expect(readSessionCache('otterdrive:test', 1_000)).toBeUndefined()
  })

  it('removes only the requested cache namespace', () => {
    writeSessionCache('otterdrive:artifact:one', 1)
    writeSessionCache('otterdrive:artifact:two', 2)
    writeSessionCache('otterdrive:folders:user', 3)
    removeSessionCachePrefix('otterdrive:artifact:')
    expect(sessionStorage.getItem('otterdrive:artifact:one')).toBeNull()
    expect(sessionStorage.getItem('otterdrive:artifact:two')).toBeNull()
    expect(sessionStorage.getItem('otterdrive:folders:user')).not.toBeNull()
  })
})
