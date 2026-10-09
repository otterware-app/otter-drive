import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  driveStorageResponseSchema,
  storageBackendResponseSchema,
  type CreateStorageBackendInput,
  type StorageBackend,
  type StorageLocation,
} from '@otterware/contracts'
import { api } from '#/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RowSelect } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { formatBytes, formatRelative } from '../drive/documents'
import { driveForFolder, folderLabel, useFolders } from '../folders'
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from './settings-ui'

/**
 * Settings → Storage: where the drive keeps its documents. Otterware's own
 * storage, or buckets its owner connects (Amazon S3, Google Cloud Storage,
 * Azure Blob Storage, Cloudflare R2, any S3-compatible service), one of them
 * taking new uploads. Files stay where they were written.
 */
export function StoragePane() {
  const { folders, activeFolder } = useFolders()
  const drive = driveForFolder(folders, activeFolder)
  const owner = Boolean(drive && !drive.parentId && drive.role === 'owner')
  const queryClient = useQueryClient()
  const queryKey = ['drive-storage', drive?.id]
  const query = useQuery({
    queryKey,
    enabled: owner,
    queryFn: async () =>
      driveStorageResponseSchema.parse(
        await api<unknown>(`/api/v1/folders/${drive!.id}/storage`),
      ).data,
  })
  const [connectOpen, setConnectOpen] = useState(false)
  const [rotating, setRotating] = useState<StorageBackend | null>(null)
  const [checking, setChecking] = useState<string | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey })
  const base = drive ? `/api/v1/folders/${drive.id}/storage` : ''

  async function setDefault(value: string) {
    try {
      await api(base, {
        method: 'PATCH',
        body: JSON.stringify({
          defaultBackendId: value === 'otterware' ? null : value,
        }),
      })
      await refresh()
      toast.success('New uploads will go there')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  async function check(backend: StorageBackend) {
    setChecking(backend.id)
    try {
      await api(`${base}/${backend.id}/verify`, { method: 'POST' })
      await refresh()
      toast.success(`${backend.name} works`, {
        description: 'Drive wrote, read and deleted a test file.',
      })
    } catch (error) {
      toast.error(`${backend.name} failed its check`, {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setChecking(null)
    }
  }

  async function disconnect(backend: StorageBackend) {
    if (
      !confirm(
        `Disconnect ${backend.name}? Drive forgets its credentials; nothing in the bucket is deleted.`,
      )
    )
      return
    try {
      await api(`${base}/${backend.id}`, { method: 'DELETE' })
      await refresh()
      toast.success(`Disconnected ${backend.name}`)
    } catch (error) {
      toast.error('Could not disconnect it', {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const data = query.data
  return (
    <SettingsPageContainer
      title="Storage"
      description={
        drive
          ? `Where ${folderLabel(drive)} keeps its documents. Connect your own bucket to keep them in your cloud account.`
          : 'Where a drive keeps its documents.'
      }
      action={
        owner ? (
          <Button variant="accent" onClick={() => setConnectOpen(true)}>
            Connect storage
          </Button>
        ) : null
      }
    >
      {!owner ? (
        <p className="px-4 text-sm text-muted-foreground">
          Only the drive’s owner manages where it stores documents.
        </p>
      ) : query.error ? (
        <p role="alert" className="px-4 text-sm text-destructive-foreground">
          {query.error.message}
        </p>
      ) : data ? (
        <>
          <SettingsSection title="New uploads">
            <SettingsRow
              title="Store new documents in"
              description="Changing this moves nothing: each version stays where it was written."
              control={
                <RowSelect
                  ariaLabel="Storage for new uploads"
                  value={data.defaultBackendId ?? 'otterware'}
                  options={[
                    { value: 'otterware', label: 'Otterware storage' },
                    ...data.backends.map((backend) => ({
                      value: backend.id,
                      label: backend.name,
                    })),
                  ]}
                  onValueChange={(value) => void setDefault(value)}
                />
              }
            />
          </SettingsSection>
          <SettingsSection title="Connected storage">
            <SettingsRow
              title="Otterware storage"
              description={`Built in · ${usage(data.otterware.fileCount, data.otterware.byteSize)}`}
            />
            {data.backends.map((backend) => (
              <SettingsRow
                key={backend.id}
                title={
                  <span className="flex items-center gap-2">
                    {backend.name}
                    {backend.isDefault ? (
                      <span className="rounded-md bg-accent-surface px-1.5 py-0.5 text-2xs text-muted-foreground">
                        New uploads
                      </span>
                    ) : null}
                  </span>
                }
                description={[
                  describeLocation(backend.location),
                  usage(backend.fileCount, backend.byteSize),
                  backend.verifiedAt
                    ? `checked ${formatRelative(backend.verifiedAt)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                control={
                  <>
                    <Button
                      size="sm"
                      disabled={checking === backend.id}
                      onClick={() => void check(backend)}
                    >
                      {checking === backend.id ? 'Checking…' : 'Check'}
                    </Button>
                    <Button size="sm" onClick={() => setRotating(backend)}>
                      Replace keys
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost-destructive"
                      onClick={() => void disconnect(backend)}
                    >
                      Disconnect
                    </Button>
                  </>
                }
              />
            ))}
          </SettingsSection>
        </>
      ) : null}
      {drive && owner ? (
        <>
          <ConnectStorageDialog
            open={connectOpen}
            onOpenChange={setConnectOpen}
            base={base}
            onConnected={() => void refresh()}
          />
          <RotateKeysDialog
            backend={rotating}
            onOpenChange={(open) => !open && setRotating(null)}
            base={base}
            onRotated={() => void refresh()}
          />
        </>
      ) : null}
    </SettingsPageContainer>
  )
}

function usage(files: number, bytes: number) {
  return `${files} ${files === 1 ? 'file' : 'files'}, ${formatBytes(bytes)}`
}

function describeLocation(location: StorageLocation): string {
  const prefix = location.prefix ? `/${location.prefix.replace(/\/$/, '')}` : ''
  switch (location.provider) {
    case 's3':
      return location.endpoint
        ? `${location.bucket}${prefix} at ${new URL(location.endpoint).host}`
        : `Amazon S3 · ${location.bucket}${prefix} (${location.region})`
    case 'gcs':
      return `Google Cloud Storage · ${location.bucket}${prefix}`
    case 'azure':
      return `Azure · ${location.account}/${location.container}${prefix}`
  }
}

/** The services the form knows; the last three are S3 underneath. */
const PRESETS = [
  { value: 'aws', label: 'Amazon S3' },
  { value: 'gcs', label: 'Google Cloud Storage' },
  { value: 'azure', label: 'Azure Blob Storage' },
  { value: 'r2', label: 'Cloudflare R2' },
  { value: 'other', label: 'Other S3-compatible' },
] as const
type Preset = (typeof PRESETS)[number]['value']

const EMPTY = {
  name: '',
  bucket: '',
  region: '',
  endpoint: '',
  r2Account: '',
  prefix: 'otterdrive/',
  accessKeyId: '',
  secretAccessKey: '',
  account: '',
  container: '',
  accountKey: '',
  sasToken: '',
}

function ConnectStorageDialog({
  open,
  onOpenChange,
  base,
  onConnected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  base: string
  onConnected: () => void
}) {
  const [preset, setPreset] = useState<Preset>('aws')
  const [form, setForm] = useState(EMPTY)
  const [makeDefault, setMakeDefault] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const set =
    (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }))

  const name =
    form.name.trim() ||
    (preset === 'azure' ? form.container : form.bucket).trim()
  const input = (): CreateStorageBackendInput => {
    const common = { name, prefix: form.prefix, makeDefault }
    if (preset === 'gcs')
      return {
        ...common,
        provider: 'gcs',
        bucket: form.bucket,
        accessKeyId: form.accessKeyId,
        secretAccessKey: form.secretAccessKey,
      }
    if (preset === 'azure')
      return {
        ...common,
        provider: 'azure',
        account: form.account,
        container: form.container,
        ...(form.sasToken.trim()
          ? { sasToken: form.sasToken }
          : { accountKey: form.accountKey }),
      }
    return {
      ...common,
      provider: 's3',
      bucket: form.bucket,
      region: preset === 'r2' ? 'auto' : form.region.trim() || 'us-east-1',
      ...(preset === 'r2'
        ? {
            endpoint: `https://${form.r2Account.trim()}.r2.cloudflarestorage.com`,
          }
        : preset === 'other'
          ? { endpoint: form.endpoint }
          : {}),
      accessKeyId: form.accessKeyId,
      secretAccessKey: form.secretAccessKey,
    }
  }
  const complete =
    Boolean(name) &&
    (preset === 'azure'
      ? Boolean(
          form.account.trim() &&
          form.container.trim() &&
          (form.accountKey.trim() || form.sasToken.trim()),
        )
      : Boolean(
          form.bucket.trim() &&
          form.accessKeyId.trim() &&
          form.secretAccessKey.trim() &&
          (preset !== 'r2' || form.r2Account.trim()) &&
          (preset !== 'other' || form.endpoint.trim()),
        ))

  async function connect() {
    setError(null)
    try {
      const result = storageBackendResponseSchema.parse(
        await api<unknown>(base, {
          method: 'POST',
          body: JSON.stringify(input()),
        }),
      ).data
      setForm(EMPTY)
      onConnected()
      toast.success(`Connected ${result.name}`, {
        description: makeDefault
          ? 'New uploads go there now.'
          : 'Choose it for new uploads whenever you like.',
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      throw reason
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
      title="Connect storage"
      description="Drive checks the bucket (it writes, reads and deletes a small test file) before connecting it. Credentials are encrypted and never shown again."
      confirmLabel="Check and connect"
      confirmDisabled={!complete}
      onConfirm={connect}
    >
      <div className="flex flex-col gap-3">
        <Field label="Service">
          <RowSelect
            variant="field"
            ariaLabel="Service"
            value={preset}
            options={PRESETS.map((item) => ({ ...item }))}
            onValueChange={(value) => setPreset(value as Preset)}
          />
        </Field>
        {preset === 'azure' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Storage account">
              <Input value={form.account} onChange={set('account')} />
            </Field>
            <Field label="Container">
              <Input value={form.container} onChange={set('container')} />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bucket">
              <Input value={form.bucket} onChange={set('bucket')} />
            </Field>
            {preset === 'aws' || preset === 'other' ? (
              <Field label="Region">
                <Input
                  value={form.region}
                  onChange={set('region')}
                  placeholder="us-east-1"
                />
              </Field>
            ) : preset === 'r2' ? (
              <Field label="Account ID">
                <Input value={form.r2Account} onChange={set('r2Account')} />
              </Field>
            ) : null}
          </div>
        )}
        {preset === 'other' ? (
          <Field label="Endpoint">
            <Input
              value={form.endpoint}
              onChange={set('endpoint')}
              placeholder="https://s3.example.com"
            />
          </Field>
        ) : null}
        {preset === 'azure' ? (
          <>
            <Field
              label="Account key"
              description="Or leave it empty and give a SAS token for the container."
            >
              <Input
                type="password"
                autoComplete="off"
                value={form.accountKey}
                onChange={set('accountKey')}
              />
            </Field>
            <Field label="SAS token">
              <Input
                type="password"
                autoComplete="off"
                value={form.sasToken}
                onChange={set('sasToken')}
                placeholder="sv=…&sig=…"
              />
            </Field>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={preset === 'gcs' ? 'HMAC access ID' : 'Access key ID'}
            >
              <Input
                autoComplete="off"
                value={form.accessKeyId}
                onChange={set('accessKeyId')}
              />
            </Field>
            <Field label="Secret">
              <Input
                type="password"
                autoComplete="off"
                value={form.secretAccessKey}
                onChange={set('secretAccessKey')}
              />
            </Field>
          </div>
        )}
        {preset === 'gcs' ? (
          <p className="text-xs text-muted-foreground">
            Create an HMAC key for a service account under Cloud Storage →
            Settings → Interoperability.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Folder in the bucket">
            <Input
              value={form.prefix}
              onChange={set('prefix')}
              placeholder="otterdrive/"
            />
          </Field>
          <Field label="Name in Drive">
            <Input
              value={form.name}
              onChange={set('name')}
              placeholder={
                (preset === 'azure' ? form.container : form.bucket) ||
                'Company bucket'
              }
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={makeDefault}
            onChange={(event) => setMakeDefault(event.target.checked)}
          />
          Store new uploads here
        </label>
        {error ? (
          <p role="alert" className="text-xs text-destructive-foreground">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}

function RotateKeysDialog({
  backend,
  onOpenChange,
  base,
  onRotated,
}: {
  backend: StorageBackend | null
  onOpenChange: (open: boolean) => void
  base: string
  onRotated: () => void
}) {
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [error, setError] = useState<string | null>(null)
  const azure = backend?.location.provider === 'azure'

  async function rotate() {
    if (!backend) return
    setError(null)
    try {
      await api(`${base}/${backend.id}`, {
        method: 'PATCH',
        body: JSON.stringify(
          azure
            ? first.trim()
              ? { accountKey: first }
              : { sasToken: second }
            : { accessKeyId: first, secretAccessKey: second },
        ),
      })
      setFirst('')
      setSecond('')
      onRotated()
      toast.success('New keys work and are in use')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      throw reason
    }
  }

  return (
    <Dialog
      open={Boolean(backend)}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
      title={`Replace keys for ${backend?.name ?? ''}`}
      description="Drive checks the new keys before it uses them; the old ones keep working until then."
      confirmLabel="Check and replace"
      confirmDisabled={
        azure
          ? !first.trim() && !second.trim()
          : !first.trim() || !second.trim()
      }
      onConfirm={rotate}
      size="small"
    >
      <div className="flex flex-col gap-3">
        <Field label={azure ? 'Account key' : 'Access key ID'}>
          <Input
            type={azure ? 'password' : 'text'}
            autoComplete="off"
            value={first}
            onChange={(event) => setFirst(event.target.value)}
          />
        </Field>
        <Field label={azure ? 'Or a SAS token' : 'Secret'}>
          <Input
            type="password"
            autoComplete="off"
            value={second}
            onChange={(event) => setSecond(event.target.value)}
          />
        </Field>
        {error ? (
          <p role="alert" className="text-xs text-destructive-foreground">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}
