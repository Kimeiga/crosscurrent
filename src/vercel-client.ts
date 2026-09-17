/** Vercel transport: normal room HTTP plus lightweight polling for cross-client updates. */
let subscribedEntity: string | null = null;
let emitUpdate: ((message: any) => void) | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function ensurePoller() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (subscribedEntity && emitUpdate) {
      emitUpdate({
        type: 'entity.update',
        payload: {
          entity_type: 'room',
          entity_id: subscribedEntity,
          data: { refresh: true },
        },
      });
    }
  }, 1200);
}

async function request(path: string, method: string, data?: unknown): Promise<{ data: any }> {
  if (method === 'POST' && path === '/api/subscriptions') {
    const body = (data || {}) as { entity_id?: string };
    subscribedEntity = body.entity_id || null;
    ensurePoller();
    return { data: { subscription: subscribedEntity ? `poll:${subscribedEntity}` : 'poll' } };
  }

  if (method === 'POST' && path === '/api/subscriptions/remove') {
    subscribedEntity = null;
    return { data: { ok: true } };
  }

  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(data ?? {}),
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status}).`);
    Object.assign(error, { response: { status: response.status, data: body } });
    throw error;
  }
  return { data: body };
}

export const api = {
  get: (path: string) => request(path, 'GET'),
  post: (path: string, data?: unknown) => request(path, 'POST', data),
};

export const ws = {
  connect() {
    const messages: Array<(message: any) => void> = [];
    const opens: Array<() => void> = [];
    const closes: Array<() => void> = [];
    const connectionId =
      `poll-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

    const connection = {
      connectionId: connectionId as string | null,
      ready: Promise.resolve(),
      onMessage: (fn: (message: any) => void) => {
        messages.push(fn);
        emitUpdate = message => messages.forEach(callback => callback(message));
      },
      onOpen: (fn: () => void) => {
        opens.push(fn);
        queueMicrotask(fn);
      },
      onClose: (fn: () => void) => {
        closes.push(fn);
      },
      onError: (_fn: (error: unknown) => void) => {},
      disconnect: () => {
        subscribedEntity = null;
        emitUpdate = null;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        connection.connectionId = null;
        closes.forEach(fn => fn());
      },
    };

    ensurePoller();
    return connection;
  },
};
