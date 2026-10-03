import { useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { api } from '#/lib/api'
import type { Folder as FolderRecord } from '@otterware/contracts'
export type Folder = FolderRecord
export const FOLDERS_CHANGED_EVENT = 'otterdrive:folders-changed'
export function announceFoldersChanged() {
  window.dispatchEvent(new Event(FOLDERS_CHANGED_EVENT))
}
export function useFolders() {
  const session = authClient.useSession(),
    userId = session.data?.user.id,
    queryClient = useQueryClient()
  const queryKey = useMemo(() => ['folders', userId] as const, [userId])
  const selectionKey = useMemo(
    () => ['active-folder', userId] as const,
    [userId],
  )
  const query = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: async () =>
      (await api<{ data: Folder[] }>('/api/v1/folders')).data,
    staleTime: 30_000,
  })
  const selection = useQuery({
    queryKey: selectionKey,
    queryFn: () =>
      new URL(location.href).searchParams.get('folder') ??
      localStorage.getItem(`otterdrive:folder:${userId}`),
    staleTime: Infinity,
  })
  const folders = query.data ?? []
  const activeFolder =
    folders.find((f) => f.id === selection.data) ??
    folders.find((f) => f.kind === 'personal') ??
    folders[0] ??
    null
  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey })
    window.addEventListener(FOLDERS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(FOLDERS_CHANGED_EVENT, refresh)
  }, [queryClient, queryKey])
  const selectFolder = useCallback(
    async (id: string) => {
      localStorage.setItem(`otterdrive:folder:${userId}`, id)
      queryClient.setQueryData(selectionKey, id)
      await queryClient.invalidateQueries({ queryKey })
    },
    [queryClient, selectionKey, queryKey, userId],
  )
  return {
    folders,
    activeFolder,
    selectFolder,
    loaded: Boolean(userId) && !query.isPending,
  }
}
export function driveForFolder(
  folders: Folder[],
  folder: Folder | null,
): Folder | null {
  let current = folder
  const visited = new Set<string>()
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id)
    current = folders.find((f) => f.id === current!.parentId) ?? null
  }
  return current
}
const COLORS = [
  '#ff9500',
  '#34c759',
  '#00c7be',
  '#007aff',
  '#5856d6',
  '#af52de',
  '#ff2d55',
]
export function folderColor(folder: Pick<Folder, 'id'>) {
  let hash = 0
  for (const c of folder.id) hash = (hash * 31 + c.charCodeAt(0)) | 0
  return COLORS[Math.abs(hash) % COLORS.length]!
}
export function folderInitials(folder: Pick<Folder, 'name'>) {
  const words = folder.name.trim().split(/\s+/)
  return (
    words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : words[0]!.slice(0, 2)
  ).toUpperCase()
}
