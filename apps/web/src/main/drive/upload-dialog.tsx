import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpenIcon, UploadIcon, XIcon } from 'lucide-react'
import type { Artifact } from '@otterware/contracts'
import {
  pickEntryPath,
  relativePaths,
  slugify,
  titleFromName,
  uploadDocument,
  type PickedFile,
} from '#/lib/upload-document'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatBytes } from './documents'

/**
 * Upload with a title and slug of your choosing (dropping files anywhere
 * uploads them straight away instead). Asked from anywhere with
 * `requestUpload()`; the home view keeps it mounted.
 */

const UPLOAD_EVENT = 'otterdrive:upload-artifact'

export function requestUpload() {
  window.dispatchEvent(new Event(UPLOAD_EVENT))
}

export function UploadDialogHost({
  team,
  onUploaded,
}: {
  team: { id: string; name: string } | null
  onUploaded: (artifact: Artifact) => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(UPLOAD_EVENT, show)
    return () => window.removeEventListener(UPLOAD_EVENT, show)
  }, [])
  return (
    <UploadDialog
      open={open && team !== null}
      team={team}
      onOpenChange={setOpen}
      onUploaded={onUploaded}
    />
  )
}

function UploadDialog({
  open,
  team,
  onOpenChange,
  onUploaded,
}: {
  open: boolean
  team: { id: string; name: string } | null
  onOpenChange: (open: boolean) => void
  onUploaded: (artifact: Artifact) => void
}) {
  const [files, setFiles] = useState<PickedFile[]>([])
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) return
    setFiles([])
    setTitle('')
    setSlug('')
    setSlugEdited(false)
    setStatus(null)
    setError(null)
  }, [open])

  const totalBytes = useMemo(
    () => files.reduce((sum, item) => sum + item.file.size, 0),
    [files],
  )
  const entryPath = files.length > 0 ? pickEntryPath(files) : null

  function pick(list: FileList | null) {
    if (!list || list.length === 0) return
    const picked = relativePaths(list)
    setFiles(picked)
    setError(null)
    if (!title) {
      const source =
        picked.length === 1
          ? picked[0]!.file.name
          : (list[0]!.webkitRelativePath.split('/')[0] ?? '')
      const suggested = titleFromName(source)
      setTitle(suggested)
      if (!slugEdited) setSlug(slugify(suggested))
    }
  }

  async function upload() {
    if (!team || files.length === 0 || !entryPath) return
    const finalSlug = slug || slugify(title)
    if (!title.trim() || !finalSlug) {
      setError('A title and slug are required.')
      throw new Error('missing title')
    }
    setError(null)
    try {
      const uploaded = await uploadDocument({
        organizationId: team.id,
        files,
        title: title.trim(),
        slug: finalSlug,
        onStatus: setStatus,
      })
      onUploaded(uploaded)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setStatus(null)
      throw reason
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload"
      description={
        <>
          A file or a folder becomes version 1 of a new document in{' '}
          <span className="text-foreground">{team?.name}</span>.
        </>
      }
      confirmLabel={status ? 'Uploading…' : 'Upload'}
      confirmDisabled={files.length === 0 || !title.trim()}
      busy={status !== null}
      onConfirm={upload}
      size="large"
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => pick(event.target.files)}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        // @ts-expect-error non-standard attribute understood by browsers
        webkitdirectory=""
        onChange={(event) => pick(event.target.files)}
      />
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          pick(event.dataTransfer.files)
        }}
        className={cn(
          'flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-input bg-surface-raised/40 px-4 py-5 text-center transition-colors',
          dragging && 'border-focus-ring bg-focus-ring/5',
        )}
      >
        {files.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Drop files or a folder here, or
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => fileInput.current?.click()}>
                <UploadIcon /> Choose files
              </Button>
              <Button size="sm" onClick={() => folderInput.current?.click()}>
                <FolderOpenIcon /> Choose folder
              </Button>
            </div>
          </>
        ) : (
          <div className="flex w-full items-center gap-3 text-left">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">
                {files.length} {files.length === 1 ? 'file' : 'files'} ·{' '}
                {formatBytes(totalBytes)}
              </p>
              <p className="truncate text-[13px] text-muted-foreground">
                Opens <code className="font-mono">{entryPath}</code>
              </p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost-muted"
              aria-label="Change selection"
              disabled={status !== null}
              onClick={() => setFiles([])}
            >
              <XIcon />
            </Button>
          </div>
        )}
      </div>
      <Field label="Title">
        <Input
          value={title}
          disabled={status !== null}
          onChange={(event) => {
            setTitle(event.target.value)
            if (!slugEdited) setSlug(slugify(event.target.value))
          }}
          placeholder="Quarterly report"
        />
      </Field>
      <Field
        label="Slug"
        description="The last part of the document's link."
        error={error}
      >
        <Input
          font="mono"
          value={slug}
          disabled={status !== null}
          onChange={(event) => {
            setSlugEdited(true)
            setSlug(slugify(event.target.value))
          }}
          placeholder="quarterly-report"
        />
      </Field>
      {status ? (
        <p role="status" className="text-[13px] text-muted-foreground">
          {status}
        </p>
      ) : null}
    </Dialog>
  )
}
