import { describe, expect, it } from 'vitest'
import { changesSnapshot } from './univer-change-tracking'

describe('changesSnapshot', () => {
  it('ignores commands and UI-only operations such as cell selection', () => {
    expect(
      changesSnapshot(
        { id: 'sheet.command.set-range-values', type: 0 },
        'spreadsheet',
      ),
    ).toBe(false)
    expect(
      changesSnapshot(
        { id: 'sheet.operation.set-selections', type: 1 },
        'spreadsheet',
      ),
    ).toBe(false)
  })

  it('ignores document-editor mutations caused by selecting a cell', () => {
    expect(
      changesSnapshot(
        { id: 'doc.mutation.rich-text-editing', type: 2 },
        'spreadsheet',
      ),
    ).toBe(false)
  })

  it('tracks mutations persisted in the workbook snapshot', () => {
    expect(
      changesSnapshot(
        { id: 'sheet.mutation.set-range-values', type: 2 },
        'spreadsheet',
      ),
    ).toBe(true)
  })

  it('tracks mutations in document editors', () => {
    expect(
      changesSnapshot(
        { id: 'doc.mutation.rich-text-editing', type: 2 },
        'document',
      ),
    ).toBe(true)
  })
})
