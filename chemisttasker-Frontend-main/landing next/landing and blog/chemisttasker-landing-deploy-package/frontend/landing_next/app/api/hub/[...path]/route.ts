import { NextRequest, NextResponse } from 'next/server';
import { backend } from '../../../../lib/hub-server';

const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/hub' };
const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const allowed = [
  /^articles\/$/, /^articles\/[a-zA-Z0-9_-]+\/$/, /^articles\/[a-zA-Z0-9_-]+\/comments\/$/,
  /^articles\/[a-zA-Z0-9_-]+\/reaction\/$/, /^comments\/\d+\/$/,
  /^comments\/\d+\/(reaction|report)\/$/, /^me\/$/,
];
async function proxy(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join('/') + '/';
  // Next's internal request URL may use localhost behind a proxy, even when
  // the browser uses 127.0.0.1 or the public domain. Pin production to the
  // configured public origin; otherwise compare the actual request Host.
  const expectedOrigin = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
    : `${req.nextUrl.protocol}//${req.headers.get('host')}`;
  if (!['GET', 'HEAD'].includes(req.method) && req.headers.get('origin') !== expectedOrigin) {
    return NextResponse.json({ detail: 'Request origin could not be verified.' }, { status: 403, headers: noStore });
  }
  const session = path === 'session/';
  if (!session && !allowed.some(pattern => pattern.test(path))) return new NextResponse(null, { status: 404 });
  if (session && req.method === 'DELETE') {
    const response = NextResponse.json({ detail: 'Signed out.' }, { headers: noStore });
    for (const name of ['hub_access', 'hub_refresh']) response.cookies.set(name, '', { ...cookieOptions, maxAge: 0 });
    return response;
  }
  if (session && !['GET', 'POST'].includes(req.method)) return new NextResponse(null, { status: 405 });
  try {
    let body: string | undefined;
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (!req.headers.get('content-type')?.includes('application/json')) return NextResponse.json({ detail: 'Send JSON.' }, { status: 415 });
      body = await req.text();
      if (body.length > 16000) return NextResponse.json({ detail: 'Request is too large.' }, { status: 413 });
      if (body) { try { JSON.parse(body); } catch { return NextResponse.json({ detail: 'Invalid JSON.' }, { status: 400 }); } }
    }
    const login = session && req.method === 'POST';
    let token = req.cookies.get('hub_access')?.value;
    let newTokens: { access: string; refresh?: string } | undefined;
    const destination = login ? 'users/login/' : `public-hub/${session ? 'me/' : path}`;
    const send = () => fetch(`${backend}/${destination}${req.nextUrl.search}`, {
      method: req.method, cache: 'no-store', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', ...(token && !login ? { Authorization: `Bearer ${token}` } : {}) }, body,
    });
    let upstream = await send();
    const refresh = req.cookies.get('hub_refresh')?.value;
    if (upstream.status === 401 && refresh && !login) {
      const refreshed = await fetch(`${backend}/users/token/refresh/`, { method: 'POST', cache: 'no-store',
        signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh }) });
      if (refreshed.ok) {
        const value = await refreshed.json();
        if (typeof value.access === 'string') { newTokens = { access: value.access, refresh: value.refresh || refresh }; token = value.access; upstream = await send(); }
      }
    }
    let data = upstream.status === 204 ? null : await upstream.json();
    if (login && upstream.ok) {
      if (typeof data.access !== 'string' || typeof data.refresh !== 'string') throw new Error('Invalid session response');
      newTokens = { access: data.access, refresh: data.refresh };
      data = { detail: 'Signed in.' };
    }
    const response = data === null ? new NextResponse(null, { status: upstream.status, headers: noStore }) : NextResponse.json(data, { status: upstream.status, headers: noStore });
    if (newTokens) {
      response.cookies.set('hub_access', newTokens.access, cookieOptions);
      if (newTokens.refresh) response.cookies.set('hub_refresh', newTokens.refresh, cookieOptions);
    }
    if (upstream.status === 401 && !login) for (const name of ['hub_access', 'hub_refresh']) response.cookies.set(name, '', { ...cookieOptions, maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ detail: 'The community service is unavailable. Please try again shortly.' }, { status: 503, headers: noStore });
  }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
