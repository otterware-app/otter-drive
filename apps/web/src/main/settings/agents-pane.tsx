import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRoundIcon } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { formatRelative } from '../drive/documents'
import {
  CopyField,
  SettingsGroup,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from './settings-ui'

type ApiKey = {
  id: string
  name: string | null
  start: string | null
  createdAt: string | Date
  lastRequest?: string | Date | null
}

/** Getting an agent going, in three commands (README.md's). */
function commands(origin: string) {
  return [
    {
      title: 'Install the CLI',
      description: 'Node.js 24 or newer.',
      command: 'npm install --global otterdrive',
    },
    {
      title: 'Sign in',
      description: 'Approves this device in the browser.',
      command: `otterdrive auth login --url ${origin}`,
    },
    {
      title: 'Teach your agent',
      description: 'The otterdrive skill, for Codex, Claude Code and others.',
      command:
        'npx skills@latest add otterware-app/otter-drive --skill otterdrive',
    },
  ]
}

async function copy(value: string, message = 'Copied') {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(message)
  } catch {
    toast.error('Could not copy to the clipboard')
  }
}

export function AgentsPane() {
  const user = authClient.useSession().data?.user
  const folder = user
  const canManage = true,
    isOwner = true
  const queryClient = useQueryClient()
  const [name, setName] = useState('Agent')
  const [created, setCreated] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const keys = useQuery({
    enabled: Boolean(folder),
    queryKey: ['api-keys', folder?.id],
    queryFn: async () => {
      const result = await authClient.apiKey.list({
        query: { configId: 'user' },
      })
      if (result.error) throw new Error(result.error.message)
      return ((result.data as { apiKeys?: ApiKey[] } | null)?.apiKeys ??
        []) as ApiKey[]
    },
  })

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!folder) return
    setCreating(true)
    const result = await authClient.apiKey.create({
      configId: 'user',
      name,
      prefix: 'otw_',
    })
    setCreating(false)
    if (result.error || !result.data) {
      toast.error('Could not create the key', {
        description: result.error?.message,
      })
      return
    }
    setCreated(result.data.key)
    void queryClient.invalidateQueries({ queryKey: ['api-keys', folder.id] })
  }

  async function revoke(key: ApiKey) {
    const result = await authClient.apiKey.delete({
      keyId: key.id,
      configId: 'user',
    })
    if (result.error) {
      toast.error('Could not revoke the key', {
        description: result.error.message,
      })
      return
    }
    toast.success(`Revoked ${key.name ?? 'the key'}`)
    void queryClient.invalidateQueries({ queryKey: ['api-keys', folder?.id] })
  }

  return (
    <SettingsPageContainer
      title="Agents"
      description="Agents publish and edit documents with the otterdrive CLI, as you or with an API key."
    >
      <SettingsSection title="Command line">
        {commands(location.origin).map((item) => (
          <SettingsRow
            key={item.title}
            title={item.title}
            description={item.description}
          >
            <CopyField
              value={item.command}
              onCopy={() => void copy(item.command, 'Command copied')}
            />
          </SettingsRow>
        ))}
      </SettingsSection>

      <section>
        <SettingsSectionHeader
          title="Your API keys"
          description={
            folder
              ? `For agents acting as ${folder.name}. Existing migrated keys keep their original drive scope.`
              : undefined
          }
        />
        <SettingsGroup>
          {canManage ? (
            <SettingsRow
              title="New key"
              description="It can read, upload and edit documents you can access."
              control={
                <form className="flex items-center gap-2" onSubmit={create}>
                  <Input
                    size="sm"
                    aria-label="Key name"
                    required
                    className="w-44"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <Button size="sm" type="submit" disabled={creating || !name}>
                    Create key
                  </Button>
                </form>
              }
            >
              {created ? (
                <>
                  <p className="mt-3 text-[13px] text-warning-foreground">
                    Copy it now: it won’t be shown again.
                  </p>
                  <CopyField
                    value={created}
                    onCopy={() => void copy(created, 'Key copied')}
                  />
                </>
              ) : null}
            </SettingsRow>
          ) : null}
          {keys.isPending ? (
            <div className="px-4 py-4 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : keys.error ? (
            <div className="px-4 py-4 text-sm text-destructive-foreground">
              {keys.error.message}
            </div>
          ) : keys.data?.length ? (
            keys.data.map((key) => (
              <div key={key.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface text-icon-muted">
                  <KeyRoundIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">
                    {key.name ?? 'Unnamed key'}
                  </div>
                  <div className="truncate text-[13px] text-muted-foreground">
                    <code className="font-mono">{key.start ?? 'otw_'}…</code> ·
                    created{' '}
                    {formatRelative(
                      String(new Date(key.createdAt).toISOString()),
                    )}
                  </div>
                </div>
                {isOwner ? (
                  <Button
                    size="sm"
                    variant="ghost-destructive"
                    onClick={() => void revoke(key)}
                  >
                    Revoke
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="px-4 py-3.5 text-sm text-muted-foreground">
              No keys yet.
            </div>
          )}
        </SettingsGroup>
      </section>
    </SettingsPageContainer>
  )
}
