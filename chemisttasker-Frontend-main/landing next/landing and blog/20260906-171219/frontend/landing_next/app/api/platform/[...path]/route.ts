import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
async function proxy(request: NextRequest, context: {params: Promise<{path: string[]}>}) {
  const {path} = await context.params;
  if (path.some(segment => !/^[A-Za-z0-9_.~-]+$/.test(segment) || segment === '..')) return Response.json({detail:'Invalid API path.'},{status:400});
  if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) return Response.json({detail:'Invalid request origin.'},{status:403});
  }
  const base = (process.env.PLATFORM_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
  const url = `${base}/${path.join('/')}/${request.nextUrl.search}`;
  const headers = new Headers();
  for (const name of ['authorization','content-type','accept']) { const value = request.headers.get(name); if(value) headers.set(name,value); }
  try {
    const response = await fetch(url, {method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer(),cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(20000)});
    return new Response(response.body,{status:response.status,headers:{'content-type':response.headers.get('content-type') || 'application/json','cache-control':'no-store'}});
  } catch { return Response.json({detail:'The platform service is unavailable. Please try again shortly.'},{status:502}); }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as OPTIONS };
