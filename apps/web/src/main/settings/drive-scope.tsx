import { toast } from '@/components/ui/toast'
import { FolderMark } from '../drive/folder-mark'
import {
  driveForFolder,
  folderLabel,
  useFolders,
  type Folder,
} from '../folders'

/**
 * The drive a drive's settings apply to: the open drive. Picking a drive in
 * Settings' sidebar opens it, so the documents follow when you go back.
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
      selectFolder(next.id).catch((reason: unknown) => {
        toast.error('Could not switch drives', {
          description:
            reason instanceof Error ? reason.message : String(reason),
        })
      }),
  }
}

/** Over a drive page's title: which drive it is. */
export function DriveScope() {
  const { drive } = useSettingsDrive()
  if (!drive) return null
  return (
    <div className="flex items-center gap-1.5 ps-1.5 text-sm text-muted-foreground">
      <FolderMark folder={drive} className="size-5" />
      <span className="font-medium text-foreground">{folderLabel(drive)}</span>
    </div>
  )
}
