import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteDatabase } from '../local/database.ts';
import { Rooms } from '../backend/rooms.ts';

test('SQLite adapter preserves IDs and isolates namespaces', async () => {
  const db = new SQLiteDatabase(':memory:');
  try {
    const [id] = await db.add('first', [{ value: 1 }]);
    assert.deepEqual(await db.get('first', [id]), [{ value: 1 }]);
    assert.deepEqual(await db.get('second', [id]), [null]);
    assert.deepEqual(await db.update('first', [{ id, record: { value: 2 } }]), [true]);
    assert.deepEqual((await db.list('first')).items, [{ value: 2, id }]);
    assert.deepEqual(await db.delete('first', [id]), [true]);
    assert.deepEqual(await db.get('first', [id]), [null]);
  } finally { db.close(); }
});
test('SQLite adapter bounds reads and treats table names as data', async () => {
  const db = new SQLiteDatabase(':memory:');
  try {
    const table = "x'; DROP TABLE records; --";
    await db.add(table, [{ n: 1 }, { n: 2 }, { n: 3 }]);
    assert.equal((await db.list(table, { limit: 2 })).items.length, 2);
    assert.deepEqual((await db.list('x')).items, []);
  } finally { db.close(); }
});
test('real SQLite room survives closing and reopening the database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'crosscurrent-'));
  const path = join(directory, 'state.sqlite');
  let db = new SQLiteDatabase(path);
  try {
    const rooms = new Rooms(db, async () => {});
    const session = await rooms.create();
    await rooms.join(session.id, session.invite);
    await rooms.order(session.id, session.token, 1, { kind: 'deploy', card: 13, front: 0 });
    await rooms.order(session.id, session.invite, 1, { kind: 'deploy', card: 12, front: 1 });
    db.close(); db = new SQLiteDatabase(path);
    const restored = await new Rooms(db, async () => {}).view(session.id, session.token);
    assert.equal(restored.state.turn, 1);
    assert.deepEqual(restored.state.sides[0].board[0], [13]);
    assert.deepEqual(restored.state.sides[1].board[1], [12]);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
