# Otter Drive

Otter Drive is a personal and shared drive for documents for people and agents. It provides a TanStack Start web app, immutable artifact versioning on Cloudflare, and the `otterdrive` CLI.

## What is included

- `apps/web` — TanStack Start application and versioned REST API on Cloudflare Workers.
- `apps/cli` — installable Node.js CLI with browser/device login and JSON output.
- `packages/contracts` — Zod request and response contracts shared by both clients.
- Cloudflare D1 — users, sessions, recursive folders, shared drive invitations, API keys, artifact metadata, versions, uploads, and audit events.
- Private Cloudflare R2 — immutable artifact file bodies.
- Better Auth — Google sign-in through the shared Otter identity, device authorization, and hashed personal API keys.

Uploaded HTML is served from `usercontent.otterware.app`, not the authenticated application origin. Short-lived, version-scoped grants protect the private R2 objects and keep executable content away from application cookies.

## Requirements

- Node.js 24 Active LTS
- pnpm 11.9 or newer
- A Cloudflare account with Workers, D1, and R2 enabled
- Optional Google OAuth credentials for invited collaborators

## Local development

```bash
git clone https://github.com/otterware-app/otter-drive.git
cd otter-drive
pnpm install
cp apps/web/.dev.vars.example apps/web/.dev.vars
pnpm db:migrate:local
pnpm dev
```

The development server runs at `http://localhost:3000`. There is no public administrator bootstrap: the deployment operator seeds the initial account directly into D1. Every verified Otter identity can create a personal drive. Shared drives grant access only to their invited members. Sign-in uses the shared Google-backed Otter identity hosted by Mail; Drive does not accept passwords.

Run all verification:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Install the CLI

With Node.js 24 LTS installed:

```bash
npm install --global otterdrive
otterdrive --version
```

To build and install from a source checkout instead:

```bash
git clone https://github.com/otterware-app/otter-drive.git
cd otter-drive
pnpm install --frozen-lockfile
pnpm --dir apps/cli build
npm install --global ./apps/cli
otterdrive --version
otterdrive --help
```

## Install the agent skill

The repository includes the `otterdrive` skill for Codex, Claude Code, OpenClaw, Hermes, and other agents supported by skills.sh. Install it with:

```bash
npx skills@latest add otterware-app/otter-drive \
  --skill otterdrive
```

The installer detects available agents and lets you select the targets. To install directly for Codex without prompts:

```bash
npx skills@latest add otterware-app/otter-drive \
  --skill otterdrive \
  --agent codex \
  --yes
```

From a local clone, use `npx skills@latest add . --skill otterdrive`. The skill teaches agents to inspect before mutating, publish curated output directories, protect credentials, and push immutable versions with concurrency checks.

Authenticate a human-controlled machine with the browser device flow:

```bash
otterdrive auth login --url https://drive.otterware.app
otterdrive auth status
otterdrive folders list
otterdrive folders use <folder-id>
```

For an unattended agent, create a personal key in the web settings and provide it through the environment rather than placing it in a prompt:

```bash
export OTTERDRIVE_TOKEN='otw_...'
otterdrive artifacts list
```

Device login and personal API keys follow the user’s current drive access. Keys migrated from organizations retain a scope restricting them to that drive and its descendants.

## Publish the CLI

Releases are manual. Nothing publishes on merge. The CLI is published through
npm trusted publishing; the repository does not store an npm token.

1. Bump the CLI version and lockfile in a pull request and merge it:

   ```bash
   pnpm --dir apps/cli version patch --no-git-tag-version
   pnpm install --lockfile-only
   ```

2. Run the `Publish CLI to npm` workflow from the Actions tab, or:

   ```bash
   gh workflow run publish-cli.yml --ref main
   ```

   The workflow verifies, builds, publishes with provenance, and creates the
   `otterdrive-v<version>` GitHub release. If the version already exists on npm it
   exits without publishing.

3. Verify the registry version:

   ```bash
   npm view otterdrive version
   npm install --global otterdrive@latest
   otterdrive --version
   ```

## Artifact commands

```bash
# Create an artifact and immutable version 1
otterdrive artifacts create ./dist \
  --slug product-demo \
  --title "Product demo" \
  --description "Interactive prototype" \
  --label "Initial version"

# Publish version 2, failing if another actor already published a version
otterdrive artifacts push product-demo ./dist \
  --label "Added mobile layout" \
  --if-version 1

otterdrive artifacts list
otterdrive artifacts show product-demo
otterdrive artifacts versions product-demo
otterdrive artifacts files product-demo --version 2
otterdrive artifacts read product-demo index.html --version 2
otterdrive artifacts pull product-demo ./download --version 2
otterdrive artifacts promote product-demo --version 1
otterdrive artifacts move product-demo destination-team
otterdrive artifacts archive product-demo
otterdrive artifacts restore product-demo
```

Every command supports `--json` at the root for automation. Configuration is stored with mode `0600` under `${XDG_CONFIG_HOME:-~/.config}/otterdrive/config.json`. `OTTERDRIVE_TOKEN`, `OTTERDRIVE_URL`, `OTTERDRIVE_PROFILE`, and `OTTERDRIVE_ORGANIZATION` override stored values.

## Cloudflare setup

R2 must first be enabled in the Cloudflare dashboard. Then create the resources:

```bash
cd apps/web
pnpm exec wrangler d1 create otterware
pnpm exec wrangler r2 bucket create otterware-artifacts
```

Replace the placeholder `database_id` in `apps/web/wrangler.jsonc` with the D1 ID printed by Wrangler.

Configure production secrets:

```bash
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put CONTENT_SIGNING_KEY
```

Drive uses the existing Otter identity provider. `OTTER_AUTH_URL` in `wrangler.jsonc` points to
`https://relay.mail.otterware.app/v1/auth`. Its first-party client is `otter-drive`, with the exact
callback `https://drive.otterware.app/api/auth/callback/otter`, S256 PKCE, and no client secret.
No Google credentials or email delivery service are needed in Drive.

Set `ADMIN_EMAIL`, apply migrations, and verify the administrator's existing Otter subject
through the identity service before seeding. The subject is an immutable user ID, not an email:

```bash
pnpm admin:seed -- --remote --otter-subject VERIFIED_OTTER_USER_ID --name "Administrator"
```

For an existing administrator, add `--link-existing` after verifying ownership of both accounts.
This changes the Drive user ID to the canonical Mail subject, transfers all ownership and attribution, preserves sessions and API key hashes, and removes the old password identity. Automatic account
linking by matching emails is disabled. Register the existing user in Mail's `identity_apps`
with `app_id = 'otter-drive'` before enabling the integration.

Shared account deletion is available from Settings → Account → Manage account. It requires
deleting personal documents and transferring or deleting owned shared drives first. Drive removes the user’s sessions, memberships and API keys; documents in other people’s shared drives remain. Revoking the Mail browser session
also ends its associated Drive browser session through signed OIDC back-channel logout. Drive
CLI sessions remain independent; shared account deletion ends those too.

For local sign-in, use a local identity service and set `OTTER_AUTH_URL` in `.dev.vars`.
Register the local callback in its local OAuth client. Do not add localhost or wildcard callbacks
to the production client. `src/server/identity.test.ts` tests the real auth library and migrations
against SQLite and a local mock OIDC issuer, including device login and API keys.

For this migration, back up D1 and prepare the tested Worker build first. The organization-to-folder schema change must be deployed together with the new Worker during a short maintenance window; an old Worker cannot run against the new schema. Apply migrations, re-key the verified administrator, and deploy immediately:

```bash
pnpm db:migrate:remote
```

The web app deploys automatically: Cloudflare Workers Builds is connected to
this repository and builds and deploys every push to `main` (it reports as the
`Workers Builds: otterware` check on each commit). `pnpm deploy` remains for a
manual deploy from an authenticated checkout.

Attach `drive.otterware.app` and `usercontent.otterware.app` as Worker custom domains. The raw-content handlers reject production requests that do not arrive on the configured content hostname.

Each person signs in with their existing Otter account and gets a private personal drive. Create a shared drive with the + in the drive rail, then invite Google email addresses in Settings → Shared drive access. Invitations grant view or edit access throughout the drive, including future nested folders. No invitation email is sent: copy its link to the collaborator. Only the owner manages access or transfers ownership; editors upload and edit documents. A folder’s parent can be changed within the same drive in Settings → Drives and folders.

Migration `0006_personal_folders.sql` converts the existing `chris` namespace to the personal drive and `zentio` to a shared drive, preserving IDs, slugs and R2 keys. Organizations are removed from the auth model and database. Existing document URLs and CLI credentials remain valid. The old organization header and list endpoint are read compatibility for installed CLIs; new clients use `folders` and `x-otterdrive-folder`.

## Production trust boundary

Artifact agents receive only Otter Drive device tokens or scoped API keys. They must not have Cloudflare API tokens, R2 credentials, production deployment credentials, or unreviewed access to the protected deployment branch.

Production deployment runs from Cloudflare Workers Builds on the protected `main` branch.

## Otter Drive migration

The repository is `otterware-app/otter-drive`. The app is hosted at
`https://drive.otterware.app`, and raw artifact files are served from the separate
`https://usercontent.otterware.app` origin. The CLI package and executable remain
`otterdrive`, and the agent skill remains `/otterdrive` (`$otterdrive` in Codex).

Browser links on `app.otterware.dev`, `drive.otterware.dev` and
`usercontent.otterware.dev` redirect to their corresponding new host while
preserving the path and query. Legacy app API requests are served by the same
Worker without a cross-origin redirect, so existing CLI bearer tokens and API
keys keep working. Browser users sign in again on the new domain.

CLI version 0.1.5 and newer recognizes saved production URLs on both old app
hosts. Custom server URLs, credentials and selected folders are preserved.
Profiles in `~/.config/otterware/config.json` are still copied to the `otterdrive`
config directory on first use, respecting `XDG_CONFIG_HOME`. `OTTERDRIVE_*`
variables take precedence over the supported legacy `OTTERWARE_*` variables.
Existing `otw_` API keys remain valid, and uploads exclude both `.otterdrive.json`
and `.otterware.json` metadata files.

Cloudflare Workers Builds must connect to `otterware-app/otter-drive`. The npm
trusted publisher for `otterdrive` must use organization `otterware-app`,
repository `otter-drive` and workflow `publish-cli.yml`. Shared Otter sign-in registers
`https://drive.otterware.app/api/auth/callback/otter` with the identity service.

The existing Worker name `otterware`, D1 database `otterware`, R2 bucket
`otterware-artifacts` and private `@otterware` workspace packages preserve the
deployment identity and stored data. They do not need to be recreated for the
repository or public-domain migration.
