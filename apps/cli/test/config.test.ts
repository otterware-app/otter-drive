import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clearCredentials,
  configPath,
  getProfile,
  mergeProfile,
  readConfig,
} from '../src/config'

describe('profile updates', () => {
  it('preserves credentials when selecting an organization', () => {
    expect(
      mergeProfile(
        {
          apiUrl: 'https://drive.otterware.dev',
          accessToken: 'device-token',
        },
        { organizationId: 'organization-1' },
      ),
    ).toEqual({
      apiUrl: 'https://drive.otterware.dev',
      accessToken: 'device-token',
      organizationId: 'organization-1',
    })
  })

  it('removes only credentials explicitly cleared', () => {
    expect(
      mergeProfile(
        {
          apiUrl: 'https://drive.otterware.dev',
          accessToken: 'device-token',
          apiKey: 'api-key',
        },
        { accessToken: undefined },
      ),
    ).toEqual({
      apiUrl: 'https://drive.otterware.dev',
      apiKey: 'api-key',
    })
  })
})

describe('Otter Drive configuration migration', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'otterdrive-config-'))
    vi.stubEnv('XDG_CONFIG_HOME', root)
    for (const prefix of ['OTTERDRIVE', 'OTTERWARE']) {
      for (const key of ['URL', 'TOKEN', 'PROFILE', 'ORGANIZATION']) {
        vi.stubEnv(`${prefix}_${key}`, undefined)
      }
    }
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  })

  it('migrates all legacy profiles once with private permissions and preserves logout', async () => {
    const legacy = {
      activeProfile: 'work',
      profiles: {
        work: {
          apiUrl: 'https://app.otterware.dev/',
          accessToken: 'token',
          organizationId: 'org',
        },
        local: { apiUrl: 'http://localhost:3000', apiKey: 'otw_key' },
      },
    }
    await mkdir(join(root, 'otterware'))
    await writeFile(
      join(root, 'otterware', 'config.json'),
      JSON.stringify(legacy),
    )
    const config = await readConfig()
    expect(config.activeProfile).toBe('work')
    expect(config.profiles.work).toEqual({
      ...legacy.profiles.work,
      apiUrl: 'https://drive.otterware.app',
    })
    expect(config.profiles.local).toEqual(legacy.profiles.local)
    expect(configPath()).toBe(join(root, 'otterdrive', 'config.json'))
    expect((await stat(configPath())).mode & 0o777).toBe(0o600)
    await clearCredentials('work')
    expect((await readConfig()).profiles.work?.accessToken).toBeUndefined()
    expect(
      JSON.parse(
        await readFile(join(root, 'otterware', 'config.json'), 'utf8'),
      ),
    ).toEqual(legacy)
  })

  it('prefers the new config and environment over legacy values', async () => {
    await mkdir(join(root, 'otterdrive'))
    await writeFile(
      configPath(),
      JSON.stringify({
        activeProfile: 'default',
        profiles: {
          default: {
            apiUrl: 'https://drive.otterware.dev',
            accessToken: 'saved-token',
          },
        },
      }),
    )
    vi.stubEnv('OTTERWARE_URL', 'https://legacy.example')
    vi.stubEnv('OTTERDRIVE_URL', 'https://custom.example')
    vi.stubEnv('OTTERWARE_TOKEN', 'legacy-token')
    vi.stubEnv('OTTERDRIVE_TOKEN', 'otw_new-key')
    vi.stubEnv('OTTERDRIVE_ORGANIZATION', 'new-org')
    expect((await getProfile()).profile).toEqual({
      apiUrl: 'https://custom.example',
      apiKey: 'otw_new-key',
      organizationId: 'new-org',
    })
  })

  it('supports legacy environment variables while moving the production URL', async () => {
    vi.stubEnv('OTTERWARE_URL', 'https://app.otterware.dev')
    vi.stubEnv('OTTERWARE_TOKEN', 'otw_existing')
    expect((await getProfile()).profile).toEqual({
      apiUrl: 'https://drive.otterware.app',
      apiKey: 'otw_existing',
    })
  })

  it.each(['https://drive.otterware.dev', 'https://drive.otterware.dev/'])(
    'uses the new domain for an existing Otter Drive profile at %s',
    async (apiUrl) => {
      const saved = {
        activeProfile: 'default',
        profiles: {
          default: {
            apiUrl,
            accessToken: 'existing-token',
            organizationId: 'existing-org',
          },
        },
      }
      await mkdir(join(root, 'otterdrive'))
      await writeFile(configPath(), JSON.stringify(saved))
      expect((await getProfile()).profile).toEqual({
        ...saved.profiles.default,
        apiUrl: 'https://drive.otterware.app',
      })
      expect(JSON.parse(await readFile(configPath(), 'utf8'))).toEqual(saved)
    },
  )

  it.each([
    'https://drive.otterware.dev.example',
    'https://drive.otterware.dev/custom',
    'http://localhost:3000',
  ])('preserves a custom server at %s', async (apiUrl) => {
    vi.stubEnv('OTTERDRIVE_URL', apiUrl)
    expect((await getProfile()).profile.apiUrl).toBe(apiUrl)
  })
})
