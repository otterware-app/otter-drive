// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UniverEditor } from './univer-editor'

const { onCommandExecuted, dispose } = vi.hoisted(() => ({
  onCommandExecuted: vi.fn(
    (_callback: (command: { id: string; type: number }) => void) => ({
      dispose: vi.fn(),
    }),
  ),
  dispose: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useBlocker: () => ({ status: 'idle', reset: vi.fn(), proceed: vi.fn() }),
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }))
vi.mock('@univerjs/presets', () => ({
  defaultTheme: {},
  LocaleType: { EN_US: 'en-US' },
  mergeLocales: () => ({}),
  createUniver: () => ({
    univer: { dispose },
    univerAPI: {
      toggleDarkMode: vi.fn(),
      onCommandExecuted,
      createUniverDoc: () => ({ getSnapshot: () => ({}) }),
    },
  }),
}))
vi.mock('@univerjs/preset-docs-core', () => ({
  UniverDocsCorePreset: () => ({}),
}))
vi.mock('@univerjs/preset-docs-core/locales/en-US', () => ({ default: {} }))

const props = {
  entryPath: 'README.md',
  expectedCurrentVersion: 2,
  version: 2,
  kind: 'document' as const,
  documentFormat: 'markdown' as const,
  folderId: 'org-chris',
  folderSlug: 'chris',
  slug: 'roadmap',
  text: '# Roadmap',
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('UniverEditor preview action', () => {
  it('returns to preview immediately when the document is unchanged', async () => {
    const onPreview = vi.fn()
    render(<UniverEditor {...props} onPreview={onPreview} />)
    await waitFor(() => expect(onCommandExecuted).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(onPreview).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps unsaved edits until the user confirms returning to preview', async () => {
    vi.useFakeTimers()
    const onPreview = vi.fn()
    render(<UniverEditor {...props} onPreview={onPreview} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500)
    })
    expect(onCommandExecuted).toHaveBeenCalled()
    vi.useRealTimers()
    const command = onCommandExecuted.mock.calls[0]![0]
    act(() => command({ id: 'doc.mutation.rich-text-editing', type: 2 }))
    expect(screen.getByText('Unsaved changes')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByRole('dialog')).not.toBeNull()
    expect(onPreview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onPreview).not.toHaveBeenCalled()
    expect(screen.getByText('Unsaved changes')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    )
    await waitFor(() => expect(onPreview).toHaveBeenCalledOnce())
  })
})
