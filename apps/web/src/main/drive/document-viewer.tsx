import { lazy, Suspense, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDownIcon,
  DownloadIcon,
  EllipsisIcon,
  FileWarningIcon,
  LinkIcon,
  Maximize2Icon,
  Minimize2Icon,
} from 'lucide-react'
import { documentKind } from '#/lib/document-kind'
import { artifactBootstrapQuery } from '#/lib/artifact-query'
import { IconButton } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { HintTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { TitleBand } from '../top-bar'
import type { Folder } from '../folders'
import { ContentLoading } from './content-loading'
import { DocumentMenuItems, copyLink, downloadDocument } from './document-menu'
import { formatRelative } from './documents'

const DocumentPreview = lazy(() =>
  import('./document-preview').then((module) => ({
    default: module.DocumentPreview,
  })),
)

/**
 * The main pane with a document open (Otter Mail's reader): its title band
 * holds the title, the version picker and the everyday actions; the
 * document fills the rest.
 */
export function DocumentViewer({
  folder,
  slug,
  version,
  sheet,
  onSheetChange,
  headerLeading,
  expanded,
  onToggleExpanded,
  roundedLeft,
}: {
  folder: Folder
  slug: string
  version?: number | undefined
  sheet?: string | undefined
  onSheetChange: (sheet: string | undefined) => void
  headerLeading?: ReactNode
  /** The sidebar and list are hidden, giving the document the window. */
  expanded: boolean
  /** Absent on a phone, where the document always has the window. */
  onToggleExpanded?: (() => void) | undefined
  /** Nothing to the viewer's left: its bottom-left corner follows the panel's. */
  roundedLeft: boolean
}) {
  const navigate = useNavigate()
  const [editorActions, setEditorActions] = useState<HTMLDivElement | null>(
    null,
  )
  const bootstrap = useQuery(artifactBootstrapQuery(folder.id, slug, version))
  const artifact = bootstrap.data?.artifact ?? null
  const versions = bootstrap.data?.versions ?? []
  const preview = bootstrap.data?.preview ?? null
  const selected =
    versions.find((item) => item.number === version) ??
    versions.find((item) => item.id === artifact?.currentVersion?.id) ??
    artifact?.currentVersion ??
    null
  const error =
    bootstrap.error instanceof Error ? bootstrap.error.message : null
  const latest = artifact?.currentVersion?.number ?? 1
  const kind =
    preview && selected
      ? documentKind(preview.contentType, selected.entryPath)
      : 'frame'

  const openVersion = (number: number) =>
    void navigate(
      number === latest
        ? {
            to: '/$folderSlug/a/$slug',
            params: { folderSlug: folder.slug, slug },
            search: (current) => ({ ...current, sheet }),
          }
        : {
            to: '/$folderSlug/a/$slug/$version',
            params: {
              folderSlug: folder.slug,
              slug,
              version: `v${number}`,
            },
            search: (current) => ({ ...current, sheet }),
          },
    )

  return (
    <div className="flex h-full min-w-0 flex-col">
      <TitleBand className="gap-1.5">
        {headerLeading}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {artifact ? (
            <>
              <h1 className="min-w-0 truncate text-sm font-medium text-foreground">
                {artifact.title}
              </h1>
              {selected ? (
                <DropdownMenu>
                  <HintTooltip label="Versions" side="bottom">
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          aria-label={`Version ${selected.number}, pick another`}
                          className="flex h-6 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-xs text-muted-foreground tabular-nums outline-none hover:bg-accent-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring data-popup-open:bg-accent-surface"
                        />
                      }
                    >
                      v{selected.number}
                      {selected.number !== latest ? ' (old)' : ''}
                      <ChevronDownIcon className="size-3.5" />
                    </DropdownMenuTrigger>
                  </HintTooltip>
                  <DropdownMenuContent className="w-80">
                    <DropdownMenuLabel>
                      {versions.length}{' '}
                      {versions.length === 1 ? 'version' : 'versions'}
                    </DropdownMenuLabel>
                    {versions.map((item) => (
                      <DropdownMenuCheckItem
                        key={item.id}
                        checked={item.number === selected.number}
                        className="h-auto py-1.5"
                        onClick={() => openVersion(item.number)}
                      >
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="w-7 shrink-0 text-muted-foreground tabular-nums">
                            v{item.number}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">
                              {item.label || 'Untitled version'}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {formatRelative(item.createdAt)}
                              {item.createdBy
                                ? ` · ${item.createdBy.name}`
                                : ''}
                            </span>
                          </span>
                        </span>
                      </DropdownMenuCheckItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {artifact.archivedAt ? (
                <span className="shrink-0 rounded-md bg-warning-surface px-1.5 py-0.5 text-2xs text-warning-foreground">
                  Archived
                </span>
              ) : null}
            </>
          ) : (
            <span className="h-3.5 w-40 animate-skeleton rounded-full bg-accent-surface" />
          )}
        </div>

        <div
          ref={setEditorActions}
          className="flex items-center empty:hidden"
        />
        {artifact ? (
          <>
            <HintTooltip label="Copy link" side="bottom">
              <IconButton
                label="Copy link"
                onClick={() => void copyLink(artifact)}
              >
                <LinkIcon className="size-4" />
              </IconButton>
            </HintTooltip>
            <HintTooltip label="Download" side="bottom">
              <IconButton
                label={`Download ${artifact.title}`}
                onClick={() =>
                  void downloadDocument(artifact, folder.id, selected?.number)
                }
              >
                <DownloadIcon className="size-4" />
              </IconButton>
            </HintTooltip>
            <DropdownMenu>
              <HintTooltip label="More" side="bottom">
                <DropdownMenuTrigger
                  render={<IconButton label="Document actions" />}
                >
                  <EllipsisIcon className="size-4" />
                </DropdownMenuTrigger>
              </HintTooltip>
              <DropdownMenuContent align="end" className="min-w-56">
                <DocumentMenuItems
                  artifact={artifact}
                  folder={folder}
                  {...(selected ? { version: selected.number } : {})}
                  onMoved={(moved, destination) =>
                    void navigate({
                      to: '/$folderSlug/a/$slug',
                      params: {
                        folderSlug: destination.slug,
                        slug: moved.slug,
                      },
                    })
                  }
                  onDeleted={() =>
                    void navigate({
                      to: '/home',
                      search: (current) => ({ ...current, sheet: undefined }),
                    })
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
        {onToggleExpanded ? (
          <>
            <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
            <HintTooltip
              label={expanded ? 'Show the list' : 'Full width'}
              side="bottom"
            >
              <IconButton
                label={expanded ? 'Show the list' : 'Full width'}
                aria-pressed={expanded}
                onClick={onToggleExpanded}
              >
                {expanded ? (
                  <Minimize2Icon className="size-4" />
                ) : (
                  <Maximize2Icon className="size-4" />
                )}
              </IconButton>
            </HintTooltip>
          </>
        ) : null}
      </TitleBand>

      {/* The document, inside the panel's 1px edge and clipped to its
          rounded corners: the right ones, and the left ones with nothing to
          its left. */}
      <div
        className={cn(
          'flex min-h-0 flex-1 pt-px pr-px pb-px',
          roundedLeft && 'pl-px',
        )}
      >
        <div
          className={cn(
            'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-r-[calc(var(--radius-xl)-1px)]',
            roundedLeft && 'rounded-l-[calc(var(--radius-xl)-1px)]',
          )}
        >
          {error ? (
            <EmptyState
              className="h-full"
              icon={FileWarningIcon}
              title="Couldn’t open this document"
              description={error}
            />
          ) : !artifact || !selected || !preview ? (
            <ContentLoading />
          ) : kind !== 'frame' && kind !== 'video' ? (
            <Suspense fallback={<ContentLoading />}>
              <DocumentPreview
                readOnly={folder.role === 'viewer'}
                actionsContainer={editorActions}
                kind={kind}
                entryPath={selected.entryPath}
                expectedCurrentVersion={artifact.versionCount}
                onSheetChange={onSheetChange}
                folderId={folder.id}
                folderSlug={folder.slug}
                selectedSheet={sheet}
                slug={slug}
                version={selected.number}
              />
            </Suspense>
          ) : kind === 'video' ? (
            <VideoPlayer
              key={`${slug}:${selected.number}`}
              src={preview.url}
              title={`${artifact.title}, version ${selected.number}`}
            />
          ) : (
            <iframe
              key={`${slug}:${selected.number}:${preview.url}`}
              className="size-full border-0 bg-white [color-scheme:light]"
              src={preview.url}
              title={`${artifact.title}, version ${selected.number}`}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * A video document. The preview URL starts a content session and redirects to
 * the file, so it's kept from the first render: a refetched bootstrap brings
 * a new URL, which would restart the video.
 */
function VideoPlayer({ src, title }: { src: string; title: string }) {
  const [source] = useState(src)
  return (
    <div className="flex size-full items-center justify-center bg-black">
      <video
        className="size-full object-contain"
        src={source}
        aria-label={title}
        controls
        playsInline
        preload="metadata"
      />
    </div>
  )
}
