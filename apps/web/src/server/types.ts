export type Env = Cloudflare.Env

export interface AuthenticatedActor {
  type: 'user' | 'api_key'
  id: string
  name: string
  userId: string | null
  folderId: string
  ownerUserId?: string
  keyScopeId?: string | null
  roles: string[]
  permissions: Record<string, string[]>
}
