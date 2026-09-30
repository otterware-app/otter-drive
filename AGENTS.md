# Otter Drive development notes

- Use pnpm workspaces; do not add Turborepo unless task volume demonstrates a need.
- Keep all public API request/response schemas in `packages/contracts`.
- Artifact files and published versions are immutable. Updates always create a version.
- Raw uploaded content must be served from a cookie-isolated origin.
- Do not expose Cloudflare, D1, R2, OAuth, or Better Auth secrets to the CLI.
