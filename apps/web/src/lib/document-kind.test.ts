import { describe, expect, it } from 'vitest'
import { documentKind } from './document-kind'

describe('documentKind', () => {
  it.each([
    ['text/plain', 'README.md', 'markdown'],
    ['application/octet-stream', 'NOTES.MARKDOWN', 'markdown'],
    ['text/markdown; charset=utf-8', 'notes', 'markdown'],
    ['text/plain', 'notes.txt', 'text'],
    ['text/plain', 'report.csv', 'csv'],
    ['text/csv', 'report.tsv', 'tsv'],
    ['text/tab-separated-values', 'report', 'tsv'],
    ['text/plain', 'report.xlsx', 'workbook'],
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'report',
      'workbook',
    ],
    ['video/webm; codecs=vp9', 'recording', 'video'],
    ['application/octet-stream', 'DEMO.MP4', 'video'],
    ['text/html', 'index.html', 'frame'],
    ['application/pdf', 'report.pdf', 'frame'],
  ] as const)('chooses %s / %s as %s', (type, path, kind) => {
    expect(documentKind(type, path)).toBe(kind)
  })
})
