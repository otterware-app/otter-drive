import { identityMigration } from '../src/server/identity-migration.ts'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wrangler = resolve(appDirectory, 'node_modules/.bin/wrangler')
function fail(message) {
  throw new Error(message)
}
function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}
function option(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}
function run(args) {
  const result = spawnSync(wrangler, args, {
    cwd: appDirectory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0)
    fail(result.stderr || result.stdout || 'Wrangler failed.')
  return result.stdout
}
const subject = option('--otter-subject')
if (!subject || !/^[a-zA-Z0-9_-]{1,256}$/.test(subject))
  fail(
    'Pass --otter-subject with the verified Otter account ID. Never use an email address as the subject.',
  )
const name = option('--name') ?? 'Administrator'
const local = process.argv.includes('--local')
const remote = process.argv.includes('--remote')
if (local === remote) fail('Specify exactly one of --local or --remote.')
const target = local ? '--local' : '--remote'
const config = readFileSync(resolve(appDirectory, 'wrangler.jsonc'), 'utf8')
const email = config.match(/"ADMIN_EMAIL"\s*:\s*"([^"]+)"/)?.[1]?.toLowerCase()
if (!email) fail('ADMIN_EMAIL is missing from wrangler.jsonc.')
const query = (command) =>
  JSON.parse(
    run(['d1', 'execute', 'DB', target, '--json', '--command', command]),
  )[0]?.results ?? []
const existing = query(
  `SELECT id FROM user WHERE lower(email) = ${sql(email)}`,
)[0]
if (existing && !process.argv.includes('--link-existing'))
  fail(
    'This administrator exists. Use --link-existing only after verifying ownership of both identities.',
  )
const existingLink = query(
  `SELECT userId, accountId FROM account WHERE providerId = 'otter' AND (accountId = ${sql(subject)}${existing ? ` OR userId = ${sql(existing.id)}` : ''})`,
)
if (
  existingLink.some(
    (link) => link.userId !== existing?.id || link.accountId !== subject,
  )
)
  fail('A conflicting Otter account link exists; no changes made.')
if (existing?.id === subject && existingLink.length === 1) {
  process.stdout.write(
    'This administrator already uses the canonical Otter identity.\n',
  )
  process.exit(0)
}
const now = new Date().toISOString()
const statements = existing
  ? identityMigration(existing.id, subject, crypto.randomUUID(), now)
  : `
INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt,role,banned) VALUES (${sql(subject)},${sql(name)},${sql(email)},1,${sql(now)},${sql(now)},'admin',0);
INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) VALUES (${sql(crypto.randomUUID())},${sql(subject)},'otter',${sql(subject)},${sql(now)},${sql(now)});`

// Use the transactional query endpoint. Remote --file uses D1's import
// pipeline, which can split statements across transaction boundaries.
run(['d1', 'execute', 'DB', target, '--yes', '--command', statements])
process.stdout.write(
  existing
    ? 'Transferred the existing account, ownership, attribution, keys and sessions to the canonical Otter ID. Removed the old password identity.\n'
    : 'Administrator created with Otter sign-in.\n',
)
