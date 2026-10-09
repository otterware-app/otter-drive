# Otter Drive development notes

- Use pnpm workspaces; do not add Turborepo unless task volume demonstrates a need.
- Keep all public API request/response schemas in `packages/contracts`.
- Artifact files and published versions are immutable. Updates always create a version.
- Raw uploaded content must be served from a cookie-isolated origin.
- Do not expose Cloudflare, D1, R2, OAuth, or Better Auth secrets to the CLI.
- Merging to `main` applies D1 migrations, then deploys. Write each migration to
  work with the Worker that's live (expand now, contract in a later release).

## The web app (`apps/web/src`)

Laid out like Otter Mail in a browser tab (the content panel fills the page
beside the rail, rounded only against it), with no hover or state
transitions: everything changes instantly. Styled like Otter Mail (its design tokens, in
`styles.css`):

- `components/ui/`: primitives in the Otter Mail style (button, menu, dialog,
  select, input, field, tooltip, toast, empty state), on Base UI.
- `main/`: the app. `home-view.tsx` is the window (drive rail, list, main
  pane; a sidebar only for Settings). Folders are navigated in the list
  itself: breadcrumbs with the open folder's menu, Up (⌥↑), folder rows, and
  filter chips (`drive/list-filters.tsx`). `drive/` holds documents (list,
  viewer, editor, palette, dialogs); `settings/` the Settings panes:
  Account (yours), then each of your drives with its own pages (General,
  Members, Storage; picking one opens that drive); `keybindings/` the shortcuts;
  `auth/` the sign-in pages' shell; `folders.ts` the drives, recursive folders,
  the open folder and Shared with me. `drive/share-dialog.tsx` is the Share
  dialog for folders, documents and shared drive members.
- Access (`server/folders.ts` `folderAccess`, `server/access.ts`): a folder's
  role comes from owning or belonging to its drive, or from sharing on it or
  a folder above it; a document adds its own sharing. Documents shared on
  their own are addressed by id (no folder header). Write checks use the
  document's role (`onDocument` in `server/artifacts.ts`), never the role on
  the folder a request names. `server/sharing.ts` holds the sharing API.
- `routes/`: thin TanStack Router files. Signed-in pages are children of the
  pathless `_app` layout, which keeps the window mounted and holds the list's
  URL state (view, kind, search, sort).
- `server/`: the Worker's API, auth and content serving.
- Storage (`server/storage/`): never touch `env.ARTIFACTS` directly. Read
  and write bytes through `storageFor(env, row.storage_backend_id)` (or
  `storageResolver` across many files); new uploads go to
  `uploadStorageId(env, folderId)`. Each file row keeps the storage it was
  written to; `server/storage-backends.ts` is the drive owner's API.
