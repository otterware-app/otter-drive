import type { Env } from './types'

const RESEND_EMAILS_URL = 'https://api.resend.com/emails'

type EmailEnv = Pick<Env, 'EMAIL_FROM' | 'RESEND_API_KEY'>

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character]!,
  )
}

export async function sendPasswordResetEmail(
  env: EmailEnv,
  recipient: string,
  resetUrl: string,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured.')
  }
  if (!env.EMAIL_FROM) {
    throw new Error('EMAIL_FROM is not configured.')
  }

  const response = await fetch(RESEND_EMAILS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [recipient],
      subject: 'Reset your Otter Drive password',
      text: `Reset your Otter Drive password using this link:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Reset your Otter Drive password using the link below.</p><p><a href="${escapeHtml(resetUrl)}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend rejected the email with status ${response.status}.`)
  }
}
