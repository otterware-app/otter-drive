import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LinkIcon,
  MoveRightIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react'
import type { Artifact } from '@otterware/contracts'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
} from '@/components/ui/menu'
import { toast } from '@/components/ui/toast'
import { useTeamRole } from '../team-role'
import { useTeams, type Team } from '../teams'
import { requestDeleteDocument } from './delete-dialog'
import { useDocumentActions } from './documents'
import { TeamMark } from './team-mark'

/**
 * What you can do to a document, wherever it shows (a row's menus, the
 * viewer's): copy its link or an agent prompt, download it, move it, archive
 * it (with Undo), and, once archived, delete it for good.
 */

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
  teamId: string,
  version?: number,
) {
  const query = version ? `?version=${version}` : ''
  try {
    const response = await fetch(
      `/api/v1/artifacts/${encodeURIComponent(artifact.id)}/download${query}`,
      { headers: { 'x-otterdrive-organization': teamId } },
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
export function useArchiveDocument(teamId: string | undefined) {
  const { setArchived } = useDocumentActions(teamId)
  return async (artifact: Artifact, archived: boolean) => {
    try {
      const result = await setArchived(artifact, archived)
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
  team,
  href,
  version,
  onMoved,
  onDeleted,
}: {
  artifact: Artifact
  team: Team
  /** Offers "Open in new tab" (rows, not the viewer). */
  href?: string
  /** The version showing, for Download. */
  version?: number
  onMoved?: (artifact: Artifact, destination: Team) => void
  onDeleted?: (artifact: Artifact) => void
}) {
  const { teams } = useTeams()
  const { canManage, canEdit, isOwner } = useTeamRole(team.id)
  const { move } = useDocumentActions(team.id)
  const archive = useArchiveDocument(team.id)
  const destinations = teams.filter((item) => item.id !== team.id)

  async function moveTo(destination: Team) {
    try {
      const moved = await move(artifact, destination.id)
      toast.success(`Moved “${artifact.title}” to ${destination.name}`)
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
        onClick={() => void downloadDocument(artifact, team.id, version)}
      >
        Download
      </DropdownMenuItem>
      {canManage && destinations.length > 0 ? (
        <DropdownMenuSub label="Move to" icon={<MoveRightIcon />}>
          {destinations.map((destination) => (
            <DropdownMenuItem
              key={destination.id}
              icon={
                <TeamMark team={destination} className="size-4 text-[7px]" />
              }
              onClick={() => void moveTo(destination)}
            >
              {destination.name}
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
              teamId: team.id,
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
