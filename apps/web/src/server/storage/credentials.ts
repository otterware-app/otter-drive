/**
 * Bucket credentials at rest: AES-256-GCM under a key derived (HKDF) from
 * `STORAGE_CREDENTIALS_KEY`, or from `BETTER_AUTH_SECRET` when that isn't
 * set, so no new secret is needed to deploy. The backend's id is the
 * additional data: a ciphertext copied onto another row won't decrypt.
 */

const encoder = new TextEncoder()
const VERSION = 'v1'

interface CredentialsEnv {
  STORAGE_CREDENTIALS_KEY?: string
  BETTER_AUTH_SECRET: string
}

async function key(env: CredentialsEnv): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.STORAGE_CREDENTIALS_KEY || env.BETTER_AUTH_SECRET),
    'HKDF',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('otterdrive'),
      info: encoder.encode('storage-credentials-v1'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index)
  return bytes
}

export async function sealCredentials(
  env: CredentialsEnv,
  backendId: string,
  credentials: Record<string, string>,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(backendId) },
    await key(env),
    encoder.encode(JSON.stringify(credentials)),
  )
  return `${VERSION}.${toBase64(iv)}.${toBase64(sealed)}`
}

export async function openCredentials(
  env: CredentialsEnv,
  backendId: string,
  ciphertext: string,
): Promise<Record<string, string>> {
  const [version, iv, sealed] = ciphertext.split('.')
  if (version !== VERSION || !iv || !sealed)
    throw new Error('Unknown storage credentials format.')
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(iv),
      additionalData: encoder.encode(backendId),
    },
    await key(env),
    fromBase64(sealed),
  )
  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, string>
}
