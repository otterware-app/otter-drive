import { useState } from 'react'
import { ChevronDownIcon, PlusIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { toast } from '@/components/ui/toast'
import { FolderMark } from '../drive/folder-mark'
import { useCanCreateFolders } from '../drive/folder-rail'
import { NewFolderDialog } from '../drive/new-folder-dialog'
import {
  driveForFolder,
  folderLabel,
  useFolders,
  type Folder,
} from '../folders'

/**
 * The drive a drive's settings apply to: the open drive. Switching it here
 * switches the open drive, so the documents follow when you go back.
 */
export function useSettingsDrive() {
  const { folders, activeFolder, selectFolder } = useFolders()
  // Your drives: My Drive first, then shared drives (folders shared with you
  // on their own aren't drives you set up).
  const drives = folders.filter((folder) => !folder.parentId)
  const drive = driveForFolder(folders, activeFolder)
  return {
    drives,
    drive: drive && !drive.parentId ? drive : (drives[0] ?? null),
    selectDrive: (next: Folder) =>
      void selectFolder(next.id).catch((reason: unknown) =>
        toast.error('Could not switch drives', {
          description:
            reason instanceof Error ? reason.message : String(reason),
        }),
      ),
  }
}

/** "Settings for [Zentio ▾]": the drive pages' scope, and where to swap it. */
export function DriveScope() {
  const { drives, drive, selectDrive } = useSettingsDrive()
  const canCreate = useCanCreateFolders()
  const [creating, setCreating] = useState(false)
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className="ps-1.5">Settings for</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Choose the drive these settings apply to"
              className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-foreground outline-none hover:bg-accent-surface focus-visible:ring-2 focus-visible:ring-focus-ring data-popup-open:bg-accent-surface"
            />
          }
        >
          {drive ? (
            <>
              <FolderMark folder={drive} className="size-5" />
              <span className="font-medium">{folderLabel(drive)}</span>
            </>
          ) : (
            <span>a drive</span>
          )}
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {drives.map((item) => (
            <DropdownMenuCheckItem
              key={item.id}
              icon={<FolderMark folder={item} className="size-5" />}
              checked={item.id === drive?.id}
              onClick={() => selectDrive(item)}
            >
              <span className="flex w-full items-center gap-3">
                <span className="flex-1 truncate">{folderLabel(item)}</span>
                <span className="text-xs text-muted-foreground">
                  {item.kind === 'personal'
                    ? 'Personal'
                    : item.role === 'owner'
                      ? 'Owner'
                      : item.role === 'editor'
                        ? 'Can edit'
                        : 'Can view'}
                </span>
              </span>
            </DropdownMenuCheckItem>
          ))}
          {canCreate ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                icon={<PlusIcon />}
                onClick={() => setCreating(true)}
              >
                New shared drive…
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <NewFolderDialog
        kind="shared"
        open={creating}
        onOpenChange={setCreating}
      />
    </div>
  )
}
