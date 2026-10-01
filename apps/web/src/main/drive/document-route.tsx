import { useNavigate } from '@tanstack/react-router'
import { ChevronLeftIcon, LockIcon } from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useDrive } from '../home-view'
import { TitleBand } from '../top-bar'
import { ContentLoading } from './content-loading'
import { DocumentViewer } from './document-viewer'

/**
 * A document's route in the window: the viewer, scoped to the team its URL
 * names (not the active one), or why it can't show.
 */
export function DocumentRoute({
  teamSlug,
  slug,
  version,
  sheet,
}: {
  teamSlug: string
  slug: string
  version?: number | undefined
  sheet?: string | undefined
}) {
  const {
    teams,
    unknownTeamSlug,
    narrow,
    expanded,
    toggleExpanded,
    mainIsLeftmost,
  } = useDrive()
  const navigate = useNavigate()
  const team = teams.find((item) => item.slug === teamSlug)

  if (!team) {
    return (
      <>
        <TitleBand />
        {unknownTeamSlug ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={LockIcon}
              title="Not one of your teams"
              description={`You don’t have access to the “${unknownTeamSlug}” team. Ask one of its admins to invite you.`}
            />
          </div>
        ) : (
          <ContentLoading />
        )}
      </>
    )
  }

  return (
    <DocumentViewer
      key={`${team.id}:${slug}:${version ?? 'current'}`}
      team={team}
      slug={slug}
      version={version}
      sheet={sheet}
      onSheetChange={(next) =>
        void navigate({
          to: '.',
          search: (current) => ({ ...current, sheet: next }),
          replace: true,
        })
      }
      headerLeading={
        narrow ? (
          <IconButton
            label="Back to documents"
            className="-ms-2"
            onClick={() =>
              void navigate({
                to: '/home',
                search: (current) => ({ ...current, sheet: undefined }),
              })
            }
          >
            <ChevronLeftIcon className="size-4" />
          </IconButton>
        ) : null
      }
      expanded={expanded}
      onToggleExpanded={narrow ? undefined : toggleExpanded}
      roundedLeft={mainIsLeftmost}
    />
  )
}
