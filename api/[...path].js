const BACKEND = 'https://kimeiga--01a0b172475676fa961044fb286e97ea.web.val.run';

export default async function handler(request, response) {
  const incoming = new URL(request.url || '/', 'https://crosscurrent.local');
  const pathname = incoming.pathname;
  let path = pathname.startsWith('/api/') ? pathname.slice(5) : '';
  if (path === '_healthcheck') path = 'health';
  if (!path) return response.status(404).json({ error: 'Unknown route.' });

  const method = request.method || 'GET';
  if (method !== 'GET' && method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const upstream = await fetch(`${BACKEND}/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(request.body ?? {}),
      cache: 'no-store',
    });
    const text = await upstream.text();
    response.status(upstream.status);
    response.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'application/json',
    );
    response.setHeader('Cache-Control', 'no-store');
    return response.send(text);
  } catch {
    return response.status(503).json({
      error: 'The private table service is temporarily unavailable.',
    });
  }
}
