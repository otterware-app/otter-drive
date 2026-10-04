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

async function sendEmail(
  env: EmailEnv,
  email: { to: string; subject: string; text: string; html: string },
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
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend rejected the email with status ${response.status}.`)
  }
}

export async function sendPasswordResetEmail(
  env: EmailEnv,
  recipient: string,
  resetUrl: string,
): Promise<void> {
  await sendEmail(env, {
    to: recipient,
    subject: 'Reset your Otter Drive password',
    text: `Reset your Otter Drive password using this link:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Reset your Otter Drive password using the link below.</p><p><a href="${escapeHtml(resetUrl)}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
  })
}

/** Google Drive's "Chris shared a document with you". */
export async function sendShareEmail(
  env: EmailEnv,
  share: {
    recipient: string
    sharerName: string
    sharerEmail: string | null
    title: string
    kind: 'document' | 'folder' | 'shared drive'
    role: 'viewer' | 'editor'
    url: string
    message: string | null
  },
): Promise<void> {
  const sharer = share.sharerEmail
    ? `${share.sharerName} (${share.sharerEmail})`
    : share.sharerName
  const what =
    share.kind === 'shared drive'
      ? `added you to the shared drive “${share.title}”`
      : `shared a ${share.kind} with you`
  const access = share.role === 'editor' ? 'edit' : 'view'
  const quote = share.message
    ? `<blockquote style="margin:16px 0;padding-left:12px;border-left:3px solid #e5e5e5;color:#444">${escapeHtml(share.message).replaceAll('\n', '<br>')}</blockquote>`
    : ''
  await sendEmail(env, {
    to: share.recipient,
    subject:
      share.kind === 'shared drive'
        ? `${share.sharerName} added you to “${share.title}”`
        : `${share.sharerName} shared “${share.title}” with you`,
    text: `${sharer} ${what}. You can ${access} it.\n\n${share.message ? `${share.message}\n\n` : ''}${share.title}: ${share.url}\n\nSign in to Otter Drive with ${share.recipient} to open it.`,
    html: `<p>${escapeHtml(sharer)} ${escapeHtml(what)}. You can ${access} it.</p>${quote}<p><a href="${escapeHtml(share.url)}" style="display:inline-block;padding:8px 14px;border-radius:8px;background:#0d0d0d;color:#fff;text-decoration:none">Open “${escapeHtml(share.title)}”</a></p><p style="color:#666">Sign in to Otter Drive with ${escapeHtml(share.recipient)} to open it.</p>`,
  })
}
