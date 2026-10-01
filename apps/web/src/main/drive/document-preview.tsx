import { lazy, Suspense, useEffect, useState } from 'react'
import Papa from 'papaparse'
import type { UniverSheet } from './univer-editor'
import { FileWarningIcon } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ContentLoading } from './content-loading'

const UniverEditor = lazy(
  import.meta.env.SSR
    ? async () => ({
        default: ContentLoading,
      })
    : () =>
        import('./univer-editor').then((module) => ({
          default: module.UniverEditor,
        })),
)

type GridValue = unknown

export function columnName(index: number): string {
  let value = index + 1
  let output = ''
  while (value > 0) {
    value -= 1
    output = String.fromCharCode(65 + (value % 26)) + output
    value = Math.floor(value / 26)
  }
  return output
}

interface DocumentPreviewProps {
  actionsContainer?: HTMLDivElement | null | undefined
  contentType: string
  entryPath: string
  expectedCurrentVersion?: number | undefined
  onSheetChange?: ((sheet: string | undefined) => void) | undefined
  organizationId: string
  organizationSlug: string
  selectedSheet?: string | undefined
  slug: string
  version: number
}

function contentUrl(slug: string, version: number, path?: string): string {
  const query = new URLSearchParams({ version: String(version) })
  if (path) query.set('path', path)
  return `/api/v1/artifacts/${encodeURIComponent(slug)}/content?${query}`
}

async function loadContent(
  organizationId: string,
  slug: string,
  version: number,
  as: 'text' | 'arrayBuffer',
): Promise<string | ArrayBuffer> {
  const response = await fetch(contentUrl(slug, version), {
    headers: {
      accept: '*/*',
      'x-otterdrive-organization': organizationId,
    },
  })
  if (!response.ok)
    throw new Error(`Could not load document (${response.status}).`)
  return as === 'text' ? response.text() : response.arrayBuffer()
}

export function DocumentPreview({
  actionsContainer,
  contentType,
  entryPath,
  expectedCurrentVersion,
  onSheetChange,
  organizationId,
  organizationSlug,
  selectedSheet: selectedSheetName,
  slug,
  version,
}: DocumentPreviewProps) {
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [sheets, setSheets] = useState<UniverSheet[]>([])
  const [error, setError] = useState<string | null>(null)
  const normalizedType = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  const extension = entryPath.split('.').pop()?.toLowerCase()
  const markdownDocument =
    normalizedType === 'text/markdown' ||
    normalizedType === 'text/plain' ||
    extension === 'md' ||
    extension === 'markdown' ||
    extension === 'txt'
  const csvDocument =
    normalizedType === 'text/csv' || extension === 'csv' || extension === 'tsv'
  const workbook =
    normalizedType ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    extension === 'xlsx'

  useEffect(() => {
    let active = true
    setMarkdown(null)
    setSheets([])
    setError(null)
    if (!import.meta.env.SSR) void import('./univer-editor')

    if (markdownDocument || csvDocument) {
      loadContent(organizationId, slug, version, 'text')
        .then((value) => {
          if (!active) return
          const text = value as string
          if (markdownDocument) {
            setMarkdown(text)
            return
          }
          const parsed = Papa.parse<string[]>(text, {
            delimiter: extension === 'tsv' ? '\t' : '',
            skipEmptyLines: false,
          })
          if (parsed.errors.length && !parsed.data.length) {
            throw new Error(
              parsed.errors[0]?.message ?? 'Could not parse spreadsheet.',
            )
          }
          setSheets([{ sheet: entryPath, data: parsed.data }])
        })
        .catch((reason: unknown) => {
          if (active)
            setError(reason instanceof Error ? reason.message : String(reason))
        })
    } else if (workbook) {
      loadContent(organizationId, slug, version, 'arrayBuffer')
        .then(async (value) => {
          if (!active) return
          const XLSX = await import('@e965/xlsx')
          const parsed = XLSX.read(value as ArrayBuffer, {
            type: 'array',
            cellDates: true,
          })
          setSheets(
            parsed.SheetNames.map((sheet) => ({
              sheet,
              data: XLSX.utils.sheet_to_json<GridValue[]>(
                parsed.Sheets[sheet]!,
                { header: 1, defval: null, raw: false },
              ),
            })),
          )
        })
        .catch((reason: unknown) => {
          if (active)
            setError(reason instanceof Error ? reason.message : String(reason))
        })
    }

    return () => {
      active = false
    }
  }, [
    csvDocument,
    entryPath,
    extension,
    markdownDocument,
    organizationId,
    slug,
    version,
    workbook,
  ])

  if (error)
    return (
      <EmptyState
        className="h-full"
        icon={FileWarningIcon}
        title="Couldn’t open this document"
        description={error}
      />
    )
  if (markdownDocument && markdown !== null) {
    return (
      <Suspense fallback={<ContentLoading />}>
        <UniverEditor
          actionsContainer={actionsContainer}
          entryPath={entryPath}
          expectedCurrentVersion={expectedCurrentVersion ?? version}
          kind="document"
          organizationId={organizationId}
          organizationSlug={organizationSlug}
          slug={slug}
          text={markdown}
        />
      </Suspense>
    )
  }
  if ((csvDocument || workbook) && sheets.length) {
    return (
      <Suspense fallback={<ContentLoading />}>
        <UniverEditor
          actionsContainer={actionsContainer}
          entryPath={entryPath}
          expectedCurrentVersion={expectedCurrentVersion ?? version}
          kind="spreadsheet"
          organizationId={organizationId}
          organizationSlug={organizationSlug}
          onSheetChange={onSheetChange}
          selectedSheet={selectedSheetName}
          sheets={sheets}
          slug={slug}
        />
      </Suspense>
    )
  }
  return <ContentLoading />
}
