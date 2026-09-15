import type {NextConfig} from 'next';
const dashboard=process.env.DASHBOARD_INTERNAL_URL||'http://127.0.0.1:5173';
const api=process.env.PLATFORM_API_URL||'http://127.0.0.1:8000/api';
const config:NextConfig={poweredByHeader:false,output:'standalone',turbopack:{root:__dirname},
 async rewrites(){return {fallback:[
  ...['dashboard','onboarding','setup'].map(prefix=>({source:`/${prefix}/:path*`,destination:`${dashboard}/${prefix}/:path*`})),
  ...['dashboard-assets','js','assets',...(process.env.NODE_ENV==='development'?['src','@vite','@id','@fs','node_modules','@react-refresh','landing_next/shared']:[])].map(prefix=>({source:`/${prefix}/:path*`,destination:`${dashboard}/${prefix}/:path*`})),
  {source:'/ws/:path*',destination:`${api.replace(/\/api$/, '')}/ws/:path*`},
  {source:'/media/:path*',destination:`${api.replace(/\/api$/, '')}/media/:path*`},
  {source:'/api/:path*',destination:`${api}/:path*`},
 ]};},
};
export default config;
