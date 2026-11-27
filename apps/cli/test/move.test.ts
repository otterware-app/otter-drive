import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

const entry = resolve(import.meta.dirname, '../src/index.ts')

it('artifacts move reaches its own checks', () => {
  const config = mkdtempSync(join(tmpdir(), 'otterdrive-'))
  try {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', entry, 'artifacts', 'move', 'doc', 'folder'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          XDG_CONFIG_HOME: config,
          OTTERDRIVE_TOKEN: 'otw_test',
        },
      },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'Moving artifacts requires a user login, not an API key.',
    )
  } finally {
    rmSync(config, { recursive: true, force: true })
  }
})
