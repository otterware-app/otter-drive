import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileTypeIcon,
  FileVideoCameraIcon,
  GlobeIcon,
  PackageIcon,
  type LucideIcon,
} from 'lucide-react'
import { z } from 'zod'
import {
  artifactListResponseSchema,
  artifactResponseSchema,
  type Artifact,
} from '@otterware/contracts'
import { api } from '#/lib/api'
import {
  readSessionCache,
  removeSessionCachePrefix,
  writeSessionCache,
} from '#/lib/session-cache'

/**
 * A folder's documents: the list query (session-cached, so the list paints at
 * once on reload), what kind each one is, the sidebar's views, and the
 * actions that change them.
 */

export type DocumentStatus = 'active' | 'archived'

export const documentsQueryKey = (folderId: string, status: DocumentStatus) =>
  ['artifacts', folderId, status] as const

const storageKey = (folderId: string, status: DocumentStatus) =>
  `otterdrive:artifacts:${folderId}:${status}`

async function fetchDocuments(
  folderId: string,
  status: DocumentStatus,
): Promise<Artifact[]> {
  const archived = status === 'archived' ? '&archived=only' : ''
  const result = await api<unknown>(`/api/v1/artifacts?limit=100${archived}`, {
    folderId: folderId,
  })
  return writeSessionCache(
    storageKey(folderId, status),
    artifactListResponseSchema.parse(result).data,
  )
}

export function documentsQuery(folderId: string, status: DocumentStatus) {
  const stored = readSessionCache<Artifact[]>(
    storageKey(folderId, status),
    60_000,
  )
  return {
    queryKey: documentsQueryKey(folderId, status),
    queryFn: () => fetchDocuments(folderId, status),
    ...(stored
      ? { initialData: stored.value, initialDataUpdatedAt: stored.savedAt }
      : {}),
    staleTime: 60_000,
  }
}

export function useDocuments(
  folderId: string | undefined,
  status: DocumentStatus,
) {
  // The session cache only seeds the first render; don't re-read it each time.
  const options = useMemo(
    () => documentsQuery(folderId ?? 'none', status),
    [folderId, status],
  )
  const query = useQuery({ ...options, enabled: Boolean(folderId) })
  return {
    documents: query.data ?? [],
    loading: !folderId || query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
  }
}

// ---------------------------------------------------------------------------
// Views and kinds: the sidebar's rows, kept in the URL (routes/_app.tsx).
// ---------------------------------------------------------------------------

export const DOCUMENT_KINDS = [
  'documents',
  'spreadsheets',
  'pages',
  'pdfs',
  'images',
  'videos',
  'other',
] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export const KIND_META: Record<
  DocumentKind,
  { label: string; one: string; icon: LucideIcon }
> = {
  documents: { label: 'Documents', one: 'Document', icon: FileTextIcon },
  spreadsheets: {
    label: 'Spreadsheets',
    one: 'Spreadsheet',
    icon: FileSpreadsheetIcon,
  },
  pages: { label: 'Web pages', one: 'Web page', icon: GlobeIcon },
  pdfs: { label: 'PDFs', one: 'PDF', icon: FileTypeIcon },
  images: { label: 'Images', one: 'Image', icon: FileImageIcon },
  videos: { label: 'Videos', one: 'Video', icon: FileVideoCameraIcon },
  other: { label: 'Other files', one: 'File', icon: PackageIcon },
}

const KIND_BY_EXTENSION: Record<string, DocumentKind> = {
  md: 'documents',
  markdown: 'documents',
  txt: 'documents',
  csv: 'spreadsheets',
  tsv: 'spreadsheets',
  xlsx: 'spreadsheets',
  html: 'pages',
  htm: 'pages',
  pdf: 'pdfs',
  png: 'images',
  jpg: 'images',
  jpeg: 'images',
  gif: 'images',
  webp: 'images',
  svg: 'images',
  mp4: 'videos',
  m4v: 'videos',
  webm: 'videos',
  mov: 'videos',
  ogv: 'videos',
}

/** What a document is, from its current entry file's extension. */
export function documentKind(artifact: Artifact): DocumentKind {
  const extension = artifact.currentVersion?.entryPath
    .split('.')
    .pop()
    ?.toLowerCase()
  return KIND_BY_EXTENSION[extension ?? ''] ?? 'other'
}

export const driveSearchSchema = z.object({
  folder: z.string().max(256).optional().catch(undefined),
  q: z.string().max(200).optional().catch(undefined),
  sort: z.enum(['updated', 'az', 'za']).optional().catch(undefined),
  view: z.enum(['recent', 'archived']).optional().catch(undefined),
  kind: z.enum(DOCUMENT_KINDS).optional().catch(undefined),
})
export type DriveSearch = z.infer<typeof driveSearchSchema>
export type DriveView = NonNullable<DriveSearch['view']> | 'all'

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** The documents a view shows, before search and sort. */
export function inView(
  artifact: Artifact,
  view: DriveView,
  now = Date.now(),
): boolean {
  if (view === 'archived') return artifact.archivedAt !== null
  if (artifact.archivedAt) return false
  if (view === 'recent')
    return now - new Date(artifact.updatedAt).getTime() <= WEEK_MS
  return true
}

/** Search, kind and sort applied to a view's documents. */
export function visibleDocuments(
  artifacts: Artifact[],
  search: DriveSearch,
): Artifact[] {
  const view: DriveView = search.view ?? 'all'
  const needle = search.q?.trim().toLowerCase() ?? ''
  const now = Date.now()
  const shown = artifacts.filter(
    (artifact) =>
      inView(artifact, view, now) &&
      (!search.kind || documentKind(artifact) === search.kind) &&
      (!needle ||
        [artifact.title, artifact.slug, artifact.description]
          .join(' ')
          .toLowerCase()
          .includes(needle)),
  )
  const sort = search.sort ?? 'updated'
  return shown.sort((left, right) => {
    if (sort === 'az') return left.title.localeCompare(right.title)
    if (sort === 'za') return right.title.localeCompare(left.title)
    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Changes to a folder's documents, reflected at once in every cached list. */
export function useDocumentActions(folderId: string | undefined) {
  const queryClient = useQueryClient()

  const update = useCallback(
    (status: DocumentStatus, change: (current: Artifact[]) => Artifact[]) => {
      if (!folderId) return
      queryClient.setQueryData<Artifact[]>(
        documentsQueryKey(folderId, status),
        (current) =>
          current
            ? writeSessionCache(storageKey(folderId, status), change(current))
            : current,
      )
    },
    [queryClient, folderId],
  )

  const forget = useCallback(
    (artifact: Artifact) => {
      removeSessionCachePrefix(
        `otterdrive:artifact:${folderId}:${artifact.slug}`,
      )
      void queryClient.invalidateQueries({
        queryKey: ['artifact-bootstrap', folderId, artifact.slug],
      })
    },
    [queryClient, folderId],
  )

  /** Adds or refreshes one document (after an upload or an edit). */
  const put = useCallback(
    (artifact: Artifact) => {
      const status: DocumentStatus = artifact.archivedAt ? 'archived' : 'active'
      update(status, (current) => [
        artifact,
        ...current.filter((item) => item.id !== artifact.id),
      ])
    },
    [update],
  )

  const setArchived = useCallback(
    async (artifact: Artifact, archived: boolean): Promise<Artifact> => {
      const path = `/api/v1/artifacts/${encodeURIComponent(artifact.id)}`
      const result = artifactResponseSchema.parse(
        archived
          ? await api<unknown>(path, {
              method: 'DELETE',
              folderId: folderId,
            })
          : await api<unknown>(`${path}/restore`, {
              method: 'POST',
              folderId: folderId,
            }),
      ).data
      update(archived ? 'active' : 'archived', (current) =>
        current.filter((item) => item.id !== artifact.id),
      )
      put(result)
      forget(artifact)
      return result
    },
    [forget, put, folderId, update],
  )

  const removed = useCallback(
    (artifact: Artifact) => {
      update('archived', (current) =>
        current.filter((item) => item.id !== artifact.id),
      )
      update('active', (current) =>
        current.filter((item) => item.id !== artifact.id),
      )
      forget(artifact)
    },
    [forget, update],
  )

  const move = useCallback(
    async (artifact: Artifact, destinationId: string): Promise<Artifact> => {
      const result = artifactResponseSchema.parse(
        await api<unknown>(
          `/api/v1/artifacts/${encodeURIComponent(artifact.id)}/move`,
          {
            method: 'POST',
            folderId: folderId,
            body: JSON.stringify({ folderId: destinationId }),
          },
        ),
      ).data
      removed(artifact)
      removeSessionCachePrefix(`otterdrive:artifacts:${destinationId}:`)
      void queryClient.invalidateQueries({
        queryKey: ['artifacts', destinationId],
      })
      return result
    },
    [queryClient, removed, folderId],
  )

  return { put, setArchived, removed, move }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Otter Mail's list dates: the time today, Yesterday, the weekday this
 *  week, then the day. */
export function formatListDate(value: string): string {
  const date = new Date(value)
  const now = new Date()
  const day = 24 * 60 * 60 * 1000
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (date >= today)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (date.getTime() >= today.getTime() - day) return 'Yesterday'
  if (date.getTime() >= today.getTime() - 6 * day)
    return date.toLocaleDateString([], { weekday: 'short' })
  if (date.getFullYear() === now.getFullYear())
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** "3 minutes ago", "2 days ago": for the overview and version menu. */
export function formatRelative(value: string): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 24 * 3600],
    ['month', 30 * 24 * 3600],
    ['week', 7 * 24 * 3600],
    ['day', 24 * 3600],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size)
      return format.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
