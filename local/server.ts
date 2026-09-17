import { createServer, type ServerResponse, type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { Rooms, RoomError } from '../backend/rooms.ts';
import { SQLiteDatabase } from './database.ts';

const dataDirectory = resolve(process.env.DATA_DIR || '.data');
mkdirSync(dataDirectory, { recursive: true });
const db = new SQLiteDatabase(resolve(dataDirectory, 'crosscurrent.sqlite'));
const connections = new Map<string, ServerResponse>();
const rooms = new Rooms(db, async (ids, payload) => {
  for (const id of ids) connections.get(id)?.write(`data: ${JSON.stringify(payload)}\n\n`);
});
const queues = new Map<string, Promise<unknown>>();
async function serial<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(id) || Promise.resolve();
  const pending = previous.catch(() => {}).then(task);
  queues.set(id, pending);
  try { return await pending; }
  finally { if (queues.get(id) === pending) queues.delete(id); }
}
function respond(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}
async function readBody(request: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 16384) throw new RoomError('Request too large.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
  catch { throw new RoomError('Invalid JSON request.'); }
}
const dist = resolve('dist');
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2',
};
const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  try {
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname === '/socket' && request.method === 'GET') {
      if (connections.size >= 200) return respond(response, 503, { error: 'Too many active connections.' });
      const id = randomUUID();
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      response.write(`data: ${JSON.stringify({ type: 'system.connected', connection_id: id })}\n\n`);
      connections.set(id, response);
      const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 20000);
      request.on('close', () => { clearInterval(heartbeat); connections.delete(id); });
      return;
    }
    if (url.pathname === '/api/_healthcheck') return respond(response, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'POST') return respond(response, 405, { error: 'POST required.' });
      const origin = request.headers.origin;
      if (origin && new URL(origin).host !== request.headers.host) throw new RoomError('Cross-origin writes are not allowed.', 403);
      const body = await readBody(request);
      let result: unknown;
      const match = url.pathname.match(/^\/api\/rooms\/([\w-]+)\/(view|join|order)$/);
      if (url.pathname === '/api/rooms') result = await rooms.create();
      else if (match) {
        const [, id, action] = match;
        result = await serial(id, () => action === 'view' ? rooms.view(id, body.token)
          : action === 'join' ? rooms.join(id, body.token)
          : rooms.order(id, body.token, body.turn, body.action));
      } else if (url.pathname === '/api/subscriptions') {
        if (!connections.has(body.connection_id)) throw new RoomError('Connection expired. Reconnect.', 409);
        result = await serial(body.entity_id, () => rooms.subscribe(body.entity_id, body.token, body.connection_id));
      } else if (url.pathname === '/api/subscriptions/remove') {
        result = await serial(body.entity_id, () => rooms.unsubscribe(body.entity_id, body.token, body.subscription));
      } else return respond(response, 404, { error: 'Unknown route.' });
      return respond(response, 200, result);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return respond(response, 405, { error: 'Method not allowed.' });
    const pathname = decodeURIComponent(url.pathname);
    const target = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(dist + sep)) return respond(response, 403, { error: 'Forbidden.' });
    if (!existsSync(target) || !statSync(target).isFile()) {
      return respond(response, 404, { error: 'File not found. Run npm run build to create the frontend.' });
    }
    response.writeHead(200, {
      'Content-Type': types[extname(target)] || 'application/octet-stream',
      'Cache-Control': target.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (request.method === 'HEAD') response.end(); else createReadStream(target).pipe(response);
  } catch (error) {
    if (error instanceof RoomError) respond(response, error.status, { error: error.message });
    else { console.error(error instanceof Error ? error.message : 'Server error'); respond(response, 500, { error: 'The server could not complete this request.' }); }
  }
});
const port = Number(process.env.PORT || 3001);
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Crosscurrent server: http://localhost:${port}`));
function close() {
  for (const response of connections.values()) response.end();
  server.close(() => { db.close(); process.exit(0); });
}
process.once('SIGINT', close); process.once('SIGTERM', close);
