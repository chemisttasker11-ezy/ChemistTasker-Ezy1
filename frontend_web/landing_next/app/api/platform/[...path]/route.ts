import { NextRequest } from 'next/server';
import { platformProxy } from '@/lib/platform-proxy';
export const dynamic='force-dynamic';
async function proxy(request:NextRequest,context:{params:Promise<{path:string[]}>}) { return platformProxy(request,`${(await context.params).path.join('/')}/`); }
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as OPTIONS };
