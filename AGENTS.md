# Otter Drive development notes

- Use pnpm workspaces; do not add Turborepo unless task volume demonstrates a need.
- Keep all public API request/response schemas in `packages/contracts`.
- Artifact files and published versions are immutable. Updates always create a version.
- Raw uploaded content must be served from a cookie-isolated origin.
- Do not expose Cloudflare, D1, R2, OAuth, or Better Auth secrets to the CLI.

## The web app (`apps/web/src`)

Laid out like Otter Mail's renderer, and styled like it (its design tokens, in
`styles.css`):

- `components/ui/`: primitives in the Otter Mail style (button, menu, dialog,
  select, input, field, tooltip, toast, empty state), on Base UI.
- `main/`: the app. `home-view.tsx` is the window (team rail, sidebar, list,
  main pane); `drive/` holds documents (list, viewer, editor, palette,
  dialogs); `settings/` the Settings panes; `keybindings/` the shortcuts;
  `auth/` the sign-in pages' shell; `teams.ts` the teams and the active one.
- `routes/`: thin TanStack Router files. Signed-in pages are children of the
  pathless `_app` layout, which keeps the window mounted and holds the list's
  URL state (view, kind, search, sort).
- `server/`: the Worker's API, auth and content serving.
