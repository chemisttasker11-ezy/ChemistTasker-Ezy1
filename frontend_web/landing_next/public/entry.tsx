'use client';
import dynamic from 'next/dynamic';
import {useEffect} from 'react';
import {useSession} from '@/shared/session-provider';
import {returnDestination,finishDestination,rememberDestination} from '@/shared/browser-session';
const Runtime=dynamic(()=>import('./runtime'),{ssr:false,loading:()=> <div className="public-loading" role="status">Loading…</div>});
export default function PublicEntry({page}:{page:string}){const session=useSession();useEffect(()=>{if(page==='register')rememberDestination(new URLSearchParams(window.location.search).get('next'));if(page==='register'&&session.user)finishDestination(returnDestination()||'/dashboard');},[page,session.user]);if(page==='register'&&session.status!=='anonymous')return <p role="status">{session.user?'Opening your workspace…':'Checking your account…'}</p>;return <div className="public-migrated"><Runtime page={page}/></div>;}
