import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { defaultTheme, LocaleType } from '@univerjs/presets'
import type {
  ICellData,
  IDocumentData,
  IWorkbookData,
  IWorksheetData,
} from '@univerjs/presets'
import { api } from '#/lib/api'
import { removeSessionCachePrefix } from '#/lib/session-cache'
import { Button } from '@/components/ui/button'
import { changesSnapshot } from './univer-change-tracking'

import '@univerjs/preset-sheets-core/lib/index.css'
import '@univerjs/preset-docs-core/lib/index.css'

type GridValue = unknown

export interface UniverSheet {
  sheet: string
  data: GridValue[][]
}

interface EditorProps {
  actionsContainer?: HTMLDivElement | null | undefined
  entryPath: string
  expectedCurrentVersion: number
  kind: 'document' | 'spreadsheet'
  organizationId: string
  organizationSlug: string
  onSheetChange?: ((sheet: string | undefined) => void) | undefined
  selectedSheet?: string | undefined
  sheets?: UniverSheet[] | undefined
  slug: string
  text?: string | undefined
}

interface UniverHandle {
  dispose: () => void
  exportFile: () => Promise<Blob>
}

function cellData(rows: GridValue[][]): IWorksheetData['cellData'] {
  const output: Record<number, Record<number, ICellData>> = {}
  rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (value == null || value === '') return
      const normalized =
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
          ? value
          : String(value)
      ;(output[rowIndex] ??= {})[columnIndex] = { v: normalized }
    })
  })
  return output
}

export function workbookData(
  entryPath: string,
  sheets: UniverSheet[],
): Partial<IWorkbookData> {
  const sheetOrder = sheets.map((_, index) => `sheet-${index}`)
  return {
    id: `otterdrive-${crypto.randomUUID()}`,
    appVersion: '3.0.0',
    locale: LocaleType.EN_US,
    name: entryPath,
    sheetOrder,
    styles: {},
    sheets: Object.fromEntries(
      sheets.map((sheet, index) => {
        const columnCount = Math.max(
          26,
          sheet.data.reduce((maximum, row) => Math.max(maximum, row.length), 0),
        )
        return [
          sheetOrder[index],
          {
            id: sheetOrder[index],
            name: sheet.sheet,
            rowCount: Math.max(100, sheet.data.length),
            columnCount,
            cellData: cellData(sheet.data),
          },
        ]
      }),
    ),
  }
}

function documentData(entryPath: string, text: string): Partial<IDocumentData> {
  const dataStream = `${text.replaceAll('\r\n', '\n').replaceAll('\n', '\r')}\r\n`
  return {
    id: `otterdrive-${crypto.randomUUID()}`,
    title: entryPath,
    body: { dataStream },
    documentStyle: {
      pageSize: { width: 816, height: 1056 },
      marginTop: 72,
      marginBottom: 72,
      marginLeft: 72,
      marginRight: 72,
    },
  }
}

function plainDocument(snapshot: IDocumentData): string {
  return (snapshot.body?.dataStream ?? '')
    .replaceAll('\r\n', '')
    .replaceAll('\r', '\n')
    .replaceAll('\0', '')
}

async function spreadsheetBlob(
  snapshot: IWorkbookData,
  entryPath: string,
): Promise<Blob> {
  const XLSX = await import('@e965/xlsx')
  const workbook = XLSX.utils.book_new()
  for (const sheetId of snapshot.sheetOrder) {
    const sheet = snapshot.sheets[sheetId]
    if (!sheet) continue
    const rows: GridValue[][] = []
    const data = sheet.cellData as
      Record<number, Record<number, ICellData>> | undefined
    for (const [rowIndex, columns] of Object.entries(data ?? {})) {
      const row = (rows[Number(rowIndex)] ??= [])
      for (const [columnIndex, cell] of Object.entries(columns)) {
        row[Number(columnIndex)] = cell?.v ?? cell?.f ?? ''
      }
    }
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      sheet.name,
    )
  }
  const extension = entryPath.split('.').pop()?.toLowerCase()
  if (extension === 'csv' || extension === 'tsv') {
    const first = workbook.Sheets[workbook.SheetNames[0]!]
    return new Blob(
      [
        XLSX.utils.sheet_to_csv(first!, {
          FS: extension === 'tsv' ? '\t' : ',',
        }),
      ],
      { type: extension === 'tsv' ? 'text/tab-separated-values' : 'text/csv' },
    )
  }
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function publishVersion(input: {
  blob: Blob
  entryPath: string
  expectedCurrentVersion: number
  organizationId: string
  slug: string
}): Promise<number> {
  const hash = await sha256(input.blob)
  const session = await api<{
    data: {
      id: string
      files: Array<{ uploadUrl: string; multipart: boolean; partSize?: number }>
    }
  }>(`/api/v1/artifacts/${encodeURIComponent(input.slug)}/uploads`, {
    method: 'POST',
    organizationId: input.organizationId,
    body: JSON.stringify({
      label: 'Edited in Otter Drive',
      entryPath: input.entryPath,
      expectedCurrentVersion: input.expectedCurrentVersion,
      files: [
        {
          path: input.entryPath,
          contentType: input.blob.type || 'application/octet-stream',
          size: input.blob.size,
          sha256: hash,
        },
      ],
    }),
  })
  const remote = session.data.files[0]
  if (!remote)
    throw new Error('The upload session did not include the edited file.')
  if (remote.multipart) {
    if (!remote.partSize)
      throw new Error('The upload session omitted its part size.')
    const parts: Array<{ partNumber: number; etag: string }> = []
    const count = Math.ceil(input.blob.size / remote.partSize)
    for (let partNumber = 1; partNumber <= count; partNumber += 1) {
      const start = (partNumber - 1) * remote.partSize
      const uploadUrl = new URL(remote.uploadUrl)
      uploadUrl.searchParams.set('part', String(partNumber))
      const result = await api<{ data: { partNumber: number; etag: string } }>(
        uploadUrl.toString(),
        {
          method: 'PUT',
          headers: {
            'content-type': input.blob.type || 'application/octet-stream',
            'x-content-sha256': hash,
          },
          body: input.blob.slice(start, start + remote.partSize),
        },
      )
      parts.push(result.data)
    }
    await api(`${remote.uploadUrl}/complete`, {
      method: 'POST',
      body: JSON.stringify({ parts }),
    })
  } else {
    const upload = await fetch(remote.uploadUrl, {
      method: 'PUT',
      headers: {
        'content-type': input.blob.type || 'application/octet-stream',
        'x-content-sha256': hash,
      },
      body: input.blob,
    })
    if (!upload.ok)
      throw new Error(`Could not upload the edited file (${upload.status}).`)
  }
  const complete = await api<{ data: { version: { number: number } } }>(
    `/api/v1/uploads/${session.data.id}/complete`,
    { method: 'POST', organizationId: input.organizationId },
  )
  return complete.data.version.number
}

export function UniverEditor(props: EditorProps) {
  const container = useRef<HTMLDivElement>(null)
  const containerId = `univer-${props.slug}-${props.expectedCurrentVersion}`
  const handle = useRef<UniverHandle | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined
    async function mount() {
      if (!container.current) return
      const [
        { createUniver, LocaleType, mergeLocales },
        sheetPreset,
        docsPreset,
      ] = await Promise.all([
        import('@univerjs/presets'),
        import('@univerjs/preset-sheets-core'),
        import('@univerjs/preset-docs-core'),
      ])
      const [sheetsLocale, docsLocale] = await Promise.all([
        import('@univerjs/preset-sheets-core/locales/en-US'),
        import('@univerjs/preset-docs-core/locales/en-US'),
      ])
      if (disposed || !container.current) return
      const isSheet = props.kind === 'spreadsheet'
      const preset = isSheet
        ? sheetPreset.UniverSheetsCorePreset({ container: containerId })
        : docsPreset.UniverDocsCorePreset({ container: containerId })
      const locale = isSheet ? sheetsLocale.default : docsLocale.default
      const { univer, univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: { [LocaleType.EN_US]: mergeLocales(locale) },
        theme: defaultTheme,
        presets: [preset],
      })
      if (isSheet) {
        let acceptingChanges = false
        const workbook = univerAPI.createWorkbook(
          workbookData(props.entryPath, props.sheets ?? []),
        )
        if (props.selectedSheet)
          workbook.getSheetByName(props.selectedSheet)?.activate()
        const sheetEvent = univerAPI.addEvent(
          univerAPI.Event.ActiveSheetChanged,
          ({ activeSheet }) => {
            const name = activeSheet.getSheetName()
            const first = workbook.getSheets()[0]?.getSheetName()
            props.onSheetChange?.(name === first ? undefined : name)
          },
        )
        const commands = univerAPI.onCommandExecuted((command) => {
          if (acceptingChanges && changesSnapshot(command, 'spreadsheet'))
            setDirty(true)
        })
        const readyTimer = window.setTimeout(() => {
          acceptingChanges = true
          setDirty(false)
        }, 1_000)
        handle.current = {
          dispose: () => {
            clearTimeout(readyTimer)
            sheetEvent.dispose()
            commands.dispose()
            univer.dispose()
          },
          exportFile: async () => {
            await workbook.endEditing(true)
            return spreadsheetBlob(workbook.save(), props.entryPath)
          },
        }
      } else {
        let acceptingChanges = false
        const document = univerAPI.createUniverDoc(
          documentData(props.entryPath, props.text ?? ''),
        )
        const commands = univerAPI.onCommandExecuted((command) => {
          if (acceptingChanges && changesSnapshot(command, 'document'))
            setDirty(true)
        })
        const readyTimer = window.setTimeout(() => {
          acceptingChanges = true
          setDirty(false)
        }, 1_000)
        handle.current = {
          dispose: () => {
            clearTimeout(readyTimer)
            commands.dispose()
            univer.dispose()
          },
          exportFile: async () =>
            new Blob([plainDocument(document.getSnapshot())], {
              type: props.entryPath.endsWith('.md')
                ? 'text/markdown'
                : 'text/plain',
            }),
        }
      }
      cleanup = () => handle.current?.dispose()
    }
    void mount().catch((reason: unknown) =>
      toast.error(reason instanceof Error ? reason.message : String(reason)),
    )
    return () => {
      disposed = true
      cleanup?.()
      handle.current = null
    }
  }, [props.entryPath, props.kind, props.sheets, props.text])

  async function save() {
    if (!handle.current) return
    setSaving(true)
    try {
      const blob = await handle.current.exportFile()
      const nextVersion = await publishVersion({
        blob,
        entryPath: props.entryPath,
        expectedCurrentVersion: props.expectedCurrentVersion,
        organizationId: props.organizationId,
        slug: props.slug,
      })
      removeSessionCachePrefix(
        `otterdrive:artifact:${props.organizationId}:${props.slug}`,
      )
      removeSessionCachePrefix(`otterdrive:artifacts:${props.organizationId}:`)
      setDirty(false)
      toast.success(`Published version ${nextVersion}.`)
      window.setTimeout(
        () =>
          location.assign(
            `/${encodeURIComponent(props.organizationSlug)}/a/${encodeURIComponent(props.slug)}/v${nextVersion}`,
          ),
        0,
      )
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  const actions = (
    <div className="viewer-editor-actions">
      <span>{dirty ? 'Unsaved changes' : 'Current version'}</span>
      <Button
        size="sm"
        disabled={!dirty || saving}
        aria-label={saving ? 'Saving new version' : 'Save new version'}
        onClick={() => void save()}
      >
        <Save size={14} />
        <span className="editor-save-label">
          {saving ? 'Saving…' : 'Save new version'}
        </span>
      </Button>
    </div>
  )

  return (
    <>
      {props.actionsContainer && createPortal(actions, props.actionsContainer)}
      <div className="univer-editor-shell">
        <div id={containerId} ref={container} className="univer-editor" />
      </div>
    </>
  )
}
