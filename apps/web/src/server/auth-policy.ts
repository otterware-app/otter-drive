import type { Env } from './types'
export type PlatformRole = 'admin' | 'user'
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
export function isPlatformAdmin(env: Env, email: string): boolean {
  return normalizeEmail(email) === normalizeEmail(env.ADMIN_EMAIL)
}
export async function authorizeNewUser(
  env: Env,
  email: string,
): Promise<PlatformRole> {
  return isPlatformAdmin(env, email) ? 'admin' : 'user'
}
