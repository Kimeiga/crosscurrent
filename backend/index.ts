import { router, json, error, db, ws } from '@appdeploy/sdk';
import { Rooms, RoomError } from './rooms.ts';

const rooms = new Rooms(db, (ids, value) => ws.send(ids, value));
const safe = (fn: (ctx: any) => Promise<unknown>) => async (ctx: any) => {
  try { return json(await fn(ctx)); }
  catch (cause) {
    if (cause instanceof RoomError) return error(cause.message, cause.status);
    // Preserve platform quota errors rather than silently retrying them.
    const status = (cause as { statusCode?: number; status?: number })?.statusCode || (cause as { status?: number })?.status;
    if (status === 429 || String(cause).includes('AppDatabaseQuotaExceeded')) return error('Hosting request limit reached. Please try later.', 429);
    console.error('Crosscurrent request failed', cause instanceof Error ? cause.message : 'Unknown error');
    return error('The table could not be updated. Use Reconnect, then retry.', 503);
  }
};
export const handler = router({
  'GET /api/_healthcheck': [async () => json({ ok: true })],
  'POST /api/rooms': [safe(() => rooms.create())],
  'POST /api/rooms/:id/view': [safe(({ params, body }) => rooms.view(params.id, body?.token))],
  'POST /api/rooms/:id/join': [safe(({ params, body }) => rooms.join(params.id, body?.token))],
  'POST /api/rooms/:id/order': [safe(({ params, body }) => rooms.order(params.id, body?.token, body?.turn, body?.action))],
  'POST /api/subscriptions': [safe(({ body }) => rooms.subscribe(body?.entity_id, body?.token, body?.connection_id))],
  'POST /api/subscriptions/remove': [safe(({ body }) => rooms.unsubscribe(body?.entity_id, body?.token, body?.subscription))],
});
