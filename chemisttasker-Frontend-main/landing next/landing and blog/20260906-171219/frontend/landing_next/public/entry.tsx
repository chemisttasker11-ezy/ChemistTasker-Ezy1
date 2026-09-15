'use client';
import dynamic from 'next/dynamic';
const Runtime=dynamic(()=>import('./runtime'),{ssr:false,loading:()=> <div className="public-loading" role="status">Loading…</div>});
export default function PublicEntry({page}:{page:string}){return <div className="public-migrated"><Runtime page={page}/></div>;}
