---
name: otterdrive
description: Manage Otter Drive artifacts with the otterdrive CLI. Use when an agent needs to authenticate with Otter Drive, select an organization, create or publish HTML, Markdown, CSV, TSV, Excel, image, video, or other static content, inspect or retrieve artifact files, manage immutable versions, update metadata, move artifacts between teams, open previews, or archive and restore artifacts.
---

# Otter Drive

Use the installed `otterdrive` CLI as the only boundary for artifact operations. Do not access Cloudflare, D1, R2, deployment credentials, or storage objects directly.

## Establish context

1. Verify the executable and version:

   ```bash
   command -v otterdrive
   otterdrive --version
   ```

2. If it is missing, require Node.js 24 LTS and install the official npm package:

   ```bash
   npm install --global otterdrive@latest
   otterdrive --version
   ```

   The official package is `otterdrive` and its repository metadata points to `https://github.com/otterware-app/otter-drive`. When developing the CLI itself inside a clean Otter Drive checkout, use `pnpm install --frozen-lockfile`, `pnpm --dir apps/cli build`, and `npm install --global ./apps/cli`. Preserve existing checkout changes and never replace them automatically.

3. Check authentication before doing work:

   ```bash
   otterdrive --json auth status
   ```

4. If login is required, ask the user to complete the human-controlled device flow:

   ```bash
   otterdrive auth login --url https://drive.otterware.app
   ```

   Do not approve a device request on the user's behalf. For unattended agents, prefer a scoped organization API key supplied through `OTTERDRIVE_TOKEN`. Never print, commit, log, or place credentials in a prompt.

## Choose the team

- Inspect available organizations with `otterdrive --json organizations list`.
- Treat `otterdrive organizations use <id>` as a persistent configuration change. Use it only when the intended workspace is clear.
- Every artifact is visible to members of its organization; there is no private visibility mode.
- A device-login token represents a user and may access artifacts in that user's organizations. Organization API keys are restricted to their organization.
- Use `--profile <name>` for separate accounts or deployments. Put global options before the command for clarity.

## Inspect before changing

Resolve an artifact by ID or slug, then inspect its metadata and versions:

```bash
otterdrive --json artifacts show <artifact>
otterdrive --json artifacts versions <artifact>
otterdrive --json artifacts files <artifact> --version <number>
```

Use `otterdrive artifacts read` for one file and `pull` for a full version. Prefer a temporary or explicitly approved destination when pulling; do not overwrite an existing working tree blindly.

## Publish safely

Use `create` only for a new artifact. It creates both the artifact and immutable version 1:

```bash
otterdrive --json artifacts create <output-directory> \
  --slug <slug> \
  --title <title> \
  --label "Initial version"
```

The source may also be a single document. Publish `.md`, `.csv`, `.tsv`, and `.xlsx` files directly; Otter Drive provides a purpose-built browser preview for each format:

```bash
otterdrive --json artifacts create ./report.xlsx \
  --slug quarterly-report \
  --title "Quarterly report" \
  --label "Initial workbook"
```

Publish a video (`.mp4`, `.webm`, `.mov`) the same way, as a single file. Otter Drive plays it in its own player, files it under Videos, and makes a thumbnail from an early frame. Don't wrap a video in an HTML page just to show it; use a page only when the video is part of a larger document. Prefer `.webm` or H.264 `.mp4`, which every browser plays:

```bash
otterdrive --json artifacts create ./walkthrough.webm \
  --slug pr-1100-walkthrough \
  --title "PR #1100 walkthrough" \
  --label "Initial recording"
```

Publish a new immutable version of an existing artifact with `push`:

```bash
otterdrive --json artifacts push <artifact> <output-directory> \
  --label <summary> \
  --if-version <observed-current-version>
```

Always use `--if-version` for agent-driven updates. If it conflicts, stop, re-read the latest artifact and versions, compare the competing work, and report the conflict. Never retry with a newer version number without understanding what changed.

Publish a curated build/output directory, not a repository root. Before upload, inspect all files recursively for secrets, environment files, credentials, source maps, caches, and unrelated content. The CLI uploads every regular file in the selected directory except `.DS_Store` and the metadata files `.otterdrive.json` and `.otterware.json`; it rejects symbolic links. Use `--entry` when the entry file is not `index.html`.

## Distinguish operations

- `create`: create metadata and version 1 for a new artifact.
- `push`: upload content as a new immutable version.
- `update`: change title, description, or slug without publishing files.
- `move`: move an artifact and all immutable versions to another organization.
- `promote`: make an existing version current without rewriting it.
- `archive` / `restore`: change whether the artifact is active.

Before moving, inspect both organizations and confirm the intended destination. Moving requires a user device login with owner or admin access in both organizations; organization API keys cannot move artifacts. A move fails when the destination already has the artifact slug or an upload is pending:

```bash
otterdrive --json artifacts move <artifact> <destination-organization>
```

Require clear user intent before moving an artifact, promoting an older version, or archiving an artifact. Do not simulate version edits: published versions and their files are immutable.

## Return useful results

Use root `--json` for automation and parse fields rather than terminal prose. After a mutation, report the artifact ID or slug, organization, resulting version, and preview URL. Do not expose authentication material in the report.

Read [references/cli.md](references/cli.md) when exact command flags, environment overrides, or retrieval examples are needed.
