import { useState } from 'react'
import { HardDriveIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { folderColor, folderInitials, type Folder } from '../folders'

/**
 * A drive's mark: a shared drive's initials on its color (Otter Mail's
 * account picture), or a drive for My Drive, which has no name of its own.
 */
export function FolderMark({
  folder,
  className,
}: {
  folder: Pick<Folder, 'id' | 'name'> & { kind?: Folder['kind'] }
  className?: string
}) {
  if (folder.kind === 'personal')
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground text-canvas select-none',
          className,
        )}
      >
        <HardDriveIcon className="size-[62%]" strokeWidth={2} />
      </span>
    )
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] leading-none font-bold text-white select-none',
        className,
      )}
      style={{ background: folderColor(folder) }}
    >
      {folderInitials(folder)}
    </span>
  )
}

/** You: your picture when there is one, your initials otherwise. */
export function UserAvatar({
  user,
  className,
}: {
  user: {
    name?: string | null | undefined
    email?: string | null | undefined
    image?: string | null | undefined
  }
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const initials = (user.name || user.email || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-surface text-[10px] font-medium text-muted-foreground select-none',
        className,
      )}
    >
      {user.image && !failed ? (
        <img
          src={user.image}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  )
}
