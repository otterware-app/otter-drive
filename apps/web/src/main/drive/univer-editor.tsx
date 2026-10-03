import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  useBlocker,
  useNavigate,
  type ShouldBlockFn,
} from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { defaultTheme, LocaleType } from '@univerjs/presets'
import type {
  ICellData,
  IDocumentData,
  IWorkbookData,
  IWorksheetData,
} from '@univerjs/presets'
import { publishDocumentVersion } from '#/lib/publish-document-version'
import type { DocumentSheet } from './use-document-content'
import { removeSessionCachePrefix } from '#/lib/session-cache'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { changesSnapshot } from './univer-change-tracking'

import '@univerjs/preset-sheets-core/lib/index.css'
import '@univerjs/preset-docs-core/lib/index.css'

type GridValue = unknown

type EditorProps = {
  readOnly?: boolean | undefined
  actionsContainer?: HTMLDivElement | null | undefined
  entryPath: string
  expectedCurrentVersion: number
  version: number
  folderId: string
  folderSlug: string
  onSheetChange?: ((sheet: string | undefined) => void) | undefined
  onPreview?: (() => void) | undefined
  selectedSheet?: string | undefined
  slug: string
} & (
  | { kind: 'document'; text: string; documentFormat: 'markdown' | 'text' }
  | { kind: 'spreadsheet'; sheets: DocumentSheet[] }
)

interface UniverHandle {
  dispose: () => void
  exportFile: () => Promise<Blob>
  setDarkMode: (dark: boolean) => void
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
  sheets: DocumentSheet[],
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

export function UniverEditor(props: EditorProps) {
  const container = useRef<HTMLDivElement>(null)
  const containerId = `univer-${props.slug}-${props.expectedCurrentVersion}`
  const handle = useRef<UniverHandle | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewRequested, setPreviewRequested] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const darkRef = useRef(dark)
  darkRef.current = dark

  // The editor follows the app's light or dark appearance.
  useEffect(() => {
    handle.current?.setDarkMode(dark)
  }, [dark])

  // Unsaved edits hold the page: closing the tab asks the browser's question,
  // and leaving the document in the app (another row, J/K, the rail…) asks
  // ours. Switching sheets stays on the document, so it passes.
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  const shouldBlockFn = useCallback<ShouldBlockFn>(
    ({ current, next }) =>
      dirtyRef.current && current.pathname !== next.pathname,
    [],
  )
  const enableBeforeUnload = useCallback(() => dirtyRef.current, [])
  const blocker = useBlocker({
    shouldBlockFn,
    enableBeforeUnload,
    withResolver: true,
  })

  // Univer focuses its editor whenever it likes (as it starts, as it
  // re-renders); that would take the keys from the list (J/K, Esc) and close
  // any open menu. It only keeps the focus once you've clicked or tapped in.
  useEffect(() => {
    const host = container.current
    if (!host) return
    let engaged = false
    const engage = () => {
      engaged = true
    }
    const guard = (event: FocusEvent) => {
      if (engaged) return
      const target = event.target
      if (target instanceof HTMLElement) target.blur()
    }
    host.addEventListener('pointerdown', engage, true)
    host.addEventListener('focusin', guard)
    return () => {
      host.removeEventListener('pointerdown', engage, true)
      host.removeEventListener('focusin', guard)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined
    async function mount() {
      if (!container.current) return
      // Only the preset this document needs: the sheets preset, loaded for a
      // text document, throws as it looks for sheet services that aren't there.
      const isSheet = props.kind === 'spreadsheet'
      const [{ createUniver, LocaleType, mergeLocales }, { preset, locale }] =
        await Promise.all([
          import('@univerjs/presets'),
          isSheet
            ? Promise.all([
                import('@univerjs/preset-sheets-core'),
                import('@univerjs/preset-sheets-core/locales/en-US'),
              ]).then(([sheets, sheetsLocale]) => ({
                preset: sheets.UniverSheetsCorePreset({
                  container: containerId,
                }),
                locale: sheetsLocale.default,
              }))
            : Promise.all([
                import('@univerjs/preset-docs-core'),
                import('@univerjs/preset-docs-core/locales/en-US'),
              ]).then(([docs, docsLocale]) => ({
                preset: docs.UniverDocsCorePreset({ container: containerId }),
                locale: docsLocale.default,
              })),
        ])
      if (disposed || !container.current) return
      const { univer, univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: { [LocaleType.EN_US]: mergeLocales(locale) },
        theme: defaultTheme,
        darkMode: darkRef.current,
        presets: [preset],
      })
      const setDarkMode = (value: boolean) => univerAPI.toggleDarkMode(value)
      if (isSheet) {
        let acceptingChanges = false
        const workbook = univerAPI.createWorkbook(
          workbookData(props.entryPath, props.sheets ?? []),
        )
        if (props.readOnly) workbook.setEditable(false)
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
          setDarkMode,
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
              type:
                props.documentFormat === 'markdown'
                  ? 'text/markdown'
                  : 'text/plain',
            }),
          setDarkMode,
        }
      }
      cleanup = () => handle.current?.dispose()
    }
    void mount().catch((reason: unknown) =>
      toast.error('The editor didn’t start', {
        description: reason instanceof Error ? reason.message : String(reason),
      }),
    )
    return () => {
      disposed = true
      cleanup?.()
      handle.current = null
    }
  }, [
    props.entryPath,
    props.readOnly,
    props.kind,
    props.kind === 'spreadsheet' ? props.sheets : null,
    props.kind === 'document' ? props.text : null,
    props.kind === 'document' ? props.documentFormat : null,
  ])

  async function save() {
    if (!handle.current || props.readOnly) return
    setSaving(true)
    try {
      const blob = await handle.current.exportFile()
      const nextVersion = await publishDocumentVersion({
        blob,
        baseVersion: props.version,
        entryPath: props.entryPath,
        expectedCurrentVersion: props.expectedCurrentVersion,
        folderId: props.folderId,
        slug: props.slug,
      })
      removeSessionCachePrefix(
        `otterdrive:artifact:${props.folderId}:${props.slug}`,
      )
      removeSessionCachePrefix(`otterdrive:artifacts:${props.folderId}:`)
      dirtyRef.current = false
      setDirty(false)
      await queryClient.invalidateQueries({
        queryKey: ['artifact-bootstrap', props.folderId, props.slug],
      })
      void queryClient.invalidateQueries({
        queryKey: ['artifacts', props.folderId],
      })
      toast.success(`Saved version ${nextVersion}`)
      await navigate({
        to: '/$folderSlug/a/$slug/$version',
        params: {
          folderSlug: props.folderSlug,
          slug: props.slug,
          version: `v${nextVersion}`,
        },
        search: (current) => current,
      })
    } catch (reason) {
      toast.error('Couldn’t save a new version', {
        description: reason instanceof Error ? reason.message : String(reason),
      })
    } finally {
      setSaving(false)
    }
  }

  // Edits become a new immutable version; the save sits in the viewer's
  // title band, next to the document's own actions.
  const actions = props.readOnly ? null : (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground lg:inline">
        {dirty ? 'Unsaved changes' : 'No changes'}
      </span>
      {props.onPreview ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => {
            if (dirty) setPreviewRequested(true)
            else props.onPreview?.()
          }}
        >
          Preview
        </Button>
      ) : null}
      <Button
        size="sm"
        variant={dirty ? 'accent' : 'outline'}
        disabled={!dirty || saving}
        aria-label={saving ? 'Saving new version' : 'Save new version'}
        onClick={() => void save()}
      >
        {saving ? 'Saving…' : 'Save version'}
      </Button>
    </div>
  )

  return (
    <>
      {props.actionsContainer ? (
        createPortal(actions, props.actionsContainer)
      ) : (
        <div className="flex justify-end border-b px-4 py-2">{actions}</div>
      )}
      <div
        id={containerId}
        ref={container}
        data-univer-host=""
        className="size-full min-h-0 min-w-0 overflow-hidden"
      />
      <Dialog
        open={previewRequested || blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewRequested(false)
            if (blocker.status === 'blocked') blocker.reset()
          }
        }}
        title="Leave without saving?"
        description="Your changes to this document aren’t saved as a version yet."
        confirmLabel="Discard changes"
        confirmVariant="destructive"
        onConfirm={() => {
          if (previewRequested) props.onPreview?.()
          else if (blocker.status === 'blocked') blocker.proceed()
        }}
        size="small"
      />
    </>
  )
}
