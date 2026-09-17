import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Database } from '../backend/rooms.ts';

/** SQL values are parameterized. The table argument is data, not SQL syntax. */
export class SQLiteDatabase implements Database {
  readonly connection: DatabaseSync;
  constructor(path: string) {
    this.connection = new DatabaseSync(path);
    this.connection.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS records (
        namespace TEXT NOT NULL,
        id TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (namespace, id)
      );
    `);
  }
  async add(table: string, records: Array<Record<string, unknown>>) {
    const insert = this.connection.prepare('INSERT INTO records VALUES (?, ?, ?)');
    return records.map(record => {
      const id = randomUUID(); insert.run(table, id, JSON.stringify(record)); return id;
    });
  }
  async get<T>(table: string, ids: string[]): Promise<Array<T | null>> {
    const select = this.connection.prepare('SELECT value FROM records WHERE namespace = ? AND id = ?');
    return ids.map(id => {
      const row = select.get(table, id) as { value: string } | undefined;
      return row ? JSON.parse(row.value) as T : null;
    });
  }
  async update(table: string, items: Array<{ id: string; record: Record<string, unknown> }>) {
    const update = this.connection.prepare('UPDATE records SET value = ? WHERE namespace = ? AND id = ?');
    return items.map(item => update.run(JSON.stringify(item.record), table, item.id).changes === 1);
  }
  async list<T>(table: string, options?: { limit?: number }) {
    const rows = this.connection.prepare('SELECT id, value FROM records WHERE namespace = ? ORDER BY rowid LIMIT ?')
      .all(table, Math.min(options?.limit || 100, 500)) as Array<{ id: string; value: string }>;
    return { items: rows.map(row => ({ ...JSON.parse(row.value), id: row.id }) as T & { id: string }) };
  }
  async delete(table: string, ids: string[]) {
    const remove = this.connection.prepare('DELETE FROM records WHERE namespace = ? AND id = ?');
    return ids.map(id => remove.run(table, id).changes === 1);
  }
  close() { this.connection.close(); }
}
