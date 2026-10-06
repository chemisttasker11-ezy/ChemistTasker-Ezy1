import {NextRequest} from 'next/server';
import {platformProxy} from '@/lib/platform-proxy';
export const dynamic='force-dynamic';
async function proxy(request:NextRequest,context:{params:Promise<{path:string[]}>}){
 const parts=(await context.params).path;
 // This catch-all is the same-origin facade for the canonical backend only.
 // Dedicated /api/platform and /api/hub BFF routes are handled by their own files.
 if(parts[0]!=='v1') return Response.json({detail:'Not found.'},{status:404});
 return platformProxy(request,`${parts.slice(1).join('/')}/`);
}
export {proxy as GET,proxy as POST,proxy as PUT,proxy as PATCH,proxy as DELETE,proxy as OPTIONS};
