import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  MoreHorizontal,
  MoveRight,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { artifactResponseSchema, type Artifact } from '@otterware/contracts'
import { api, formatDate } from '#/lib/api'
import { artifactBootstrapQuery } from '#/lib/artifact-query'
import { removeSessionCachePrefix } from '#/lib/session-cache'
import { useOrganizations } from '@/hooks/use-organizations'
import { useCurrentActor } from '@/hooks/use-current-actor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AccountMenu, BrandLink, TeamSwitcher } from './app-header'
import { ArtifactLoadingState } from './artifact-loading-state'
import { DeleteArtifactDialog } from './delete-artifact-dialog'

const ArtifactDocumentPreview = lazy(() =>
  import('./artifact-document-preview').then((module) => ({
    default: module.ArtifactDocumentPreview,
  })),
)

export function ArtifactViewer({
  onSheetChange,
  organizationId,
  organizationSlug,
  sheet,
  slug,
  version,
}: {
  onSheetChange?: ((sheet: string | undefined) => void) | undefined
  organizationId: string
  organizationSlug: string
  sheet?: string | undefined
  slug: string
  version?: number
}) {
  const [artifactOverride, setArtifactOverride] = useState<Artifact | null>(
    null,
  )
  const [actionError, setActionError] = useState<string | null>(null)
  const [changingArchivedState, setChangingArchivedState] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editorActionsContainer, setEditorActionsContainer] =
    useState<HTMLDivElement | null>(null)
  const { organizations } = useOrganizations()
  const { canManage, isOwner } = useCurrentActor(organizationId)
  const queryClient = useQueryClient()
  const bootstrapQuery = useQuery(
    artifactBootstrapQuery(organizationId, slug, version),
  )
  const artifact = artifactOverride ?? bootstrapQuery.data?.artifact ?? null
  const versions = bootstrapQuery.data?.versions ?? []
  const previewUrl = bootstrapQuery.data?.preview.url ?? null
  const previewContentType = bootstrapQuery.data?.preview.contentType ?? null
  const error =
    actionError ??
    (bootstrapQuery.error instanceof Error
      ? bootstrapQuery.error.message
      : null)

  const selected = useMemo(
    () =>
      versions.find((item) => item.number === version) ??
      versions.find((item) => item.id === artifact?.currentVersion?.id) ??
      artifact?.currentVersion ??
      null,
    [artifact, version, versions],
  )
  const artifactOrganization = organizations.find(
    (organization) => organization.id === artifact?.organizationId,
  )

  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(message)
    } catch {
      toast.error('Could not copy to the clipboard.')
    }
  }

  async function downloadArtifact() {
    if (!artifact || !selected) return
    try {
      const response = await fetch(
        `/api/v1/artifacts/${encodeURIComponent(artifact.id)}/download?version=${selected.number}`,
        { headers: { 'x-otterdrive-organization': organizationId } },
      )
      if (!response.ok) throw new Error(`Download failed (${response.status}).`)
      const disposition = response.headers.get('content-disposition')
      const filename =
        disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? selected.entryPath
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    }
  }

  async function changeArchivedState() {
    if (!artifact) return
    setChangingArchivedState(true)
    setActionError(null)
    try {
      const result = artifactResponseSchema.parse(
        artifact.archivedAt
          ? await api<unknown>(
              `/api/v1/artifacts/${encodeURIComponent(artifact.id)}/restore`,
              { method: 'POST', organizationId },
            )
          : await api<unknown>(
              `/api/v1/artifacts/${encodeURIComponent(artifact.id)}`,
              { method: 'DELETE', organizationId },
            ),
      )
      setArtifactOverride(result.data)
      removeSessionCachePrefix(`otterdrive:artifact:${organizationId}:${slug}`)
      removeSessionCachePrefix(`otterdrive:artifacts:${organizationId}:`)
      await queryClient.invalidateQueries({
        queryKey: ['artifacts', organizationId],
      })
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setChangingArchivedState(false)
    }
  }

  async function moveArtifact() {
    if (!artifact) return
    const destinations = organizations.filter(
      (organization) => organization.id !== organizationId,
    )
    const reference = window.prompt(
      `Move to which team? Enter one of: ${destinations.map((item) => item.name).join(', ')}`,
    )
    if (!reference) return
    const normalized = reference.trim().toLowerCase()
    const destination = destinations.find(
      (item) =>
        item.id === reference ||
        item.slug.toLowerCase() === normalized ||
        item.name.toLowerCase() === normalized,
    )
    if (!destination) {
      setActionError('Destination team not found.')
      return
    }
    setActionError(null)
    try {
      const result = artifactResponseSchema.parse(
        await api<unknown>(
          `/api/v1/artifacts/${encodeURIComponent(artifact.id)}/move`,
          {
            method: 'POST',
            organizationId,
            body: JSON.stringify({ organizationId: destination.id }),
          },
        ),
      )
      removeSessionCachePrefix(`otterdrive:artifact:${organizationId}:`)
      removeSessionCachePrefix(`otterdrive:artifacts:${organizationId}:`)
      removeSessionCachePrefix(`otterdrive:artifacts:${destination.id}:`)
      location.assign(`/${destination.slug}/a/${result.data.slug}/`)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  if (
    !error &&
    (!artifact || !selected || !previewUrl || !previewContentType)
  ) {
    return <ArtifactLoadingState />
  }

  return (
    <div className="viewer-shell">
      <header className="viewer-header">
        <div className="viewer-left">
          <BrandLink />
          <TeamSwitcher current={artifactOrganization} />
          <ChevronRight className="viewer-crumb-separator" aria-hidden="true" />
          {artifact && selected ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="version-trigger"
                  />
                }
              >
                <strong>{artifact.title}</strong>
                {versions.length > 1 && <ChevronDown size={15} />}
              </DropdownMenuTrigger>
              {versions.length > 1 && (
                <DropdownMenuContent align="start" className="version-menu">
                  {versions.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      render={
                        <Link
                          to="/$organizationSlug/a/$slug/$version"
                          params={{
                            organizationSlug:
                              artifactOrganization?.slug ?? 'team',
                            slug: artifact.slug,
                            version: `v${item.number}`,
                          }}
                          search={sheet ? { sheet } : {}}
                        />
                      }
                      className={
                        item.number === selected.number ? 'active' : ''
                      }
                    >
                      <strong>v{item.number}</strong>
                      <span>{item.label}</span>
                      <small>{formatDate(item.createdAt)}</small>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              )}
            </DropdownMenu>
          ) : (
            <strong>Otter Drive Document</strong>
          )}
          {selected && versions.length > 1 && (
            <Badge variant="outline">v{selected.number}</Badge>
          )}
          {artifact?.archivedAt && <Badge variant="secondary">Archived</Badge>}
        </div>
        <div className="viewer-actions">
          <div
            ref={setEditorActionsContainer}
            className="viewer-editor-actions-slot"
          />
          {artifact && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    type="button"
                    aria-label="Document actions"
                    disabled={changingArchivedState}
                  />
                }
              >
                <MoreHorizontal size={15} />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="artifact-actions-menu"
              >
                {canManage && organizations.length > 1 && (
                  <DropdownMenuItem onClick={() => void moveArtifact()}>
                    <MoveRight size={14} />
                    Move to another team
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  variant={artifact.archivedAt ? 'default' : 'destructive'}
                  onClick={() => void changeArchivedState()}
                >
                  {artifact.archivedAt ? (
                    <RotateCcw size={14} />
                  ) : (
                    <Archive size={14} />
                  )}
                  {artifact.archivedAt
                    ? 'Restore document'
                    : 'Archive document'}
                </DropdownMenuItem>
                {artifact.archivedAt && isOwner && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 size={14} />
                      Delete permanently
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {artifact && (
            <Button
              variant="outline"
              size="icon-sm"
              type="button"
              aria-label="Copy edit prompt"
              onClick={() =>
                void copy(
                  `Edit my Otter Drive document at ${artifact.url}. Read the current version first and publish a new immutable version with the Otter Drive CLI.`,
                  'Edit prompt copied.',
                )
              }
            >
              <Pencil size={15} />
            </Button>
          )}
          {artifact && selected && (
            <Button
              variant="outline"
              size="icon-sm"
              type="button"
              aria-label={`Download ${artifact.title} version ${selected.number}`}
              onClick={() => void downloadArtifact()}
            >
              <Download size={15} />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() =>
              artifact && void copy(artifact.url, 'Document link copied.')
            }
          >
            <Copy size={14} /> Share
          </Button>
          <AccountMenu />
        </div>
      </header>
      <main className="viewer-main">
        {error && <div className="viewer-message error-panel">{error}</div>}
        {previewUrl &&
        previewContentType &&
        artifact &&
        selected &&
        isDocumentPreview(previewContentType, selected.entryPath) ? (
          <Suspense fallback={<ArtifactLoadingState />}>
            <ArtifactDocumentPreview
              actionsContainer={editorActionsContainer}
              contentType={previewContentType}
              entryPath={selected.entryPath}
              expectedCurrentVersion={artifact.versionCount}
              onSheetChange={onSheetChange}
              organizationId={organizationId}
              organizationSlug={organizationSlug}
              selectedSheet={sheet}
              slug={slug}
              version={selected.number}
            />
          </Suspense>
        ) : previewUrl && artifact && selected ? (
          <iframe
            key={`${slug}:${selected.number}:${previewUrl}`}
            className="artifact-frame"
            src={previewUrl}
            title={`${artifact.title} version ${selected.number}`}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
            referrerPolicy="no-referrer"
          />
        ) : null}
      </main>
      <DeleteArtifactDialog
        artifact={deleteDialogOpen ? artifact : null}
        organizationId={organizationId}
        onOpenChange={setDeleteDialogOpen}
        onDeleted={() => location.assign('/home')}
      />
    </div>
  )
}

function isDocumentPreview(contentType: string, entryPath: string): boolean {
  const type = contentType.split(';')[0]?.trim().toLowerCase()
  const extension = entryPath.split('.').pop()?.toLowerCase()
  return (
    type === 'text/markdown' ||
    type === 'text/plain' ||
    type === 'text/csv' ||
    type ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    ['md', 'markdown', 'txt', 'csv', 'tsv', 'xlsx'].includes(extension ?? '')
  )
}
