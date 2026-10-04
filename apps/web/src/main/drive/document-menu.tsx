import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FolderIcon,
  LinkIcon,
  MoveRightIcon,
  SparklesIcon,
  Trash2Icon,
  UserPlusIcon,
} from 'lucide-react'
import type { Artifact } from '@otterware/contracts'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
} from '@/components/ui/menu'
import { toast } from '@/components/ui/toast'
import { useFolderRole } from '../folder-role'
import {
  announceSharingChanged,
  folderLabel,
  folderPath,
  useFolders,
  type Folder,
} from '../folders'
import { requestDeleteDocument } from './delete-dialog'
import { useDocumentActions } from './documents'
import { FolderMark } from './folder-mark'
import { requestShare } from './share-dialog'

/**
 * What you can do to a document, wherever it shows (a row's menus, the
 * viewer's): share it, copy its link or an agent prompt, download it, move
 * it, archive it (with Undo), and, once archived, delete it for good.
 */

export function shareDocument(artifact: Artifact, folderId?: string) {
  requestShare({
    type: 'artifact',
    id: artifact.id,
    name: artifact.title,
    url: artifact.url,
    folderId,
  })
}

async function copy(value: string, message: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(message)
  } catch {
    toast.error('Could not copy to the clipboard')
  }
}

export function copyLink(artifact: Artifact) {
  return copy(artifact.url, 'Link copied')
}

/** What to paste into an agent so it edits the document with the CLI. */
export function copyAgentPrompt(artifact: Artifact) {
  return copy(
    `Edit my Otter Drive document at ${artifact.url}. Read the current version first and publish a new immutable version with the Otter Drive CLI.`,
    'Prompt copied: paste it into your agent',
  )
}

export async function downloadDocument(
  artifact: Artifact,
  folderId: string | undefined,
  version?: number,
) {
  const query = version ? `?version=${version}` : ''
  try {
    const response = await fetch(
      `/api/v1/artifacts/${encodeURIComponent(artifact.id)}/download${query}`,
      { headers: folderId ? { 'x-otterdrive-folder': folderId } : {} },
    )
    if (!response.ok) throw new Error(`Download failed (${response.status}).`)
    const disposition = response.headers.get('content-disposition')
    const filename =
      disposition?.match(/filename="?([^";]+)"?/i)?.[1] ??
      artifact.currentVersion?.entryPath ??
      artifact.slug
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  } catch (reason) {
    toast.error('Could not download', {
      description: reason instanceof Error ? reason.message : String(reason),
    })
  }
}

/** Archive or restore, with Undo on the toast (Otter Mail's). */
export function useArchiveDocument(folderId: string | undefined) {
  const { setArchived } = useDocumentActions(folderId)
  return async (artifact: Artifact, archived: boolean) => {
    try {
      const result = await setArchived(artifact, archived)
      // A shared document leaves (or rejoins) Shared with me.
      if (!folderId) announceSharingChanged()
      toast.success(
        `${archived ? 'Archived' : 'Restored'} “${artifact.title}”`,
        {
          action: {
            label: 'Undo',
            onClick: () => void setArchived(result, !archived),
          },
        },
      )
      return result
    } catch (reason) {
      toast.error(`Could not ${archived ? 'archive' : 'restore'}`, {
        description: reason instanceof Error ? reason.message : String(reason),
      })
      return null
    }
  }
}

export function DocumentMenuItems({
  artifact,
  folderId,
  href,
  version,
  onMoved,
  onDeleted,
}: {
  artifact: Artifact
  /**
   * The folder you reach the document through; undefined for a document
   * shared with you on its own, which is addressed by its id.
   */
  folderId: string | undefined
  /** Offers "Open in new tab" (rows, not the viewer). */
  href?: string
  /** The version showing, for Download. */
  version?: number
  onMoved?: (artifact: Artifact, destination: Folder) => void
  onDeleted?: (artifact: Artifact) => void
}) {
  const { folders } = useFolders()
  // The document's own role covers sharing; the folder's is the fallback for
  // responses from before it was reported.
  const folderRole = useFolderRole(
    folderId,
    Boolean(folderId) && !artifact.role,
  )
  const role =
    artifact.role ??
    (folderRole.isOwner ? 'owner' : folderRole.canEdit ? 'editor' : 'viewer')
  const isOwner = role === 'owner'
  const canEdit = role !== 'viewer'
  const { move } = useDocumentActions(folderId)
  const archive = useArchiveDocument(folderId)
  const destinations = folders.filter(
    (item) => item.id !== artifact.folderId && item.role === 'owner',
  )

  async function moveTo(destination: Folder) {
    try {
      const moved = await move(artifact, destination.id)
      toast.success(`Moved “${artifact.title}” to ${folderLabel(destination)}`)
      onMoved?.(moved, destination)
    } catch (reason) {
      toast.error('Could not move the document', {
        description: reason instanceof Error ? reason.message : String(reason),
      })
    }
  }

  return (
    <>
      {href ? (
        <DropdownMenuItem
          icon={<ExternalLinkIcon />}
          onClick={() => window.open(href, '_blank', 'noopener')}
        >
          Open in new tab
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem
        icon={<UserPlusIcon />}
        onClick={() => shareDocument(artifact, folderId)}
      >
        Share…
      </DropdownMenuItem>
      <DropdownMenuItem
        icon={<LinkIcon />}
        onClick={() => void copyLink(artifact)}
      >
        Copy link
      </DropdownMenuItem>
      <DropdownMenuItem
        icon={<SparklesIcon />}
        onClick={() => void copyAgentPrompt(artifact)}
      >
        Copy prompt for an agent
      </DropdownMenuItem>
      <DropdownMenuItem
        icon={<DownloadIcon />}
        onClick={() => void downloadDocument(artifact, folderId, version)}
      >
        Download
      </DropdownMenuItem>
      {isOwner && destinations.length > 0 ? (
        <DropdownMenuSub label="Move to" icon={<MoveRightIcon />}>
          {destinations.map((destination) => (
            <DropdownMenuItem
              key={destination.id}
              icon={
                destination.parentId ? (
                  <FolderIcon />
                ) : (
                  <FolderMark
                    folder={destination}
                    className="size-4 text-[7px]"
                  />
                )
              }
              onClick={() => void moveTo(destination)}
            >
              {folderPath(folders, destination).map(folderLabel).join(' › ')}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSub>
      ) : null}
      {canEdit ? (
        <>
          <DropdownMenuSeparator />
          {artifact.archivedAt ? (
            <DropdownMenuItem
              icon={<ArchiveRestoreIcon />}
              onClick={() => void archive(artifact, false)}
            >
              Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              icon={<ArchiveIcon />}
              onClick={() => void archive(artifact, true)}
            >
              Archive
            </DropdownMenuItem>
          )}
        </>
      ) : null}
      {artifact.archivedAt && isOwner ? (
        <DropdownMenuItem
          variant="destructive"
          icon={<Trash2Icon />}
          onClick={() =>
            requestDeleteDocument({
              artifact,
              folderId,
              ...(onDeleted ? { onDeleted } : {}),
            })
          }
        >
          Delete permanently…
        </DropdownMenuItem>
      ) : null}
    </>
  )
}
