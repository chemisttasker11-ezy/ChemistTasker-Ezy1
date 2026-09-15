import { NextRequest } from 'next/server';
import { platformProxy } from '@/lib/platform-proxy';
export const dynamic='force-dynamic';
async function proxy(request:NextRequest,context:{params:Promise<{path:string[]}>}) {
 const path=(await context.params).path.join('/')+'/';
 if(path==='session/') {
  const mapping:Record<string,[string,string]>={GET:['public-hub/me/','GET'],POST:['users/login/','POST'],DELETE:['users/logout/','POST']};
  const target=mapping[request.method]; if(!target) return new Response(null,{status:405});
  return platformProxy(request,...target);
 }
 return platformProxy(request,`public-hub/${path}`,request.method,process.env.HUB_API_URL);
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
