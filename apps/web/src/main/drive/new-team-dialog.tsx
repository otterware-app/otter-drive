import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { authClient } from '#/lib/auth-client'
import { slugify } from '#/lib/upload-document'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { announceTeamsChanged, useTeams } from '../teams'

export function NewTeamDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { selectTeam } = useTeams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function create() {
    const trimmed = name.trim()
    const base = slugify(trimmed) || 'team'
    setError(null)
    // Team slugs are global; fall back to a suffixed slug when taken.
    let result = await authClient.organization.create({
      name: trimmed,
      slug: base,
      keepCurrentActiveOrganization: true,
    })
    if (result.error) {
      result = await authClient.organization.create({
        name: trimmed,
        slug: `${base}-${crypto.randomUUID().slice(0, 6)}`,
        keepCurrentActiveOrganization: true,
      })
    }
    if (result.error || !result.data) {
      const message = result.error?.message ?? 'Could not create the team.'
      setError(message)
      throw new Error(message)
    }
    announceTeamsChanged()
    await selectTeam(result.data.id)
    setName('')
    toast.success(`Created ${trimmed}`)
    await navigate({ to: '/home' })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
      title="New team"
      description="A team has its own documents, members and agent keys."
      confirmLabel="Create team"
      confirmDisabled={!name.trim()}
      onConfirm={create}
      size="small"
    >
      <Field label="Name" error={error}>
        <Input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Marketing"
        />
      </Field>
    </Dialog>
  )
}
