import {spawn} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv,parseArgs} from 'node:util';
const {values:args}=parseArgs({options:{port:{type:'string'},api:{type:'string'},'dashboard-port':{type:'string'}}});

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const envFile=resolve(root,'../env/web.dev.env');
const env={...(existsSync(envFile)?parseEnv(readFileSync(envFile,'utf8')):{}),...process.env};
const port=args.port||env.WEB_PORT||'3000', dashboardPort=args['dashboard-port']||env.DASHBOARD_PORT||'5173';
const backend=args.api||env.PLATFORM_API_URL||'http://127.0.0.1:8000/api';
const origin=`http://localhost:${port}`;
const dashboardOrigin=`http://localhost:${dashboardPort}`;
Object.assign(env,{VITE_PUBLIC_SITE_ENABLED:'1',VITE_API_URL:'/api',PLATFORM_API_URL:backend,HUB_API_URL:backend,
 VITE_DEV_PROXY_TARGET:backend.replace(/\/api\/?$/, ''),VITE_DEV_WS_PROXY_TARGET:backend.replace(/\/api\/?$/, '').replace(/^http/,'ws'),
 NEXT_PUBLIC_SITE_URL:origin,NEXT_PUBLIC_PLATFORM_URL:origin,
 NEXT_PUBLIC_Maps_API_KEY:env.NEXT_PUBLIC_Maps_API_KEY||env.VITE_Maps_API_KEY||'',
 NEXT_PUBLIC_RECAPTCHA_SITE_KEY:env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY||env.VITE_RECAPTCHA_SITE_KEY||'',
 DASHBOARD_INTERNAL_URL:`http://127.0.0.1:${dashboardPort}`,
 DASHBOARD_PUBLIC_URL:dashboardOrigin,
 NEXT_TELEMETRY_DISABLED:'1'});
const commands=[
 [root,'node_modules/vite/bin/vite.js',['--host','127.0.0.1','--port',dashboardPort]],
 [resolve(root,'landing_next'),'node_modules/next/dist/bin/next',['dev','--hostname','127.0.0.1','--port',port]],
];
for(const [cwd,bin] of commands) if(!existsSync(resolve(cwd,bin))) {
 console.error('Install both frontends first: npm run install:all');process.exit(1);
}
console.log(`\nPublic site: ${origin}\nDashboard/onboarding: ${dashboardOrigin}\nDjango API: ${backend}\nCtrl+C stops both frontends.\n`);
const names=['Vite','Next.js'];
const children=commands.map(([cwd,bin,args])=>spawn(process.execPath,[resolve(cwd,bin),...args],{cwd,env,stdio:['ignore','inherit','inherit']}));
let stopping=false;
function stop(code=0){
 if(stopping)return;
 stopping=true;
 children.forEach(child=>{
  if(process.platform==='win32'&&child.pid){
   try{spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});}catch(e){}
  }else{
   child.kill();
  }
 });
 process.exitCode=code;
}
children.forEach((child,i)=>{
 const name=names[i]||'Child';
 child.on('error',error=>{console.error(`[${name}] error: ${error.message}`);stop(1);});
 child.on('exit',(code,signal)=>{
  console.log(`\n[${name}] exited with code ${code}, signal ${signal}`);
  stop(code??(signal?1:0));
 });
});
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
