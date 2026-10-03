import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
// Exercise the real auth library and all SQL migrations against SQLite.
export class Database {
  sqlite = new DatabaseSync(':memory:')
  constructor(beforeMigration?: (db: DatabaseSync, file: string) => void) {
    for (const file of readdirSync(
      new URL('../../migrations/', import.meta.url),
    )
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      beforeMigration?.(this.sqlite, file)
      this.sqlite.exec(
        readFileSync(
          new URL(`../../migrations/${file}`, import.meta.url),
          'utf8',
        ),
      )
    }
  }
  exec(sql: string) {
    this.sqlite.exec(sql)
  }
  prepare(sql: string) {
    const db = this.sqlite
    let params: SQLInputValue[] = []
    const statement = {
      bind(...values: SQLInputValue[]) {
        params = values
        return statement
      },
      async all() {
        const results = db.prepare(sql).all(...params)
        const meta = db
          .prepare(
            'SELECT changes() AS changes, last_insert_rowid() AS last_row_id',
          )
          .get()
        return { results, success: true, meta }
      },
      async run() {
        return statement.all()
      },
      async first() {
        return db.prepare(sql).get(...params) ?? null
      },
    }
    return statement
  }
  async batch(statements: ReturnType<Database['prepare']>[]) {
    this.sqlite.exec('BEGIN')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.all())
      this.sqlite.exec('COMMIT')
      return results
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }
}
