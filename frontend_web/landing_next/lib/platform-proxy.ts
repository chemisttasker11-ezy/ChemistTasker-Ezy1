import 'server-only';
import { NextRequest } from 'next/server';
export async function platformProxy(request: NextRequest, path: string, method = request.method, baseOverride?: string) {
  if (path.split('/').some(segment => segment === '..' || !/^[A-Za-z0-9_.~-]*$/.test(segment))) return Response.json({detail:'Invalid API path.'},{status:400});
  const expected = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin : `${request.nextUrl.protocol}//${request.headers.get('host')}`;
  if (!['GET','HEAD','OPTIONS'].includes(method) && request.headers.get('origin') !== expected) return Response.json({detail:'Request origin could not be verified.'},{status:403});
  const headers = new Headers();
  for (const name of ['authorization','content-type','accept','cookie','origin','x-csrftoken','x-client-platform']) { const value=request.headers.get(name); if(value) headers.set(name,value); }
  headers.set('x-forwarded-proto',new URL(expected).protocol.replace(':',''));
  const base=(baseOverride || process.env.PLATFORM_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/,'');
  try {
    const body=['GET','HEAD','OPTIONS'].includes(method)?undefined:await request.arrayBuffer();
    if(body && body.byteLength>6*1024*1024) return Response.json({detail:'Request too large.'},{status:413});
    const upstream=await fetch(`${base}/${path}${request.nextUrl.search}`,{method,headers,body,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)});
    const outgoing=new Headers({'cache-control':'private, no-store',vary:'Cookie, Authorization'});
    for(const name of ['content-type','content-disposition','retry-after','x-content-type-options','content-security-policy','accept-ranges','content-range']) { const value=upstream.headers.get(name); if(value) outgoing.set(name,value); }
    for(const cookie of upstream.headers.getSetCookie()) outgoing.append('set-cookie',cookie);
    return new Response(upstream.body,{status:upstream.status,headers:outgoing});
  } catch { return Response.json({detail:'The platform service is unavailable. Please try again.'},{status:503}); }
}
