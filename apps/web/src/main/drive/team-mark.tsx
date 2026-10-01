import { useState } from 'react'
import { cn } from '@/lib/utils'
import { teamColor, teamInitials, type Team } from '../teams'

/** A team's mark: its initials on its color (Otter Mail's account picture). */
export function TeamMark({
  team,
  className,
}: {
  team: Pick<Team, 'id' | 'name'>
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] leading-none font-bold text-white select-none',
        className,
      )}
      style={{ background: teamColor(team) }}
    >
      {teamInitials(team)}
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
