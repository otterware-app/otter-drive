import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_API_URL } from '@otterware/contracts'

export interface Profile {
  apiUrl: string
  accessToken?: string | undefined
  apiKey?: string | undefined
  organizationId?: string | undefined
}

export function mergeProfile(
  existing: Profile | undefined,
  update: Partial<Profile>,
): Profile {
  const profile: Profile = {
    apiUrl: DEFAULT_API_URL,
    ...existing,
    ...update,
  }
  if (
    Object.prototype.hasOwnProperty.call(update, 'accessToken') &&
    update.accessToken === undefined
  ) {
    delete profile.accessToken
  }
  if (
    Object.prototype.hasOwnProperty.call(update, 'apiKey') &&
    update.apiKey === undefined
  ) {
    delete profile.apiKey
  }
  return profile
}

interface ConfigFile {
  activeProfile: string
  profiles: Record<string, Profile>
}

const defaultConfig = (): ConfigFile => ({
  activeProfile: 'default',
  profiles: { default: { apiUrl: DEFAULT_API_URL } },
})

export function configPath(): string {
  const root = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(root, 'otterdrive', 'config.json')
}

export async function readConfig(): Promise<ConfigFile> {
  try {
    return JSON.parse(await readFile(configPath(), 'utf8')) as ConfigFile
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  // Copy legacy profiles once; subsequent logout must not resurrect old tokens.
  const legacyPath = join(
    dirname(dirname(configPath())),
    'otterware',
    'config.json',
  )
  let config: ConfigFile
  try {
    config = JSON.parse(await readFile(legacyPath, 'utf8')) as ConfigFile
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return defaultConfig()
    throw error
  }
  for (const profile of Object.values(config.profiles)) {
    profile.apiUrl = migrateApiUrl(profile.apiUrl)
  }
  await writeConfig(config)
  return config
}

function migrateApiUrl(url: string): string {
  return /^https:\/\/(?:app|drive)\.otterware\.dev\/?$/.test(url)
    ? DEFAULT_API_URL
    : url
}

async function writeConfig(config: ConfigFile): Promise<void> {
  const path = configPath()
  const temporary = `${path}.${process.pid}.tmp`
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  })
  await rename(temporary, path)
  await chmod(path, 0o600)
}

export async function getProfile(name?: string): Promise<{
  name: string
  profile: Profile
}> {
  const config = await readConfig()
  const profileName =
    name ??
    process.env.OTTERDRIVE_PROFILE ??
    process.env.OTTERWARE_PROFILE ??
    config.activeProfile
  const stored = config.profiles[profileName] ?? { apiUrl: DEFAULT_API_URL }
  const profile: Profile = {
    ...stored,
    apiUrl: migrateApiUrl(
      process.env.OTTERDRIVE_URL ?? process.env.OTTERWARE_URL ?? stored.apiUrl,
    ),
  }
  const token = process.env.OTTERDRIVE_TOKEN ?? process.env.OTTERWARE_TOKEN
  if (token) {
    delete profile.apiKey
    delete profile.accessToken
    if (token.startsWith('otw_')) profile.apiKey = token
    else profile.accessToken = token
  }
  const organization =
    process.env.OTTERDRIVE_ORGANIZATION ?? process.env.OTTERWARE_ORGANIZATION
  if (organization) {
    profile.organizationId = organization
  }
  return { name: profileName, profile }
}

export async function updateProfile(
  name: string,
  update: Partial<Profile>,
  makeActive = true,
): Promise<Profile> {
  const config = await readConfig()
  const profile = mergeProfile(config.profiles[name], update)
  config.profiles[name] = profile
  if (makeActive) config.activeProfile = name
  await writeConfig(config)
  return profile
}

export async function clearCredentials(name: string): Promise<void> {
  const config = await readConfig()
  const profile = config.profiles[name]
  if (profile) {
    delete profile.accessToken
    delete profile.apiKey
    await writeConfig(config)
  }
}
