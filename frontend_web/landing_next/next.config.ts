import type {NextConfig} from 'next';

const dashboard=process.env.DASHBOARD_INTERNAL_URL||'http://127.0.0.1:5173';
const dashboardPublic=process.env.DASHBOARD_PUBLIC_URL||'http://localhost:5173';
const api=process.env.PLATFORM_API_URL||'http://127.0.0.1:8000/api';
const isDev=process.env.NODE_ENV==='development';

const viteOwnedPrefixes=['onboarding','setup','kiosk','membership'];

const config:NextConfig={
 poweredByHeader:false,
 output:'standalone',
 skipTrailingSlashRedirect:true,
 turbopack:{root:__dirname},

 async redirects(){
  if(!isDev)return [];

  return [
   // Keep /dashboard on Next so DashboardGate can resolve the signed-in role.
   // Once it resolves to a real dashboard path, move the browser itself to
   // Vite :5173. This matters for Google Maps/Places referrer restrictions:
   // a rewrite through :3000 would still look like localhost:3000 to Google.
   {
    source:'/dashboard/:path+',
    destination:`${dashboardPublic}/dashboard/:path+`,
    permanent:false,
   },
   ...viteOwnedPrefixes.map(prefix=>({
    source:`/${prefix}/:path*`,
    destination:`${dashboardPublic}/${prefix}/:path*`,
    permanent:false,
   })),
  ];
 },

 async rewrites(){return {fallback:[
  // Production/staging keep the single-origin reverse-proxy behaviour.
  // In development, redirects above take precedence for Vite-owned pages.
  ...['dashboard','onboarding','setup','kiosk','membership'].map(prefix=>({source:`/${prefix}/:path*`,destination:`${dashboard}/${prefix}/:path*`})),
  {source:'/kiosk',destination:`${dashboard}/kiosk`},
  ...['dashboard-assets','js','assets','images',...(isDev?['src','@vite','@id','@fs','node_modules','@react-refresh','landing_next/shared']:[])].map(prefix=>({source:`/${prefix}/:path*`,destination:`${dashboard}/${prefix}/:path*`})),
  {source:'/ws/:path*',destination:`${api.replace(/\/api$/, '')}/ws/:path*`},
  {source:'/media/:path*',destination:`${api.replace(/\/api$/, '')}/media/:path*`},
  {source:'/api/:path*',destination:`${api}/:path*`},
 ]};},
};

export default config;
