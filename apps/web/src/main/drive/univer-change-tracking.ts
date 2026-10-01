interface UniverCommand {
  id: string
  type?: number
}

// Univer classifies commands as COMMAND (0), OPERATION (1), or MUTATION (2).
// Only mutations change data that is persisted in the document snapshot.
const SNAPSHOT_MUTATION = 2

export function changesSnapshot(
  command: UniverCommand,
  kind: 'document' | 'spreadsheet',
): boolean {
  if (command.type !== SNAPSHOT_MUTATION) return false

  // Selecting a spreadsheet cell initializes Univer's hidden document editor,
  // which emits doc mutations without changing the workbook itself.
  return kind === 'spreadsheet'
    ? command.id.startsWith('sheet.mutation.')
    : true
}
