import {
  FolderInputIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  LinkIcon,
  PencilIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/menu'
import { toast } from '@/components/ui/toast'
import { folderLabel, type Folder } from '../folders'
import { requestFolderDialog } from './folder-dialogs'
import { requestNewFolder } from './new-folder-dialog'
import { requestShare } from './share-dialog'

/** Where a folder opens: `/home?folder=…`, for anyone with access. */
export function folderLink(folder: Pick<Folder, 'id'>) {
  return `${location.origin}/home?folder=${encodeURIComponent(folder.id)}`
}

export function shareFolder(folder: Folder) {
  requestShare({ type: 'folder', id: folder.id, name: folderLabel(folder) })
}

/**
 * What you can do to a folder, wherever it shows (its row, the breadcrumb):
 * open it, share it (a shared drive manages its members), copy its link, add
 * a folder inside, rename or move it, and delete it once it's empty.
 */
export function FolderMenuItems({
  folder,
  onOpen,
  onDeleted,
}: {
  folder: Folder
  onOpen?: () => void
  onDeleted?: (folder: Folder) => void
}) {
  const isDrive = folder.parentId === null
  const canEdit = folder.role !== 'viewer'
  const canRename = isDrive
    ? folder.kind === 'shared' && folder.role === 'owner'
    : canEdit
  return (
    <>
      {onOpen ? (
        <DropdownMenuItem icon={<FolderOpenIcon />} onClick={onOpen}>
          Open
        </DropdownMenuItem>
      ) : null}
      {folder.kind !== 'personal' ? (
        <DropdownMenuItem
          icon={isDrive ? <UsersIcon /> : <UserPlusIcon />}
          onClick={() => shareFolder(folder)}
        >
          {isDrive
            ? folder.role === 'owner'
              ? 'Manage members…'
              : 'Members…'
            : 'Share…'}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem
        icon={<LinkIcon />}
        onClick={() =>
          void navigator.clipboard.writeText(folderLink(folder)).then(
            () => toast.success('Link copied'),
            () => toast.error('Could not copy to the clipboard'),
          )
        }
      >
        Copy link
      </DropdownMenuItem>
      {canEdit ? (
        <DropdownMenuItem
          icon={<FolderPlusIcon />}
          onClick={() => requestNewFolder(folder)}
        >
          New folder inside
        </DropdownMenuItem>
      ) : null}
      {canRename ? (
        <DropdownMenuItem
          icon={<PencilIcon />}
          onClick={() => requestFolderDialog({ action: 'rename', folder })}
        >
          Rename…
        </DropdownMenuItem>
      ) : null}
      {!isDrive && folder.role === 'owner' ? (
        <DropdownMenuItem
          icon={<FolderInputIcon />}
          onClick={() => requestFolderDialog({ action: 'move', folder })}
        >
          Move to…
        </DropdownMenuItem>
      ) : null}
      {folder.role === 'owner' && folder.kind !== 'personal' ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            icon={<Trash2Icon />}
            onClick={() =>
              requestFolderDialog({
                action: 'delete',
                folder,
                ...(onDeleted ? { onDeleted } : {}),
              })
            }
          >
            Delete…
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  )
}
