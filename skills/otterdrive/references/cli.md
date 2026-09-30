# OtterDrive CLI reference

## Global options and environment

```text
otterdrive --json <command>             Machine-readable output
otterdrive --profile <name> <command>   Named local profile
otterdrive -v, --version                Installed CLI version
```

Environment overrides:

```text
OTTERDRIVE_TOKEN          Device token or otw_ organization API key
OTTERDRIVE_URL            Application base URL
OTTERDRIVE_PROFILE        Active profile name
OTTERDRIVE_ORGANIZATION   Active organization ID
```

Stored credentials live at `${XDG_CONFIG_HOME:-~/.config}/otterdrive/config.json` with mode `0600`. Prefer environment injection for unattended agents. Never echo an environment variable containing a credential.

## Authentication

```bash
otterdrive auth login --url https://drive.otterware.app
otterdrive --json auth status
otterdrive auth logout
otterdrive auth config-path
```

`auth login` uses a browser device-authorization flow. `auth logout` removes locally stored credentials for the selected profile.

## Organizations

```bash
otterdrive --json organizations list
otterdrive --json organizations create "Organization name" --slug organization-slug
otterdrive organizations use <organization-id-or-slug>
```

Organization creation and workspace selection are state-changing operations. Do them only when requested or clearly necessary to the user's task.

## Artifact discovery and inspection

```bash
otterdrive --json artifacts list
otterdrive --json artifacts list --archived
otterdrive --json artifacts show <artifact-id-or-slug>
otterdrive --json artifacts versions <artifact>
otterdrive --json artifacts files <artifact> --version <number>
```

`list` defaults to 50 results. Use `--limit <number>` when necessary.

## Creating and publishing

Create an artifact and version 1 in the active organization:

```bash
otterdrive --json artifacts create ./dist \
  --slug product-demo \
  --title "Product demo" \
  --description "Interactive prototype" \
  --entry index.html \
  --label "Initial version"
```

Select the intended organization before creating an artifact:

```bash
otterdrive organizations use <organization>
otterdrive --json artifacts create ./dist \
  --slug shared-demo \
  --title "Shared demo"
```

Push a concurrency-protected version:

```bash
otterdrive --json artifacts push product-demo ./dist \
  --label "Improve mobile layout" \
  --if-version 3
```

The source may be one file or a directory. A directory uses `index.html` as its default entry. A single file uses itself. Otherwise provide `--entry <relative-path>`.

OtterDrive renders the following single-file formats with dedicated previews:

- Markdown: `.md`, `.markdown`
- Delimited spreadsheets: `.csv`, `.tsv`
- Excel workbooks: `.xlsx`, including multiple sheets

Other static files remain available through the sandboxed raw preview and CLI retrieval commands.

## Metadata and lifecycle

```bash
otterdrive --json artifacts update <artifact> --title "New title"
otterdrive --json artifacts update <artifact> --description "New description"
otterdrive --json artifacts move <artifact> <destination-organization>
otterdrive --json artifacts promote <artifact> --version <number>
otterdrive --json artifacts archive <artifact>
otterdrive --json artifacts restore <artifact>
```

`update` does not create a content version. `move` preserves every immutable version and requires a user login with owner or admin access in both organizations. `promote` changes which immutable version is current.

## Reading and downloading

Read the current entry file to standard output:

```bash
otterdrive artifacts read <artifact>
```

Read a specific text file or save a binary file:

```bash
otterdrive artifacts read <artifact> index.html --version 2
otterdrive artifacts read <artifact> image.png --version 2 > image.png
```

Download a full version:

```bash
destination="$(mktemp -d)"
otterdrive --json artifacts pull <artifact> "$destination" --version 2
```

Open the current preview in a browser only when a browser action is useful:

```bash
otterdrive artifacts open <artifact>
```

## Failure handling

- Authentication failure: run `auth status`; ask the user to log in or supply a scoped key through the environment.
- Permission failure: confirm organization membership, active organization, role, and API-key permissions. Moving requires a user login and cannot use an API key. Do not seek broader infrastructure credentials.
- Move conflict: check for the same slug in the destination and for pending uploads on the source artifact.
- Version conflict: inspect the latest version and stop for reconciliation.
- Missing entry: pass an existing relative path with `--entry`.
- Symbolic-link rejection: materialize the intended files into a clean output directory; do not bypass the check.
- Network or server failure: preserve local source, report the error, and retry only when the operation is known to be idempotent. Inspect the artifact before retrying `create` or `push`.
