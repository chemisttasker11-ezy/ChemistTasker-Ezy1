import type {NextConfig} from 'next';
import path from 'node:path';

const dashboard=process.env.DASHBOARD_INTERNAL_URL||'http://127.0.0.1:5173';
const dashboardPublic=process.env.DASHBOARD_PUBLIC_URL||'http://localhost:5173';
const api=process.env.PLATFORM_API_URL||'http://127.0.0.1:8000/api';
const isDev=process.env.NODE_ENV==='development';

const viteOwnedPrefixes=['onboarding','setup','kiosk','membership'];
const viteDashboardPrefixes=[
 'attendance',
 'workforce',
 'my-hours',
 'my-leave',
 'organization',
 'pharmacy-hub',
 'admin',
 'owner',
 'pharmacist',
 'otherstaff',
 'explorer',
];

const config:NextConfig={
 poweredByHeader:false,
 output:'standalone',
 skipTrailingSlashRedirect:true,
 // Include the repository root so Turbopack can resolve the linked
 // file:../../shared-core package used by local installs.
 turbopack:{root:path.resolve(__dirname,'../..')},

 async redirects(){
  if(!isDev)return [];

  return [
   // Keep the exact /dashboard URL on Next so DashboardGate can resolve the
   // signed-in user's role. All real dashboard workspaces then move the
   // browser itself to Vite :5173. A proxy rewrite would leave the browser
   // origin at :3000 and Google Maps/Places would still see localhost:3000.
   ...viteDashboardPrefixes.map(prefix=>({
    source:`/dashboard/${prefix}/:path*`,
    destination:`${dashboardPublic}/dashboard/${prefix}/:path*`,
    permanent:false,
   })),
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
