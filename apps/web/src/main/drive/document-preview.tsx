import { lazy, Suspense, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileWarningIcon, PencilIcon } from 'lucide-react'
import type { NativeDocumentKind } from '#/lib/document-kind'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ContentLoading } from './content-loading'
import { MarkdownPreview } from './markdown-preview'
import { useDocumentContent } from './use-document-content'
import { useContentSession } from './use-content-session'

const UniverEditor = lazy(
  import.meta.env.SSR
    ? async () => ({ default: ContentLoading })
    : () =>
        import('./univer-editor').then((module) => ({
          default: module.UniverEditor,
        })),
)

interface DocumentPreviewProps {
  actionsContainer?: HTMLDivElement | null | undefined
  kind: NativeDocumentKind
  entryPath: string
  expectedCurrentVersion?: number | undefined
  onSheetChange?: ((sheet: string | undefined) => void) | undefined
  organizationId: string
  organizationSlug: string
  selectedSheet?: string | undefined
  slug: string
  version: number
}

export function DocumentPreview(props: DocumentPreviewProps) {
  return (
    <DocumentPreviewContent
      key={`${props.organizationId}:${props.slug}:${props.version}:${props.entryPath}`}
      {...props}
    />
  )
}

function DocumentPreviewContent(props: DocumentPreviewProps) {
  const [editing, setEditing] = useState(false)
  const content = useDocumentContent(props)
  const markdownPreview = props.kind === 'markdown' && !editing
  const session = useContentSession({ ...props, enabled: markdownPreview })
  const error = content.error ?? (markdownPreview ? session.error : null)
  if (error)
    return (
      <EmptyState
        className="h-full"
        icon={FileWarningIcon}
        title="Couldn’t open this document"
        description={error.message}
      />
    )
  if (
    !content.data ||
    (markdownPreview && (session.isPending || session.isFetching))
  )
    return <ContentLoading />

  if (content.data.kind === 'text' && !editing) {
    const actions = (
      <Button size="sm" onClick={() => setEditing(true)}>
        <PencilIcon />
        Edit
      </Button>
    )
    return (
      <>
        {props.actionsContainer ? (
          createPortal(actions, props.actionsContainer)
        ) : (
          <div className="flex justify-end border-b px-4 py-2">{actions}</div>
        )}
        <div className="min-h-0 flex-1 overflow-auto bg-canvas">
          {props.kind === 'markdown' ? (
            <MarkdownPreview
              entryPath={props.entryPath}
              resourceBaseUrl={session.data}
              text={content.data.text}
            />
          ) : (
            <pre
              data-selectable
              className="m-0 p-6 font-mono text-sm leading-6 break-words whitespace-pre-wrap sm:p-10"
            >
              {content.data.text}
            </pre>
          )}
        </div>
      </>
    )
  }

  return (
    <Suspense fallback={<ContentLoading />}>
      <UniverEditor
        actionsContainer={props.actionsContainer}
        entryPath={props.entryPath}
        expectedCurrentVersion={props.expectedCurrentVersion ?? props.version}
        version={props.version}
        organizationId={props.organizationId}
        organizationSlug={props.organizationSlug}
        slug={props.slug}
        {...(content.data.kind === 'text'
          ? {
              kind: 'document',
              documentFormat: props.kind === 'markdown' ? 'markdown' : 'text',
              text: content.data.text,
              onPreview: () => setEditing(false),
            }
          : {
              kind: 'spreadsheet',
              sheets: content.data.sheets,
              onSheetChange: props.onSheetChange,
              selectedSheet: props.selectedSheet,
            })}
      />
    </Suspense>
  )
}
