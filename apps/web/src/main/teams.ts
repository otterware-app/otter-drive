import { useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { readSessionCache, writeSessionCache } from '#/lib/session-cache'

/**
 * The teams you belong to (Better Auth organizations), and the active one:
 * the team home shows, new uploads land in, and Settings configures. Like
 * Otter Mail's mailboxes, they come from a short-lived session cache first so
 * the rail paints before the network answers.
 */

export interface Team {
  id: string
  name: string
  slug: string
}

export const TEAMS_CHANGED_EVENT = 'otterdrive:organizations-changed'

/** Tell every `useTeams` to refetch (after creating or renaming a team). */
export function announceTeamsChanged() {
  window.dispatchEvent(new Event(TEAMS_CHANGED_EVENT))
}

export function useTeams() {
  const session = authClient.useSession()
  const queryClient = useQueryClient()
  const userId = session.data?.user.id
  const queryKey = useMemo(() => ['organizations', userId] as const, [userId])
  const storageKey = `otterdrive:organizations:${userId ?? 'anonymous'}`
  const stored = readSessionCache<Team[]>(storageKey, 5 * 60_000)
  const teamsQuery = useQuery({
    enabled: Boolean(userId),
    queryFn: async () => {
      const result = await authClient.organization.list()
      if (result.error) throw new Error(result.error.message)
      return writeSessionCache(storageKey, (result.data ?? []) as Team[])
    },
    ...(stored
      ? { initialData: stored.value, initialDataUpdatedAt: stored.savedAt }
      : {}),
    queryKey,
    staleTime: 5 * 60_000,
  })
  const teams = teamsQuery.data ?? []
  const loaded = Boolean(userId) && !teamsQuery.isPending

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey })
    window.addEventListener(TEAMS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(TEAMS_CHANGED_EVENT, refresh)
  }, [queryClient, queryKey])

  const activeTeam = useMemo(() => {
    const activeId = session.data?.session.activeOrganizationId
    return teams.find((team) => team.id === activeId) ?? teams[0] ?? null
  }, [teams, session.data?.session.activeOrganizationId])

  const selectTeam = useCallback(
    async (teamId: string) => {
      if (teamId === activeTeam?.id) return
      const result = await authClient.organization.setActive({
        organizationId: teamId,
      })
      if (result.error) throw new Error(result.error.message)
      await session.refetch()
      await queryClient.invalidateQueries({ queryKey: ['actor'] })
    },
    [activeTeam?.id, queryClient, session],
  )

  return { activeTeam, loaded, teams, selectTeam }
}

/** Preset team colors: the macOS-style accent palette Otter Mail gives its
 *  mailboxes, picked stably from the team's id. */
const TEAM_COLORS = [
  '#ff3b30',
  '#ff9500',
  '#e5a800',
  '#34c759',
  '#00c7be',
  '#007aff',
  '#5856d6',
  '#af52de',
  '#ff2d55',
  '#a2845e',
]

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function teamColor(team: Pick<Team, 'id'>): string {
  return TEAM_COLORS[hashString(team.id) % TEAM_COLORS.length]!
}

/** One or two letters for a team's mark: "Otterware Local" → "OL". */
export function teamInitials(team: Pick<Team, 'name'>): string {
  const words = team.name.trim().split(/\s+/).filter(Boolean)
  const letters =
    words.length > 1
      ? `${words[0]![0]}${words[1]![0]}`
      : (words[0]?.slice(0, 1) ?? '?')
  return letters.toUpperCase()
}
