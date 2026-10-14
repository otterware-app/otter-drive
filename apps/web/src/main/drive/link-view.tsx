import { lazy, Suspense, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  EyeIcon,
  FileWarningIcon,
  FolderIcon,
  FolderOpenIcon,
  LinkIcon,
} from 'lucide-react'
import {
  linkPreviewResponseSchema,
  sharedLinkResponseSchema,
  type LinkDocument,
  type LinkFolder,
} from '@otterware/contracts'
import { api } from '#/lib/api'
import { documentKind } from '#/lib/document-kind'
import { Button, IconButton } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { HintTooltip } from '@/components/ui/tooltip'
import { ThemeToggle } from '../auth/auth-shell'
import { TitleBand, Wordmark } from '../top-bar'
import { ContentLoading } from './content-loading'
import { VideoPlayer } from './document-viewer'
import { entryKind, formatRelative, KIND_META } from './documents'

const DocumentPreview = lazy(() =>
  import('./document-preview').then((module) => ({
    default: module.DocumentPreview,
  })),
)

/**
 * A link opened without signing in: anyone with it views the document, or
 * browses the folder, read-only. Signing in adds it to Shared with me
 * instead, where a link's editors edit.
 */
export function LinkView({
  token,
  folder,
  doc,
}: {
  token: string
  /** A folder inside a folder link; the shared folder when undefined. */
  folder: string | undefined
  /** A document opened from a folder link. */
  doc: string | undefined
}) {
  const navigate = useNavigate()
  // The reader's own actions go in the title band, as in the signed-in viewer.
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  const link = useQuery({
    queryKey: ['shared-link', token, folder ?? 'top'],
    queryFn: async ({ signal }) =>
      sharedLinkResponseSchema.parse(
        await api<unknown>(
          `/api/v1/links/${encodeURIComponent(token)}${folder ? `?folder=${encodeURIComponent(folder)}` : ''}`,
          { signal },
        ),
      ).data,
    enabled: !import.meta.env.SSR,
    retry: false,
  })
  const documentId = link.data?.document?.id ?? doc
  const preview = useQuery({
    queryKey: ['link-preview', token, documentId],
    queryFn: async ({ signal }) =>
      linkPreviewResponseSchema.parse(
        await api<unknown>(
          `/api/v1/links/${encodeURIComponent(token)}/documents/${encodeURIComponent(documentId!)}`,
          { signal },
        ),
      ).data,
    enabled: Boolean(documentId) && !import.meta.env.SSR,
    staleTime: 4 * 60_000,
    retry: false,
  })

  const open = (search: { folder?: string; doc?: string }) =>
    void navigate({ to: '/s/$token', params: { token }, search })
  const signIn = () =>
    location.assign(`/login?callback=${encodeURIComponent(`/s/${token}`)}`)

  const shown = link.data?.folder ?? null
  const path = shown?.path ?? []
  // Back: from a document to its folder, from a folder to the one above.
  const back =
    doc && link.data?.type === 'folder'
      ? () => open(folder ? { folder } : {})
      : !doc && path.length > 1
        ? () => open(path.length > 2 ? { folder: path.at(-2)!.id } : {})
        : null
  const document = documentId ? (preview.data?.document ?? null) : null
  const title = documentId ? document?.title : shown?.name
  const error = link.error ?? (documentId ? preview.error : null)

  return (
    <div className="surface-grain flex h-dvh flex-col bg-sidebar-surface text-foreground">
      <div className="flex h-(--workspace-topbar-height) shrink-0 items-center gap-2 px-4">
        <a href="/" className="min-w-0 rounded-md outline-none">
          <Wordmark />
        </a>
        <span className="flex-1" />
        <ThemeToggle />
        <Button size="sm" variant="accent" className="px-3" onClick={signIn}>
          Sign in
        </Button>
      </div>
      <div className="mx-1 mb-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-(--panel-edge) bg-canvas">
        <TitleBand className="gap-1.5 border-b">
          {back ? (
            <IconButton label="Back" className="-ms-2" onClick={back}>
              <ChevronLeftIcon className="size-4" />
            </IconButton>
          ) : null}
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {title ? (
              <h1 className="min-w-0 truncate text-sm font-medium text-foreground">
                {title}
              </h1>
            ) : error ? null : (
              <span className="h-3.5 w-40 animate-skeleton rounded-full bg-accent-surface" />
            )}
            {title ? (
              <span className="flex shrink-0 items-center gap-1 rounded-md bg-accent-surface px-1.5 py-0.5 text-2xs text-muted-foreground">
                <EyeIcon className="size-3" />
                View only
              </span>
            ) : null}
          </div>
          <div ref={setActions} className="flex items-center empty:hidden" />
          {document ? (
            <HintTooltip label="Download" side="bottom">
              <IconButton
                label={`Download ${document.title}`}
                onClick={() =>
                  location.assign(
                    `/api/v1/links/${encodeURIComponent(token)}/documents/${encodeURIComponent(document.id)}/download`,
                  )
                }
              >
                <DownloadIcon className="size-4" />
              </IconButton>
            </HintTooltip>
          ) : null}
        </TitleBand>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {error ? (
            <EmptyState
              className="h-full"
              icon={error === link.error ? LinkIcon : FileWarningIcon}
              title={
                error === link.error
                  ? 'This link doesn’t work'
                  : 'Couldn’t open this document'
              }
              description={error.message}
              actions={
                <Button size="sm" onClick={signIn}>
                  Sign in
                </Button>
              }
            />
          ) : documentId ? (
            preview.data ? (
              <LinkDocumentView
                token={token}
                preview={preview.data}
                actionsContainer={actions}
              />
            ) : (
              <ContentLoading />
            )
          ) : shown ? (
            <FolderContents
              path={path}
              folders={shown.folders}
              documents={shown.documents}
              onFolder={(id) => open(id === path[0]?.id ? {} : { folder: id })}
              onDocument={(id) =>
                open({ ...(folder ? { folder } : {}), doc: id })
              }
            />
          ) : (
            <ContentLoading />
          )}
        </div>
      </div>
    </div>
  )
}

function LinkDocumentView({
  token,
  preview,
  actionsContainer,
}: {
  token: string
  actionsContainer: HTMLDivElement | null
  preview: {
    document: LinkDocument
    url: string
    contentType: string
  }
}) {
  const { document } = preview
  const kind = documentKind(preview.contentType, document.version.entryPath)
  const label = `${document.title}, version ${document.version.number}`
  if (kind === 'video')
    return <VideoPlayer key={document.id} src={preview.url} title={label} />
  if (kind === 'frame')
    return (
      <iframe
        key={`${document.id}:${preview.url}`}
        className="size-full border-0 bg-white [color-scheme:light]"
        src={preview.url}
        title={label}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
        referrerPolicy="no-referrer"
      />
    )
  return (
    <Suspense fallback={<ContentLoading />}>
      <DocumentPreview
        readOnly
        actionsContainer={actionsContainer}
        linkToken={token}
        kind={kind}
        entryPath={document.version.entryPath}
        folderId={undefined}
        folderSlug=""
        slug={document.id}
        reference={document.id}
        version={document.version.number}
      />
    </Suspense>
  )
}

/** A shared folder's folders and documents, with the way down to it. */
function FolderContents({
  path,
  folders,
  documents,
  onFolder,
  onDocument,
}: {
  path: LinkFolder[]
  folders: LinkFolder[]
  documents: LinkDocument[]
  onFolder: (id: string) => void
  onDocument: (id: string) => void
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {path.length > 1 ? (
        <nav
          aria-label="Folders"
          className="mx-auto flex max-w-4xl min-w-0 items-center gap-0.5 px-6 pt-4 text-[13px] text-muted-foreground"
        >
          {path.map((item, index) => (
            <span key={item.id} className="flex min-w-0 items-center gap-0.5">
              {index ? (
                <ChevronRightIcon className="size-3.5 shrink-0" />
              ) : null}
              {index === path.length - 1 ? (
                <span className="truncate text-foreground">{item.name}</span>
              ) : (
                <button
                  type="button"
                  className="truncate rounded-md px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
                  onClick={() => onFolder(item.id)}
                >
                  {item.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      {!folders.length && !documents.length ? (
        <EmptyState
          className="h-full"
          icon={FolderOpenIcon}
          title="This folder is empty"
        />
      ) : (
        <div role="list" className="mx-auto max-w-4xl px-3 py-3">
          {folders.map((item) => (
            <Row
              key={item.id}
              icon={FolderIcon}
              name={item.name}
              detail="Folder"
              onOpen={() => onFolder(item.id)}
            />
          ))}
          {documents.map((item) => {
            const meta = KIND_META[entryKind(item.version.entryPath)]
            return (
              <Row
                key={item.id}
                icon={meta.icon}
                name={item.title}
                detail={`${meta.one} · ${formatRelative(item.updatedAt)}`}
                onOpen={() => onDocument(item.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function Row({
  icon: Icon,
  name,
  detail,
  onOpen,
}: {
  icon: typeof FolderIcon
  name: string
  detail: string
  onOpen: () => void
}) {
  return (
    <div role="listitem" className="px-1 py-px">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-surface/70 text-icon-muted"
        >
          <Icon className="size-4.5" strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm leading-snug font-medium text-foreground">
            {name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {detail}
          </span>
        </span>
      </button>
    </div>
  )
}
