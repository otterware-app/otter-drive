import { useQuery } from '@tanstack/react-query'
import { api } from '#/lib/api'

interface CurrentActorResponse {
  data: { roles: string[] }
}

/** Your roles in a folder (the active one when no id is given). */
export function useFolderRole(folderId?: string, enabled = true) {
  const query = useQuery({
    enabled,
    queryKey: ['actor', folderId ?? 'active'],
    queryFn: () =>
      api<CurrentActorResponse>('/api/v1/me', { folderId: folderId }),
    staleTime: 5 * 60_000,
  })
  const roles = query.data?.data.roles ?? []

  return {
    canManage: roles.some((role) => ['owner', 'admin'].includes(role)),
    canEdit: roles.some((role) => ['owner', 'admin', 'editor'].includes(role)),
    isOwner: roles.includes('owner'),
    roles,
    loading: query.isPending,
  }
}
