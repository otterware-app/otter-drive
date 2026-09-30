import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendPasswordResetEmail } from './email'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sendPasswordResetEmail', () => {
  it('sends the reset link through Resend', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await sendPasswordResetEmail(
      {
        EMAIL_FROM: 'Otter Drive <noreply@otterware.app>',
        RESEND_API_KEY: 're_test',
      },
      'chris@example.com',
      'https://drive.otterware.app/reset-password?token=abc&next=1',
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers).toEqual({
      Authorization: 'Bearer re_test',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      from: 'Otter Drive <noreply@otterware.app>',
      to: ['chris@example.com'],
      subject: 'Reset your Otter Drive password',
    })
    expect(body.text).toContain('token=abc&next=1')
    expect(body.html).toContain('token=abc&amp;next=1')
  })

  it('fails without exposing the provider response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"message":"sensitive"}', { status: 403 }),
        ),
    )

    await expect(
      sendPasswordResetEmail(
        { EMAIL_FROM: 'noreply@otterware.app', RESEND_API_KEY: 're_test' },
        'chris@example.com',
        'https://drive.otterware.app/reset-password?token=secret',
      ),
    ).rejects.toThrow('Resend rejected the email with status 403.')
  })
})
