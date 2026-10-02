// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render as renderComponent,
  screen,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPreview } from './document-preview'

const clients: QueryClient[] = []
function render(element: React.ReactElement) {
  const client = new QueryClient()
  clients.push(client)
  return renderComponent(element, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}
vi.mock('./use-content-session', () => ({
  useContentSession: () => ({
    data: 'https://usercontent.otterware.app/raw/a/artifact-roadmap/version-2/',
    isPending: false,
    isFetching: false,
    error: null,
  }),
}))

vi.mock('./univer-editor', () => ({
  UniverEditor: (props: {
    onSheetChange?: (sheet: string | undefined) => void
    onPreview?: () => void
    sheets?: Array<{ sheet: string; data: unknown[][] }>
    text?: string
  }) => (
    <div data-testid="univer-editor">
      {props.onPreview ? (
        <button onClick={props.onPreview}>Preview</button>
      ) : null}
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

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.unstubAllGlobals()
})

const textProps = {
  kind: 'markdown' as const,
  entryPath: 'docs/README.md',
  organizationId: 'org-chris',
  organizationSlug: 'chris',
  slug: 'roadmap',
  version: 2,
}

describe('DocumentPreview', () => {
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
        kind="csv"
        entryPath="report.csv"
        organizationId="org-chris"
        organizationSlug="chris"
        slug="report"
        version={1}
      />,
    )

    expect(await screen.findByTestId('univer-editor')).not.toBeNull()
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/artifacts/report/content?version=1&path=report.csv',
      {
        headers: {
          accept: '*/*',
          'x-otterdrive-organization': 'org-chris',
        },
        signal: expect.any(AbortSignal),
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
            '# Roadmap\n\n- [x] CSV preview\n\n| Feature | Status |\n| --- | --- |\n| Markdown | Done |\n\n~~Old plan~~\n\n```ts\nconst total = 42\n```\n\n![Chart](images/chart.png)',
          ),
        ),
    )

    render(<DocumentPreview {...textProps} />)

    expect(
      await screen.findByRole('heading', { name: 'Roadmap', level: 1 }),
    ).not.toBeNull()
    expect(screen.queryByTestId('univer-editor')).toBeNull()
    expect(screen.getByRole('checkbox').hasAttribute('disabled')).toBe(true)
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(
      true,
    )
    expect(screen.getByRole('table')).not.toBeNull()
    expect(screen.getByText('Old plan').tagName).toBe('DEL')
    expect(screen.getByText('const total = 42').tagName).toBe('CODE')
    const image = screen.getByRole('img', { name: 'Chart' })
    expect(image.getAttribute('src')).toBe(
      'https://usercontent.otterware.app/raw/a/artifact-roadmap/version-2/docs/images/chart.png',
    )
  })

  it('opens the raw source only after Edit and can return to preview', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('# Roadmap')))
    const actions = document.createElement('div')
    document.body.appendChild(actions)
    const { unmount } = render(
      <DocumentPreview {...textProps} actionsContainer={actions} />,
    )

    await screen.findByRole('heading', { name: 'Roadmap' })
    expect(actions.querySelector('button')?.textContent).toContain('Edit')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect((await screen.findByTestId('univer-editor')).textContent).toContain(
      '# Roadmap',
    )
    expect(screen.queryByRole('heading', { name: 'Roadmap' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByRole('heading', { name: 'Roadmap' })).not.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    unmount()
    expect(actions.children.length).toBe(0)
    actions.remove()
  })

  it('shows plain text literally in a read-only preview', async () => {
    const source =
      '# Plain text\n\n- [x] Not a checkbox\n<script>alert(1)</script>'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(source)))
    const { container } = render(
      <DocumentPreview {...textProps} kind="text" entryPath="notes.txt" />,
    )

    expect((await screen.findByText(/# Plain text/)).tagName).toBe('PRE')
    expect(container.querySelector('pre')?.textContent).toBe(source)
    expect(container.querySelector('script')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByTestId('univer-editor')).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit' })).not.toBeNull()
  })

  it('keeps uploaded HTML and unsafe links out of the Markdown preview', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            '# Safe preview\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[Unsafe](javascript:alert%281%29)\n\n[Website](https://example.com)\n\n[Download](../files/report.pdf)',
          ),
        ),
    )
    const { container } = render(<DocumentPreview {...textProps} />)

    await screen.findByRole('heading', { name: 'Safe preview' })
    expect(container.querySelector('script, [onerror]')).toBeNull()
    expect(screen.getByText('Unsafe').getAttribute('href')).toBe('')
    expect(
      screen.getByRole('link', { name: 'Website' }).getAttribute('href'),
    ).toBe('https://example.com')
    expect(
      screen.getByRole('link', { name: 'Download' }).getAttribute('href'),
    ).toBe(
      'https://usercontent.otterware.app/raw/a/artifact-roadmap/version-2/files/report.pdf',
    )
  })

  it('returns to preview when another version opens', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('# Version two'))
        .mockResolvedValueOnce(new Response('# Version one')),
    )
    const { rerender } = render(<DocumentPreview {...textProps} />)

    await screen.findByRole('heading', { name: 'Version two' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await screen.findByTestId('univer-editor')
    rerender(<DocumentPreview {...textProps} version={1} />)
    expect(
      await screen.findByRole('heading', { name: 'Version one' }),
    ).not.toBeNull()
    expect(screen.queryByTestId('univer-editor')).toBeNull()
  })

  it('lets an empty text file open for editing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('')))
    render(<DocumentPreview {...textProps} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(await screen.findByTestId('univer-editor')).not.toBeNull()
  })

  it('reports a failed content request without offering Edit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 403 })),
    )
    render(<DocumentPreview {...textProps} />)

    expect(
      await screen.findByText('Could not load document (403).'),
    ).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('opens the CSV format as a spreadsheet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Name,Total\nOtterDrive,42')),
    )
    render(<DocumentPreview {...textProps} kind="csv" entryPath="report.csv" />)

    expect(
      await screen.findByRole('tab', { name: 'report.csv' }),
    ).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
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
        kind="workbook"
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
