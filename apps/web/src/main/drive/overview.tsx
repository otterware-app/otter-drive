import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { FilesIcon, UploadIcon, UsersIcon } from 'lucide-react'
import type { Artifact } from '@otterware/contracts'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { shortcutLabel } from '../keybindings/commands'
import type { Team } from '../teams'
import { DocumentThumb } from './document-list'
import { KIND_META, WEEK_MS, documentKind, formatRelative } from './documents'
import { NewTeamDialog } from './new-team-dialog'
import { useCanCreateTeams } from './team-rail'
import { TeamMark } from './team-mark'
import { requestUpload } from './upload-dialog'

/**
 * The main pane with no document open (Otter Mail's "Select a conversation",
 * made useful): the team at a glance, and its latest documents to pick up
 * where you left off.
 */
export function Overview({
  team,
  documents,
  loading,
  noTeam,
}: {
  team: Team | null
  documents: Artifact[]
  loading: boolean
  noTeam: boolean
}) {
  if (noTeam) return <NoTeam />
  if (loading || !team) return null
  const active = documents.filter((artifact) => !artifact.archivedAt)
  if (active.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={FilesIcon}
          title={`${team.name} has no documents yet`}
          description="Drop files or folders anywhere in the window, or upload them. Agents can publish here too, with the otterdrive CLI."
          actions={
            <Button variant="accent" onClick={requestUpload}>
              <UploadIcon /> Upload
            </Button>
          }
        />
      </div>
    )
  }
  return <TeamOverview team={team} documents={active} />
}

function TeamOverview({
  team,
  documents,
}: {
  team: Team
  documents: Artifact[]
}) {
  const stats = useMemo(() => {
    const week = Date.now() - WEEK_MS
    return {
      versions: documents.reduce((sum, item) => sum + item.versionCount, 0),
      thisWeek: documents.filter(
        (item) => new Date(item.updatedAt).getTime() >= week,
      ).length,
    }
  }, [documents])
  const recent = useMemo(
    () =>
      [...documents]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 6),
    [documents],
  )

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[47rem] space-y-10 px-6 pt-14 pb-20">
        <header className="flex items-center gap-4 px-[17px]">
          <TeamMark team={team} className="size-11 rounded-xl text-base" />
          <div className="min-w-0">
            <h1 className="truncate text-[26px] leading-8 font-medium tracking-[-0.01em] text-foreground">
              {team.name}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Last change {formatRelative(recent[0]!.updatedAt)}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Documents" value={documents.length} />
          <Stat label="Versions" value={stats.versions} />
          <Stat label="Updated this week" value={stats.thisWeek} />
        </div>

        <section>
          <h2 className="mb-3 px-[17px] text-sm font-medium text-foreground">
            Recently updated
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {recent.map((artifact) => (
              <RecentCard key={artifact.id} artifact={artifact} team={team} />
            ))}
          </div>
        </section>

        <p className="px-[17px] text-center text-[13px] text-muted-foreground">
          Drop files anywhere to upload them, or press{' '}
          <kbd className="font-sans text-foreground">
            {shortcutLabel('document.upload')}
          </kbd>
          . Press{' '}
          <kbd className="font-sans text-foreground">
            {shortcutLabel('commandPalette.toggle')}
          </kbd>{' '}
          to find anything.
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-4 py-3.5">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl leading-8 font-normal tracking-[-0.01em] text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function RecentCard({ artifact, team }: { artifact: Artifact; team: Team }) {
  const kind = KIND_META[documentKind(artifact)].one
  return (
    <Link
      to="/$organizationSlug/a/$slug"
      params={{ organizationSlug: team.slug, slug: artifact.slug }}
      search={(current) => ({ ...current, sheet: undefined })}
      className="group flex flex-col gap-1.5 rounded-xl border border-border/60 bg-card p-1.5 pb-2.5 outline-none transition-colors hover:border-input focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <DocumentThumb
        artifact={artifact}
        className="aspect-[16/10] w-full rounded-lg [&_svg]:size-6"
      />
      <div className="min-w-0 px-2">
        <div className="truncate text-sm text-foreground">{artifact.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {kind} · {formatRelative(artifact.updatedAt)}
        </div>
      </div>
    </Link>
  )
}

function NoTeam() {
  const canCreate = useCanCreateTeams()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={UsersIcon}
        title="You’re not in a team yet"
        description={
          canCreate
            ? 'Documents live in teams. Create one to start.'
            : 'Documents live in teams. Ask an administrator to invite you to one.'
        }
        actions={
          canCreate ? (
            <Button variant="accent" onClick={() => setOpen(true)}>
              New team
            </Button>
          ) : null
        }
      />
      <NewTeamDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}
