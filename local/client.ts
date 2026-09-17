/** Standalone transport adapter. The hosted AppDeploy build uses its injected SDK. */
async function request(path: string, method: string, data?: unknown): Promise<{ data: any }> {
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

/** EventSource carries the same entity-update messages for the standalone server. */
export const ws = {
  connect() {
    const source = new EventSource('/socket');
    const messages: Array<(message: any) => void> = [];
    const opens: Array<() => void> = [];
    const closes: Array<() => void> = [];
    const errors: Array<(error: unknown) => void> = [];
    let readyResolve!: () => void;
    const connection = {
      connectionId: null as string | null,
      ready: new Promise<void>(resolve => { readyResolve = resolve; }),
      onMessage: (fn: (message: any) => void) => { messages.push(fn); },
      onOpen: (fn: () => void) => { opens.push(fn); },
      onClose: (fn: () => void) => { closes.push(fn); },
      onError: (fn: (error: unknown) => void) => { errors.push(fn); },
      disconnect: () => { source.close(); connection.connectionId = null; closes.forEach(fn => fn()); },
    };
    source.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'system.connected') {
          connection.connectionId = message.connection_id;
          readyResolve(); opens.forEach(fn => fn());
        } else messages.forEach(fn => fn(message));
      } catch (error) { errors.forEach(fn => fn(error)); }
    };
    source.onerror = event => {
      connection.connectionId = null;
      closes.forEach(fn => fn()); errors.forEach(fn => fn(event));
    };
    return connection;
  },
};
