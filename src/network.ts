import { api, ws } from '@appdeploy/client';
import type { RoomView } from '../backend/rooms';
import type { Action } from './engine';
export type Session = { id: string; token: string; invite?: string };
export const networkError = (error: unknown): string => {
  const e = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Could not reach the table. Check your connection and use Reconnect.';
};
export async function createRoom(): Promise<Session> { return (await api.post('/api/rooms', {})).data; }
export async function joinRoom(session: Session): Promise<RoomView> {
  return (await api.post(`/api/rooms/${session.id}/join`, { token: session.token })).data;
}
export async function getRoom(session: Session): Promise<RoomView> {
  return (await api.post(`/api/rooms/${session.id}/view`, { token: session.token })).data;
}
export async function submitOrder(session: Session, turn: number, action: Action): Promise<RoomView> {
  return (await api.post(`/api/rooms/${session.id}/order`, { token: session.token, turn, action })).data;
}
let connection: ReturnType<typeof ws.connect> | null = null;
let active: { session: Session; refresh: () => void; status: (s: string) => void; subscription: string | null; subscribedConnection: string | null } | null = null;
async function subscribe() {
  const current = active;
  if (!current || !connection?.connectionId || current.subscribedConnection === connection.connectionId) return;
  const connectionId = connection.connectionId;
  current.subscribedConnection = connectionId;
  try {
    const response = await api.post('/api/subscriptions', { entity_type: 'room', entity_id: current.session.id, token: current.session.token, connection_id: connectionId });
    if (active !== current) {
      await api.post('/api/subscriptions/remove', { entity_type: 'room', entity_id: current.session.id, token: current.session.token, subscription: response.data.subscription });
      return;
    }
    current.subscription = response.data.subscription;
    current.status('Live'); current.refresh(); // Close the initial-load/subscribe race.
  } catch (error) { current.subscribedConnection = null; current.status(networkError(error)); }
}
export async function watchRoom(session: Session, refresh: () => void, status: (s: string) => void) {
  await unwatchRoom();
  active = { session, refresh, status, subscription: null, subscribedConnection: null };
  status('Connecting');
  if (!connection) {
    connection = ws.connect();
    connection.onMessage((message: any) => {
      if (message.type === 'entity.update' && message.payload?.entity_type === 'room' && message.payload.entity_id === active?.session.id) active?.refresh();
    });
    connection.onClose(() => { if (active) { active.subscribedConnection = null; active.status('Disconnected'); } });
    connection.onError(() => active?.status('Disconnected'));
    connection.onOpen(() => { void subscribe(); });
  }
  await connection.ready;
  await subscribe();
}
export async function unwatchRoom() {
  const previous = active; active = null;
  if (previous?.subscription) {
    try { await api.post('/api/subscriptions/remove', { entity_type: 'room', entity_id: previous.session.id, token: previous.session.token, subscription: previous.subscription }); }
    catch { /* Expiry also removes stale subscription records. */ }
  }
}
export function disconnect() { void unwatchRoom(); connection?.disconnect(); connection = null; }
export function invitation(session: Session) {
  return `${location.origin}${location.pathname}#/join/${session.id}/${session.invite || session.token}`;
}
