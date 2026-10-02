export type DocumentKind =
  'markdown' | 'text' | 'csv' | 'tsv' | 'workbook' | 'video' | 'frame'

export type NativeDocumentKind = Exclude<DocumentKind, 'video' | 'frame'>

/** One format decision for readers, editors, and thumbnails. */
export function documentKind(
  contentType: string,
  entryPath: string,
): DocumentKind {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  const extension = entryPath.split('.').pop()?.toLowerCase() ?? ''
  if (extension === 'tsv' || type === 'text/tab-separated-values') return 'tsv'
  if (extension === 'csv' || type === 'text/csv') return 'csv'
  if (
    extension === 'xlsx' ||
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
    return 'workbook'
  if (['md', 'markdown'].includes(extension) || type === 'text/markdown')
    return 'markdown'
  if (extension === 'txt' || type === 'text/plain') return 'text'
  if (
    type.startsWith('video/') ||
    ['mp4', 'm4v', 'webm', 'mov', 'ogv'].includes(extension)
  )
    return 'video'
  return 'frame'
}
