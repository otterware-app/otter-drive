import { Command } from 'commander'
import packageJson from '../package.json' with { type: 'json' }
import { registerArtifactCommands } from './artifacts'
import { registerAuthCommands } from './auth'
import { registerFolderCommands } from './folders'

const program = new Command()
  .name('otterdrive')
  .description('Build and collaborate with Otter Drive')
  .enablePositionalOptions()
  .version(packageJson.version, '-v, --version', 'Show the CLI version')
  .option('--json', 'Emit machine-readable JSON')
  .option('--profile <name>', 'Use a named configuration profile')
  .showSuggestionAfterError()
  .showHelpAfterError()

registerAuthCommands(program)
registerFolderCommands(program)
registerArtifactCommands(program)

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Error: ${message}\n`)
  process.exitCode = 1
})
