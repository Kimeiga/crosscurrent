import test from 'node:test';
import assert from 'node:assert/strict';
import { Rooms, type Database } from '../backend/rooms.ts';
import type { Action } from '../src/engine.ts';
class Memory implements Database {
  data = new Map<string, Map<string, Record<string, unknown>>>();
  table(t: string) { if (!this.data.has(t)) this.data.set(t, new Map()); return this.data.get(t)!; }
  async add(t: string, records: Array<Record<string, unknown>>) { return records.map(r => { const id = crypto.randomUUID(); this.table(t).set(id, structuredClone(r)); return id; }); }
  async get<T>(t: string, ids: string[]): Promise<Array<T | null>> { return ids.map(id => structuredClone(this.table(t).get(id) || null) as T | null); }
  async update(t: string, items: Array<{ id: string; record: Record<string, unknown> }>) { return items.map(i => { if (!this.table(t).has(i.id)) return false; this.table(t).set(i.id, structuredClone(i.record)); return true; }); }
  async list<T>(t: string, options?: { limit?: number }) { return { items: [...this.table(t)].slice(0, options?.limit || 100).map(([id, r]) => ({ ...structuredClone(r), id }) as T & { id: string }) }; }
  async delete(t: string, ids: string[]) { return ids.map(id => this.table(t).delete(id)); }
}
const D = (card: number, front: number): Action => ({ kind: 'deploy', card, front });
async function fixture() {
  const db = new Memory(); const messages: unknown[] = []; const rooms = new Rooms(db, async (_ids, value) => { messages.push(value); });
  const created = await rooms.create(); return { db, messages, rooms, ...created };
}
test('table creator and invited player receive different seats and equal hands', async () => {
  const f = await fixture(); const a = await f.rooms.view(f.id, f.token); const b = await f.rooms.join(f.id, f.invite);
  assert.equal(a.seat, 0); assert.equal(b.seat, 1); assert.deepEqual(b.joined, [true,true]); assert.deepEqual(b.state.sides[0], b.state.sides[1]);
});
test('forged invitations and room IDs are denied', async () => {
  const f = await fixture(); await assert.rejects(f.rooms.view(f.id, 'a'.repeat(64)), /access/); await assert.rejects(f.rooms.view('../bad', f.token), /invalid/); await assert.rejects(f.rooms.view('nonexistent', f.token), /missing/);
});
test('host cannot submit before the second player joins', async () => { const f = await fixture(); await assert.rejects(f.rooms.order(f.id, f.token, 1, D(13,0)), /friend must join/); });
test('opponent never sees an unpaired order in the view or websocket payload', async () => {
  const f = await fixture(); await f.rooms.join(f.id, f.invite); await f.rooms.subscribe(f.id, f.invite, 'connection-guest');
  await f.rooms.order(f.id, f.token, 1, D(13,0)); const view = await f.rooms.view(f.id, f.invite);
  assert.equal(view.state.turn,0); assert.equal(view.ownOrder,null); assert.deepEqual(view.history,[]); assert.deepEqual(view.locked,[true,false]); assert.equal(JSON.stringify(f.messages).includes('card'),false);
});
test('locked order is immutable under ordinary retries and stale submissions', async () => {
  const f=await fixture(); await f.rooms.join(f.id,f.invite); await f.rooms.order(f.id,f.token,1,D(13,0));
  await f.rooms.order(f.id,f.token,1,D(13,0)); await assert.rejects(f.rooms.order(f.id,f.token,1,D(12,0)), /already locked/);
  await assert.rejects(f.rooms.order(f.id,f.token,2,D(12,0)), /turn changed/);
});
test('simultaneous independent seat writes retain both orders', async () => {
  const f=await fixture(); await f.rooms.join(f.id,f.invite);
  await Promise.all([f.rooms.order(f.id,f.token,1,D(13,0)),f.rooms.order(f.id,f.invite,1,D(12,1))]);
  const a=await f.rooms.view(f.id,f.token); const b=await f.rooms.view(f.id,f.invite);
  assert.equal(a.state.turn,1); assert.deepEqual(a.state,b.state); assert.deepEqual(a.history[0].actions,[D(13,0),D(12,1)]);
});
test('new service instance recovers saved orders with only the seat capability', async () => {
  const f=await fixture(); await f.rooms.join(f.id,f.invite); await f.rooms.order(f.id,f.token,1,D(13,0));
  const fresh = new Rooms(f.db, async () => {}); const view=await fresh.view(f.id,f.token); assert.deepEqual(view.ownOrder,D(13,0)); assert.deepEqual(view.locked,[true,false]);
});
test('illegal and incomplete orders do not mutate the saved game', async () => {
  const f=await fixture(); await f.rooms.join(f.id,f.invite);
  await assert.rejects(f.rooms.order(f.id,f.token,1,{kind:'recall',card:13,front:-1}),/not legal/);
  await assert.rejects(f.rooms.order(f.id,f.token,1,{kind:'deploy',card:14,front:0}),/complete/);
  assert.equal((await f.rooms.view(f.id,f.token)).state.turn,0);
});
test('server resolves a complete twelve-turn game and rejects a thirteenth', async () => {
  const f=await fixture(); await f.rooms.join(f.id,f.invite);
  for(let turn=1;turn<=12;turn++) await Promise.all([f.rooms.order(f.id,f.token,turn,D(turn,turn%3)),f.rooms.order(f.id,f.invite,turn,D(turn,turn%3))]);
  const view=await f.rooms.view(f.id,f.token); assert.equal(view.state.turn,12); assert.deepEqual(view.state.scores,[0,0]); assert.equal(view.history.filter(h=>h.checkpoint).length,3);
  await assert.rejects(f.rooms.order(f.id,f.token,13,D(13,0)),/turn changed/);
});
test('subscriptions require a valid seat and can only be removed by that seat', async () => {
  const f=await fixture(); await assert.rejects(f.rooms.subscribe(f.id,'f'.repeat(64),'connection'), /access/);
  const sub=await f.rooms.subscribe(f.id,f.token,'connection'); await f.rooms.unsubscribe(f.id,f.invite,sub.subscription);
  assert.equal((await f.db.list(`subs_${f.id}`)).items.length,1); await f.rooms.unsubscribe(f.id,f.token,sub.subscription); assert.equal((await f.db.list(`subs_${f.id}`)).items.length,0);
});
