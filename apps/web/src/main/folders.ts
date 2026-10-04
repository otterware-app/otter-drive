import { useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { api } from '#/lib/api'
import {
  sharedWithMeResponseSchema,
  type Folder as FolderRecord,
  type SharedItem,
} from '@otterware/contracts'
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
/** Google Drive's names: your personal drive is always "My Drive". */
export function folderLabel(folder: Pick<Folder, 'kind' | 'name'>): string {
  return folder.kind === 'personal' ? 'My Drive' : folder.name
}

/**
 * The topmost folder you can reach above this one: its drive, or, inside
 * something shared with you, the folder that was shared.
 */
export function driveForFolder(
  folders: Folder[],
  folder: Folder | null,
): Folder | null {
  let current = folder
  const visited = new Set<string>()
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id)
    const parent = folders.find((f) => f.id === current!.parentId)
    // Above a folder shared with you, the folders aren't yours to see.
    if (!parent) break
    current = parent
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

/** Inside a folder someone shared with you, rather than one of your drives. */
export function isInSharedFolder(folders: Folder[], folder: Folder | null) {
  const top = driveForFolder(folders, folder)
  return Boolean(top?.parentId)
}

/** The folders from the topmost one you can reach down to this one. */
export function folderPath(folders: Folder[], folder: Folder | null): Folder[] {
  const path: Folder[] = []
  const visited = new Set<string>()
  let current = folder
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    path.unshift(current)
    current = folders.find((item) => item.id === current!.parentId) ?? null
  }
  return path
}

export const SHARED_CHANGED_EVENT = 'otterdrive:shared-changed'

/** Tell "Shared with me" and the folder list to refetch. */
export function announceSharingChanged() {
  window.dispatchEvent(new Event(SHARED_CHANGED_EVENT))
  announceFoldersChanged()
}

/** Folders and documents other people shared with you, newest first. */
export function useSharedWithMe() {
  const session = authClient.useSession(),
    userId = session.data?.user.id,
    queryClient = useQueryClient()
  const queryKey = useMemo(() => ['shared-with-me', userId] as const, [userId])
  const query = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: async () =>
      sharedWithMeResponseSchema.parse(await api<unknown>('/api/v1/shared'))
        .data,
    staleTime: 30_000,
  })
  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey })
    window.addEventListener(SHARED_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(SHARED_CHANGED_EVENT, refresh)
  }, [queryClient, queryKey])
  const items = query.data ?? ([] as SharedItem[])
  return {
    /** Everything, archived documents too: their links still open. */
    items,
    /** What Shared with me lists: archived documents stay out of it. */
    listed: useMemo(
      () => items.filter((item) => !item.artifact?.archivedAt),
      [items],
    ),
    loading: !userId || query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
  }
}
