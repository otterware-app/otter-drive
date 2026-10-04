import { useQuery } from '@tanstack/react-query'
import Papa from 'papaparse'
import type { NativeDocumentKind } from '#/lib/document-kind'

export interface DocumentSheet {
  sheet: string
  data: unknown[][]
}

export type DocumentContent =
  | { kind: 'text'; text: string }
  | { kind: 'spreadsheet'; sheets: DocumentSheet[] }

interface ContentInput {
  /** The folder you reach the document through; undefined when by id. */
  folderId: string | undefined
  /** Its slug in that folder, or its id. */
  reference: string
  version: number
  entryPath: string
  kind: NativeDocumentKind
}

async function loadDocumentContent(
  input: ContentInput,
  signal: AbortSignal,
): Promise<DocumentContent> {
  const query = new URLSearchParams({
    version: String(input.version),
    path: input.entryPath,
  })
  const response = await fetch(
    `/api/v1/artifacts/${encodeURIComponent(input.reference)}/content?${query}`,
    {
      headers: {
        accept: '*/*',
        ...(input.folderId ? { 'x-otterdrive-folder': input.folderId } : {}),
      },
      signal,
    },
  )
  if (!response.ok)
    throw new Error(`Could not load document (${response.status}).`)
  if (input.kind === 'workbook') {
    const [bytes, XLSX] = await Promise.all([
      response.arrayBuffer(),
      import('@e965/xlsx'),
    ])
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true })
    return {
      kind: 'spreadsheet',
      sheets: workbook.SheetNames.map((sheet) => ({
        sheet,
        data: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet]!, {
          header: 1,
          defval: null,
          raw: false,
        }),
      })),
    }
  }
  const text = await response.text()
  if (input.kind === 'markdown' || input.kind === 'text')
    return { kind: 'text', text }
  const parsed = Papa.parse<string[]>(text, {
    delimiter: input.kind === 'tsv' ? '\t' : '',
    skipEmptyLines: false,
  })
  if (parsed.errors.length && !parsed.data.length)
    throw new Error(parsed.errors[0]?.message ?? 'Could not parse spreadsheet.')
  return {
    kind: 'spreadsheet',
    sheets: [{ sheet: input.entryPath, data: parsed.data }],
  }
}

/** The selected version is immutable, so its parsed content can be reused. */
export function useDocumentContent(input: ContentInput) {
  return useQuery({
    queryKey: [
      'document-content',
      input.folderId ?? 'shared',
      input.reference,
      input.version,
      input.entryPath,
      input.kind,
    ],
    queryFn: ({ signal }) => loadDocumentContent(input, signal),
    staleTime: Infinity,
    retry: false,
    enabled: !import.meta.env.SSR,
  })
}
