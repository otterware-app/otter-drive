import { describe, expect, it } from 'vitest'
import {
  createArtifactInputSchema,
  createUploadInputSchema,
  updateArtifactInputSchema,
} from './index'

describe('artifact inputs', () => {
  it('normalizes create defaults', () => {
    const value = createArtifactInputSchema.parse({
      slug: 'hello-world',
      title: 'Hello world',
    })

    expect(value.entryPath).toBe('index.html')
  })

  it('rejects unsafe slugs and empty updates', () => {
    expect(() =>
      createArtifactInputSchema.parse({ slug: '../admin', title: 'Bad' }),
    ).toThrow()
    expect(() => updateArtifactInputSchema.parse({})).toThrow()
  })

  it('accepts an explicit source version for edits without changing full uploads', () => {
    const upload = {
      label: 'Edit',
      entryPath: 'README.md',
      expectedCurrentVersion: 2,
      files: [
        {
          path: 'README.md',
          contentType: 'text/markdown',
          size: 10,
          sha256: 'hash',
        },
      ],
    }
    expect(createUploadInputSchema.parse(upload).baseVersion).toBeUndefined()
    expect(
      createUploadInputSchema.parse({ ...upload, baseVersion: 1 }).baseVersion,
    ).toBe(1)
    for (const baseVersion of [0, -1, 1.5, '1']) {
      expect(
        createUploadInputSchema.safeParse({ ...upload, baseVersion }).success,
      ).toBe(false)
    }
  })
})
