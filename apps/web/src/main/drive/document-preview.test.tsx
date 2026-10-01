// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocumentPreview, columnName } from './document-preview'

vi.mock('./univer-editor', () => ({
  UniverEditor: (props: {
    onSheetChange?: (sheet: string | undefined) => void
    sheets?: Array<{ sheet: string; data: unknown[][] }>
    text?: string
  }) => (
    <div data-testid="univer-editor">
      {props.text}
      {props.sheets?.flatMap((sheet, index) => [
        <button
          key={`${sheet.sheet}-tab`}
          role="tab"
          onClick={() => props.onSheetChange?.(index ? sheet.sheet : undefined)}
        >
          {sheet.sheet}
        </button>,
        <span key={`${sheet.sheet}-data`}>{String(sheet.data.flat()[0])}</span>,
      ])}
    </div>
  ),
}))

const workbookFixture =
  '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'

afterEach(() => vi.unstubAllGlobals())

describe('DocumentPreview', () => {
  it('converts spreadsheet column indexes to labels', () => {
    expect(columnName(0)).toBe('A')
    expect(columnName(25)).toBe('Z')
    expect(columnName(26)).toBe('AA')
  })

  it('renders CSV content as a spreadsheet grid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Name,Total\nOtterDrive,42', {
          headers: { 'content-type': 'text/csv' },
        }),
      ),
    )

    render(
      <DocumentPreview
        contentType="text/csv"
        entryPath="report.csv"
        organizationId="org-chris"
        organizationSlug="chris"
        slug="report"
        version={1}
      />,
    )

    expect(await screen.findByTestId('univer-editor')).not.toBeNull()
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/artifacts/report/content?version=1',
      {
        headers: {
          accept: '*/*',
          'x-otterdrive-organization': 'org-chris',
        },
      },
    )
  })

  it('renders GitHub-flavored Markdown', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            '# Roadmap\n\n- [x] CSV preview\n\n![Chart](images/chart.png)',
          ),
        ),
    )

    render(
      <DocumentPreview
        contentType="text/markdown"
        entryPath="README.md"
        organizationId="org-chris"
        organizationSlug="chris"
        slug="roadmap"
        version={2}
      />,
    )

    expect(await screen.findByText(/# Roadmap/)).not.toBeNull()
  })

  it('renders every sheet in an XLSX workbook', async () => {
    const bytes = Uint8Array.from(atob(workbookFixture), (character) =>
      character.charCodeAt(0),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(bytes, {
          headers: {
            'content-type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        }),
      ),
    )

    const onSheetChange = vi.fn()
    render(
      <DocumentPreview
        contentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        entryPath="report.xlsx"
        organizationId="org-chris"
        organizationSlug="chris"
        onSheetChange={onSheetChange}
        slug="workbook"
        version={1}
      />,
    )

    await screen.findByRole('tab', { name: 'Summary' })
    expect(screen.getByRole('tab', { name: 'Metrics' })).not.toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Metrics' }))
    expect(onSheetChange).toHaveBeenCalledWith('Metrics')
  })
})
