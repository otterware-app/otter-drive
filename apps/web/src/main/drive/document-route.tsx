import { useNavigate } from '@tanstack/react-router'
import { ChevronLeftIcon, LockIcon } from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useDrive } from '../home-view'
import { TitleBand } from '../top-bar'
import { ContentLoading } from './content-loading'
import { DocumentViewer, type DocumentLocation } from './document-viewer'

/**
 * A document's route in the window: the viewer, scoped to the folder its URL
 * names (not the open one). A document shared with you on its own lives in a
 * folder you can't open: it's found among what's shared with you and opened
 * by its id. Anything else asks for access.
 */
export function DocumentRoute({
  folderSlug,
  slug,
  version,
  sheet,
}: {
  folderSlug: string
  slug: string
  version?: number | undefined
  sheet?: string | undefined
}) {
  const {
    folders,
    foldersLoaded,
    sharedItems,
    sharedLoading,
    narrow,
    expanded,
    toggleExpanded,
    mainIsLeftmost,
  } = useDrive()
  const navigate = useNavigate()
  const folder = folders.find((item) => item.slug === folderSlug)
  const shared = folder
    ? undefined
    : sharedItems.find(
        (item) =>
          item.artifact &&
          item.folderSlug === folderSlug &&
          (item.artifact.slug === slug || item.artifact.id === slug),
      )?.artifact
  const location: DocumentLocation | null = folder
    ? { folderId: folder.id, folderSlug, reference: slug }
    : shared
      ? { folderId: undefined, folderSlug, reference: shared.id }
      : null

  if (!location) {
    return (
      <>
        <TitleBand />
        {foldersLoaded && !sharedLoading ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={LockIcon}
              title="You need access"
              description="This document hasn’t been shared with you. Ask its owner to share it, or open the link they sent you."
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
      key={`${location.folderId ?? 'shared'}:${location.reference}:${version ?? 'current'}`}
      location={location}
      slug={shared?.slug ?? slug}
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
