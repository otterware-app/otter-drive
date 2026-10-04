import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendPasswordResetEmail, sendShareEmail } from './email'

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

describe('sendShareEmail', () => {
  it('names the sharer, the document and the access, escaping HTML', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await sendShareEmail(
      {
        EMAIL_FROM: 'Otter Drive <noreply@otterware.app>',
        RESEND_API_KEY: 're',
      },
      {
        recipient: 'sam@example.com',
        sharerName: 'Chris Kafrouni',
        sharerEmail: 'chris@example.com',
        title: 'Q3 <roadmap>',
        kind: 'document',
        role: 'editor',
        url: 'https://drive.otterware.app/chris/a/q3-roadmap',
        message: 'Have a look\nbefore Friday',
      },
    )

    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    ) as Record<string, string>
    expect(body.subject).toBe('Chris Kafrouni shared “Q3 <roadmap>” with you')
    expect(body.text).toContain('You can edit it.')
    expect(body.text).toContain(
      'https://drive.otterware.app/chris/a/q3-roadmap',
    )
    expect(body.html).toContain('Q3 &lt;roadmap&gt;')
    expect(body.html).toContain('Have a look<br>before Friday')
  })
})
