import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  LinkIcon,
  LockIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react'
import {
  peopleResponseSchema,
  sharingResponseSchema,
  type AccessEntry,
  type Person,
  type ShareRole,
  type Sharing,
} from '@otterware/contracts'
import { api } from '#/lib/api'
import { authClient } from '#/lib/auth-client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { announceSharingChanged } from '../folders'
import { FolderMark, UserAvatar } from './folder-mark'

/**
 * Google Drive's share dialog, asked from anywhere with `requestShare()`
 * (a row's menu, the viewer's Share button, a folder) and kept mounted by the
 * home view: add people by email as viewers or editors, see and change who
 * has access (including through the folders above), and choose whether
 * anyone with the link can open it. A shared drive itself shares by managing
 * its members.
 */

export type ShareTarget =
  | { type: 'folder'; id: string; name: string }
  | {
      type: 'artifact'
      id: string
      name: string
      /** The document's own link, copied while only people with access can open it. */
      url: string
      /** The folder you reach it through, if it's one of yours. */
      folderId?: string | undefined
    }

const SHARE_EVENT = 'otterdrive:share'

export function requestShare(target: ShareTarget) {
  window.dispatchEvent(new CustomEvent(SHARE_EVENT, { detail: target }))
}

export function ShareDialogHost() {
  const [target, setTarget] = useState<ShareTarget | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = (event: Event) => {
      setTarget((event as CustomEvent<ShareTarget>).detail)
      setOpen(true)
    }
    window.addEventListener(SHARE_EVENT, show)
    return () => window.removeEventListener(SHARE_EVENT, show)
  }, [])
  return (
    <Dialog open={open && target !== null} onOpenChange={setOpen}>
      {target ? (
        <ShareDialogContent
          key={`${target.type}:${target.id}`}
          target={target}
          onDone={() => setOpen(false)}
        />
      ) : null}
    </Dialog>
  )
}

const ROLE_LABEL: Record<ShareRole | 'owner', string> = {
  viewer: 'Viewer',
  editor: 'Editor',
  owner: 'Owner',
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function sharingPath(target: ShareTarget) {
  return target.type === 'folder'
    ? `/api/v1/folders/${encodeURIComponent(target.id)}/sharing`
    : `/api/v1/artifacts/${encodeURIComponent(target.id)}/sharing`
}

function folderUrl(id: string) {
  return `${location.origin}/home?folder=${encodeURIComponent(id)}`
}

async function copy(value: string, message = 'Link copied') {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(message)
  } catch {
    toast.error('Could not copy to the clipboard')
  }
}

function listNames(people: string[]) {
  if (people.length <= 2) return people.join(' and ')
  return `${people.slice(0, 2).join(', ')} and ${people.length - 2} more`
}

function ShareDialogContent({
  target,
  onDone,
}: {
  target: ShareTarget
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const session = authClient.useSession()
  const me = session.data?.user
  const path = sharingPath(target)
  const folderId = target.type === 'artifact' ? target.folderId : undefined
  const queryKey = useMemo(
    () => ['sharing', target.type, target.id] as const,
    [target.type, target.id],
  )
  const sharing = useQuery({
    queryKey,
    queryFn: async () =>
      sharingResponseSchema.parse(await api<unknown>(path, { folderId })).data,
  })
  const [emails, setEmails] = useState<string[]>([])
  // What's typed but not yet a chip: a complete address counts as added.
  const [draft, setDraft] = useState('')
  const typed = EMAIL.test(draft.trim()) ? draft.trim().toLowerCase() : null
  const adding = typed && !emails.includes(typed) ? [...emails, typed] : emails
  const [role, setRole] = useState<ShareRole>('editor')
  const [notify, setNotify] = useState(true)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const data = sharing.data
  const isDrive = data?.resource.folderKind === 'shared'
  const isMyDrive = data?.resource.folderKind === 'personal'

  /** Runs a change, taking the updated access the server returns. */
  async function change(
    request: () => Promise<unknown>,
  ): Promise<{ notified?: boolean | undefined } | null> {
    setBusy(true)
    try {
      const response = sharingResponseSchema.parse(await request())
      queryClient.setQueryData(queryKey, response.data)
      announceSharingChanged()
      void queryClient.invalidateQueries({ queryKey: ['artifacts'] })
      return response
    } catch (reason) {
      toast.error('Couldn’t change sharing', {
        description: reason instanceof Error ? reason.message : String(reason),
      })
      return null
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    if (!adding.length || !data) return
    const added = adding
    const result = await change(() =>
      api(`${path}/people`, {
        method: 'POST',
        folderId,
        body: JSON.stringify({
          emails: added,
          role,
          notify,
          ...(message.trim() ? { message: message.trim() } : {}),
        }),
      }),
    )
    if (!result) return
    setEmails([])
    setDraft('')
    setMessage('')
    const names = listNames(added)
    if (isDrive) toast.success(`Added ${names} to ${data.resource.name}`)
    else if (result.notified) toast.success(`Shared with ${names}`)
    else
      toast.success(`Shared with ${names}`, {
        description: notify
          ? 'They weren’t emailed, so send them the link.'
          : 'Send them the link to open it.',
        action: { label: 'Copy link', onClick: () => void copyLink() },
      })
  }

  function copyLink() {
    if (data?.link) return copy(data.link.url)
    return copy(target.type === 'artifact' ? target.url : folderUrl(target.id))
  }

  async function setPersonRole(entry: AccessEntry, next: ShareRole) {
    if (next === entry.role) return
    await change(() =>
      api(`${path}/people/${encodeURIComponent(entry.id)}`, {
        method: 'PATCH',
        folderId,
        body: JSON.stringify({ role: next }),
      }),
    )
  }

  async function remove(entry: AccessEntry) {
    const self = Boolean(me && entry.userId === me.id)
    // Leaving answers 204 and ends the dialog: you may no longer see it.
    if (self) {
      setBusy(true)
      try {
        await api(`${path}/people/${encodeURIComponent(entry.id)}`, {
          method: 'DELETE',
          folderId,
        })
        announceSharingChanged()
        toast.success(`Removed “${target.name}” from Shared with me`)
        onDone()
      } catch (reason) {
        toast.error('Couldn’t remove your access', {
          description:
            reason instanceof Error ? reason.message : String(reason),
        })
      } finally {
        setBusy(false)
      }
      return
    }
    await change(() =>
      api(`${path}/people/${encodeURIComponent(entry.id)}`, {
        method: 'DELETE',
        folderId,
      }),
    )
  }

  async function setLink(next: ShareRole | null) {
    await change(() =>
      api(`${path}/link`, {
        method: next ? 'PUT' : 'DELETE',
        folderId,
        ...(next ? { body: JSON.stringify({ role: next }) } : {}),
      }),
    )
  }

  const title = isDrive
    ? `Manage members of “${target.name}”`
    : `Share “${target.name}”`

  return (
    <DialogContent size="large" className="max-h-[min(85vh,44rem)]">
      <DialogHeader className="pb-3">
        <DialogTitle className="truncate pe-6">{title}</DialogTitle>
        <DialogDescription>
          {isDrive
            ? 'Members can open everything in this shared drive. Editors also add and change it.'
            : isMyDrive
              ? 'My Drive is yours alone. Share the folders and documents in it instead.'
              : data && !data.canShare
                ? 'You can see who has access. Ask an editor to share it with more people.'
                : target.type === 'folder'
                  ? 'People get access to the folder and everything in it.'
                  : 'People get access to this document.'}
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 pb-1">
        {data?.canShare ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start gap-2">
              <PeopleInput
                emails={emails}
                onEmailsChange={setEmails}
                text={draft}
                onTextChange={setDraft}
                exclude={[
                  data.owner.email,
                  ...data.people.map((entry) => entry.email),
                ]}
                disabled={busy}
                onSubmit={() => void share()}
              />
              <RoleMenu
                value={role}
                onChange={(next) => next && setRole(next)}
                disabled={busy}
                className="h-9"
              />
            </div>
            {adding.length && !isDrive ? (
              <div className="flex flex-col gap-2 animate-[dialog-fade-in_140ms_ease-out]">
                <label className="flex w-fit items-center gap-2 text-[13px] text-foreground select-none">
                  <input
                    type="checkbox"
                    checked={notify}
                    onChange={(event) => setNotify(event.target.checked)}
                    className="size-3.5 accent-(--color-primary)"
                  />
                  Notify people
                </label>
                {notify ? (
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Message"
                    rows={2}
                    maxLength={1000}
                    aria-label="Message"
                    className="w-full resize-none rounded-lg border border-border/70 bg-surface-raised/60 px-2.75 py-2 text-sm text-foreground outline-none placeholder:text-placeholder focus-visible:border-focus-ring/60 focus-visible:bg-canvas focus-visible:ring-[3px] focus-visible:ring-focus-ring/16"
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <section aria-label="People with access">
          <h3 className="mb-1.5 text-sm font-medium text-foreground">
            {isDrive ? 'Members' : 'People with access'}
          </h3>
          {sharing.error ? (
            <p className="py-3 text-sm text-destructive-foreground">
              {sharing.error.message}
            </p>
          ) : !data ? (
            <PeopleSkeleton />
          ) : (
            <ul className="-mx-2 flex flex-col">
              <PersonRow
                person={data.owner}
                you={data.owner.userId === me?.id}
                trailing={
                  <span className="pe-2 text-[13px] text-muted-foreground">
                    Owner
                  </span>
                }
              />
              {!isDrive && data.drive.kind === 'shared' ? (
                <li className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                  <FolderMark
                    folder={{
                      id: data.drive.id,
                      name: data.drive.name,
                      kind: 'shared',
                    }}
                    className="size-8 rounded-full text-[11px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-foreground">
                      Members of {data.drive.name}
                    </div>
                    <div className="truncate text-[13px] text-muted-foreground">
                      {data.drive.memberCount}{' '}
                      {data.drive.memberCount === 1 ? 'person' : 'people'}
                    </div>
                  </div>
                  <span className="pe-2 text-[13px] text-muted-foreground">
                    Shared drive
                  </span>
                </li>
              ) : null}
              {data.people.map((entry) => {
                const you = Boolean(me && entry.userId === me.id)
                // You can leave a folder or document, not a drive.
                const editable =
                  !entry.inheritedFrom && (data.canShare || (you && !isDrive))
                return (
                  <PersonRow
                    key={entry.id}
                    person={entry}
                    you={you}
                    note={
                      entry.inheritedFrom
                        ? `Access from “${entry.inheritedFrom.name}”`
                        : entry.viaLink
                          ? 'Opened the link'
                          : entry.userId
                            ? null
                            : 'Hasn’t signed in yet'
                    }
                    trailing={
                      editable ? (
                        <RoleMenu
                          value={entry.role}
                          disabled={busy}
                          roles={data.canShare ? undefined : []}
                          removeLabel={
                            you ? 'Remove my access' : 'Remove access'
                          }
                          onChange={(next) =>
                            void (next
                              ? setPersonRole(entry, next)
                              : remove(entry))
                          }
                          ghost
                        />
                      ) : (
                        <span className="pe-2 text-[13px] text-muted-foreground">
                          {ROLE_LABEL[entry.role]}
                        </span>
                      )
                    }
                  />
                )
              })}
            </ul>
          )}
        </section>

        {data && !isDrive && !isMyDrive ? (
          <section aria-label="General access">
            <h3 className="mb-1.5 text-sm font-medium text-foreground">
              General access
            </h3>
            <GeneralAccess
              sharing={data}
              busy={busy}
              onChange={(next) => void setLink(next)}
            />
          </section>
        ) : null}
      </div>

      <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
        <Button
          variant="outline"
          disabled={!data || isMyDrive}
          onClick={() => void copyLink()}
        >
          <LinkIcon className="size-4" /> Copy link
        </Button>
        {adding.length ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEmails([])
                setDraft('')
              }}
            >
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={busy}
              onClick={() => void share()}
            >
              {isDrive ? 'Add' : notify ? 'Send' : 'Share'}
            </Button>
          </div>
        ) : (
          <Button variant="accent" onClick={onDone}>
            Done
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  )
}

function PersonRow({
  person,
  you,
  note,
  trailing,
}: {
  person: Person
  you: boolean
  note?: string | null
  trailing: ReactNode
}) {
  const name = person.name || person.email
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-foreground/[0.03]">
      <UserAvatar
        user={{ name: person.name, email: person.email, image: person.image }}
        className="size-8 text-[11px]"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">
          {name}
          {you ? <span className="text-muted-foreground"> (you)</span> : null}
        </div>
        <div className="truncate text-[13px] text-muted-foreground">
          {person.name ? person.email : null}
          {person.name && note ? ' · ' : null}
          {note}
        </div>
      </div>
      {trailing}
    </li>
  )
}

function PeopleSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-1.5" aria-hidden>
      {[0, 1].map((index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="size-8 animate-skeleton rounded-full bg-accent-surface" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3 w-32 animate-skeleton rounded-full bg-secondary" />
            <div className="h-2.5 w-44 animate-skeleton rounded-full bg-accent-surface" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Viewer or Editor, and Remove access: a quiet pill in each person's row
 * (Google's), or the role for the people being added.
 */
function RoleMenu({
  value,
  onChange,
  disabled,
  ghost = false,
  roles = ['viewer', 'editor'],
  removeLabel,
  className,
}: {
  value: ShareRole
  /** null removes. */
  onChange: (role: ShareRole | null) => void
  disabled?: boolean
  ghost?: boolean
  roles?: ShareRole[] | undefined
  removeLabel?: string
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <button
            type="button"
            className={cn(
              'flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-64 data-popup-open:bg-accent-surface',
              ghost
                ? 'hover:bg-accent-surface'
                : 'border border-border/70 bg-surface-raised/60 hover:bg-surface-raised',
              className,
            )}
          />
        }
      >
        {ROLE_LABEL[value]}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {roles.map((role) => (
          <DropdownMenuItem
            key={role}
            icon={
              role === value ? (
                <CheckIcon className="text-foreground" />
              ) : (
                <span className="size-4" />
              )
            }
            onClick={() => onChange(role)}
            className="h-auto py-1.5"
          >
            <span className="block">{ROLE_LABEL[role]}</span>
            <span className="block text-xs text-muted-foreground">
              {role === 'viewer'
                ? 'Opens and downloads'
                : 'Also edits, uploads versions and shares'}
            </span>
          </DropdownMenuItem>
        ))}
        {removeLabel ? (
          <>
            {roles.length ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant="destructive"
              icon={<span className="size-4" />}
              onClick={() => onChange(null)}
            >
              {removeLabel}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Restricted, or anyone with the link (Google's General access). */
function GeneralAccess({
  sharing,
  busy,
  onChange,
}: {
  sharing: Sharing
  busy: boolean
  /** A role turns the link on; null turns it off. */
  onChange: (role: ShareRole | null) => void
}) {
  const link = sharing.link
  const where =
    sharing.drive.kind === 'shared'
      ? `members of ${sharing.drive.name} and the people added`
      : 'the people added'
  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full',
            link
              ? 'bg-success/12 text-success-foreground'
              : 'bg-accent-surface text-muted-foreground',
          )}
        >
          {link ? (
            <GlobeIcon className="size-4" />
          ) : (
            <LockIcon className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          {sharing.canShare ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={busy}
                render={
                  <button
                    type="button"
                    className="-ms-1.5 flex h-6 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-foreground outline-none hover:bg-accent-surface focus-visible:ring-2 focus-visible:ring-focus-ring data-popup-open:bg-accent-surface"
                  />
                }
              >
                {link ? 'Anyone with the link' : 'Restricted'}
                <ChevronDownIcon className="size-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-64">
                <DropdownMenuItem
                  icon={<LockIcon />}
                  onClick={() => link && onChange(null)}
                  className="h-auto py-1.5"
                >
                  <span className="block">Restricted</span>
                  <span className="block text-xs text-muted-foreground">
                    Only people with access can open it
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<GlobeIcon />}
                  onClick={() => !link && onChange('viewer')}
                  className="h-auto py-1.5"
                >
                  <span className="block">Anyone with the link</span>
                  <span className="block text-xs text-muted-foreground">
                    Anyone who signs in with the link can open it
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="text-sm font-medium text-foreground">
              {link ? 'Anyone with the link' : 'Restricted'}
            </div>
          )}
          <div className="text-[13px] text-muted-foreground">
            {link
              ? `Anyone with an Otter account who opens the link can ${link.role === 'editor' ? 'edit' : 'view'}`
              : `Only ${where} can open it`}
          </div>
        </div>
        {link ? (
          sharing.canShare ? (
            <RoleMenu
              value={link.role}
              disabled={busy}
              onChange={(next) => next && onChange(next)}
              ghost
            />
          ) : (
            <span className="pe-2 text-[13px] text-muted-foreground">
              {ROLE_LABEL[link.role]}
            </span>
          )
        ) : null}
      </div>
      {sharing.inheritedLink ? (
        <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <UsersIcon className="size-3.5 shrink-0" />
          Anyone with the link to “{sharing.inheritedLink.folderName}” can also{' '}
          {sharing.inheritedLink.role === 'editor' ? 'edit' : 'view'} it.
        </p>
      ) : null}
    </div>
  )
}

/**
 * Email addresses as chips (Google's): type or paste them, separated by
 * spaces, commas or Enter; pick a suggestion from the people you work with.
 */
function PeopleInput({
  emails,
  onEmailsChange,
  text,
  onTextChange: setText,
  exclude,
  disabled,
  onSubmit,
}: {
  emails: string[]
  onEmailsChange: (emails: string[]) => void
  /** What's typed but not yet a chip. */
  text: string
  onTextChange: (text: string) => void
  /** Already have access; not suggested. */
  exclude: string[]
  disabled: boolean
  /** Enter on an empty field shares. */
  onSubmit: () => void
}) {
  const [focused, setFocused] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [invalid, setInvalid] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const query = text.trim().toLowerCase()
  const people = useQuery({
    queryKey: ['people', query],
    queryFn: async () =>
      peopleResponseSchema.parse(
        await api<unknown>(`/api/v1/people?q=${encodeURIComponent(query)}`),
      ).data,
    enabled: focused && Boolean(query),
    staleTime: 60_000,
  })
  const taken = new Set([...exclude, ...emails].map((e) => e.toLowerCase()))
  const suggestions = (people.data ?? [])
    .filter((person) => !taken.has(person.email.toLowerCase()))
    .slice(0, 5)
  const showSuggestions = focused && Boolean(query) && suggestions.length > 0
  const active = Math.min(highlight, suggestions.length - 1)

  useEffect(() => inputRef.current?.focus(), [])

  function add(values: string[]) {
    const next = [...emails]
    const rejected: string[] = []
    for (const raw of values) {
      const email = raw.trim().replace(/^<|>$/g, '').toLowerCase()
      if (!email) continue
      if (!EMAIL.test(email)) rejected.push(raw.trim())
      else if (!next.includes(email)) next.push(email)
    }
    onEmailsChange(next)
    setInvalid(
      rejected.length ? `“${rejected[0]}” isn’t an email address` : null,
    )
    setText(rejected.join(' '))
    setHighlight(0)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' && showSuggestions) {
      event.preventDefault()
      setHighlight((active + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp' && showSuggestions) {
      event.preventDefault()
      setHighlight((active - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (showSuggestions && query) add([suggestions[active]!.email])
      else if (text.trim()) add([text])
      else if (emails.length) onSubmit()
    } else if ((event.key === ',' || event.key === ' ') && text.trim()) {
      event.preventDefault()
      add([text])
    } else if (event.key === 'Backspace' && !text && emails.length) {
      onEmailsChange(emails.slice(0, -1))
    } else if (event.key === 'Escape' && (text || showSuggestions)) {
      // Clear the field before Escape closes the dialog.
      event.stopPropagation()
      setText('')
      setFocused(false)
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault()
            inputRef.current?.focus()
          }
        }}
        className={cn(
          'flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-surface-raised/60 px-1.5 py-1',
          focused &&
            'border-focus-ring/60 bg-canvas ring-[3px] ring-focus-ring/16',
          invalid && 'border-destructive/36',
        )}
      >
        {emails.map((email) => (
          <span
            key={email}
            className="flex h-6 max-w-full items-center gap-1 rounded-full bg-accent-surface ps-2 pe-1 text-[13px] text-foreground"
          >
            <span className="truncate">{email}</span>
            <button
              type="button"
              aria-label={`Remove ${email}`}
              disabled={disabled}
              onClick={() => onEmailsChange(emails.filter((e) => e !== email))}
              className="flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          value={text}
          disabled={disabled}
          placeholder={emails.length ? '' : 'Add people by email'}
          aria-label="Add people by email"
          aria-invalid={invalid ? true : undefined}
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={listId}
          aria-activedescendant={
            showSuggestions ? `${listId}-${active}` : undefined
          }
          onChange={(event) => {
            setText(event.target.value)
            setInvalid(null)
            setHighlight(0)
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text')
            if (/[\s,;]/.test(pasted.trim())) {
              event.preventDefault()
              add(pasted.split(/[\s,;]+/))
            }
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            if (text.trim() && EMAIL.test(text.trim())) add([text])
          }}
          className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-placeholder"
        />
      </div>
      {invalid ? (
        <p role="alert" className="mt-1 text-xs text-destructive-foreground">
          {invalid}
        </p>
      ) : null}
      {showSuggestions ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="dropdown-glass absolute inset-x-0 top-[calc(100%+4px)] z-10 rounded-xl p-1.5 shadow-[0_16px_40px_-18px_rgb(0_0_0/55%)]"
        >
          {suggestions.map((person, index) => (
            <li
              key={person.email}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setHighlight(index)}
              onClick={() => add([person.email])}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5',
                index === active && 'bg-foreground/[0.07]',
              )}
            >
              <UserAvatar user={person} className="size-6 text-[9px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">
                  {person.name || person.email}
                </span>
                {person.name ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {person.email}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
