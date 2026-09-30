import { setTimeout as delay } from 'node:timers/promises'
import {
  deviceCodeResponseSchema,
  deviceTokenResponseSchema,
} from '@otterware/contracts'
import type { Command } from 'commander'
import open from 'open'
import pc from 'picocolors'
import { ApiClient } from './client'
import {
  clearCredentials,
  configPath,
  getProfile,
  updateProfile,
} from './config'
import type { GlobalOptions } from './output'
import { note, printJson, success } from './output'

interface LoginOptions {
  apiKey?: string
  noOpen?: boolean
  url?: string
}

function globalOptions(command: Command): GlobalOptions {
  return command.optsWithGlobals<GlobalOptions>()
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Authenticate this machine')

  auth
    .command('login')
    .description('Log in using a browser or an API key')
    .option('--api-key <key>', 'Use an existing agent API key')
    .option('--url <url>', 'Otter Drive application URL')
    .option('--no-open', 'Do not open the browser automatically')
    .action(async (options: LoginOptions, command: Command) => {
      const globals = globalOptions(command)
      const { name, profile: storedProfile } = await getProfile(globals.profile)
      const profile = {
        ...storedProfile,
        apiUrl: options.url ?? storedProfile.apiUrl,
      }

      if (options.apiKey) {
        const client = new ApiClient({ ...profile, apiKey: options.apiKey })
        const me = await client.get<unknown>('/api/v1/me')
        await updateProfile(name, {
          apiUrl: profile.apiUrl,
          apiKey: options.apiKey,
          accessToken: undefined,
        })
        if (globals.json) printJson(me)
        else success(`Authenticated profile ${pc.bold(name)} with an API key.`)
        return
      }

      const client = new ApiClient(profile)
      const code = deviceCodeResponseSchema.parse(
        await client.post('/api/auth/device/code', {
          client_id: 'otterdrive-cli',
          scope: 'openid profile email offline_access',
        }),
      )
      const verificationUrl = new URL(
        code.verification_uri_complete ?? code.verification_uri,
        profile.apiUrl,
      ).toString()

      process.stdout.write(`\nEnter ${pc.bold(pc.cyan(code.user_code))} at:\n`)
      process.stdout.write(`${verificationUrl}\n\n`)
      if (options.noOpen !== true) await open(verificationUrl)

      const expiresAt = Date.now() + code.expires_in * 1_000
      let interval = (code.interval ?? 5) * 1_000
      while (Date.now() < expiresAt) {
        await delay(interval)
        try {
          const token = deviceTokenResponseSchema.parse(
            await client.post('/api/auth/device/token', {
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
              device_code: code.device_code,
              client_id: 'otterdrive-cli',
            }),
          )
          await updateProfile(name, {
            apiUrl: profile.apiUrl,
            accessToken: token.access_token,
            apiKey: undefined,
          })
          if (globals.json) printJson(token)
          else success(`Authenticated profile ${pc.bold(name)}.`)
          return
        } catch (error) {
          const message = (error as Error).message
          if (message.includes('slow_down')) interval += 5_000
          else if (!message.includes('authorization_pending')) throw error
        }
      }
      throw new Error('The login code expired before it was approved.')
    })

  auth
    .command('status')
    .description('Show the current authenticated identity')
    .action(async (_options: unknown, command: Command) => {
      const globals = globalOptions(command)
      const { name, profile } = await getProfile(globals.profile)
      if (!profile.accessToken && !profile.apiKey) {
        const status = {
          authenticated: false,
          profile: name,
          apiUrl: profile.apiUrl,
        }
        if (globals.json) printJson(status)
        else note(`Profile ${pc.bold(name)} is not authenticated.`)
        return
      }
      const me = await new ApiClient(profile).get<unknown>('/api/v1/me')
      if (globals.json) printJson({ profile: name, ...asRecord(me) })
      else {
        success(`Profile ${pc.bold(name)} is authenticated.`)
        printJson(me)
      }
    })

  auth
    .command('logout')
    .description('Remove locally stored credentials')
    .action(async (_options: unknown, command: Command) => {
      const globals = globalOptions(command)
      const { name } = await getProfile(globals.profile)
      await clearCredentials(name)
      if (globals.json) printJson({ success: true, profile: name })
      else success(`Removed credentials for profile ${pc.bold(name)}.`)
    })

  auth
    .command('config-path')
    .description('Print where credentials are stored')
    .action(async () => {
      note(configPath())
    })
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : { value }
}
