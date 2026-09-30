import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const entry = resolve(import.meta.dirname, '../src/index.ts')
const { version } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
)

function run(...args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', entry, ...args], {
    encoding: 'utf8',
  })
}

describe('version options', () => {
  it.each(['-v', '--version'])('prints the CLI version for %s', (flag) => {
    const result = run(flag)

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(version)
  })

  it('leaves artifact version selectors to the subcommand', () => {
    const result = run(
      'artifacts',
      'files',
      'example',
      '--version',
      '1',
      '--help',
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      'Usage: otterdrive artifacts files [options] <artifact>',
    )
    expect(result.stdout).toContain('--version <number>')
    expect(result.stdout.trim()).not.toBe(version)
  })
})
