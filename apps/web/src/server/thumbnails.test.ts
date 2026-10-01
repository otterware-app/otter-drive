import { describe, expect, it } from 'vitest'
import { isVideo, spreadsheetThumbnailHtml } from './thumbnails'

describe('spreadsheet thumbnail rendering', () => {
  it('renders a sheet grid and safely escapes cell values', () => {
    const html = spreadsheetThumbnailHtml([
      ['Name', 'Status'],
      ['Otter Drive <Admin>', 'Working'],
    ])

    expect(html).toContain('<th>A</th>')
    expect(html).toContain('<th>1</th>')
    expect(html).toContain('Otter Drive &lt;Admin&gt;')
    expect(html).not.toContain('Otter Drive <Admin>')
  })
})

describe('video thumbnails', () => {
  it('knows a video by its type or extension', () => {
    expect(isVideo('video/webm', 'walkthrough.webm')).toBe(true)
    expect(isVideo('application/octet-stream', 'demo.MOV')).toBe(true)
    expect(isVideo('text/html', 'index.html')).toBe(false)
  })
})
