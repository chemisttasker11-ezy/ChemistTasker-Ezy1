'use client';
import {useEffect} from 'react';
import {useSession} from '@/shared/session-provider';
import {loginHref} from '@/shared/browser-session';
import {resolveDashboardPath} from '@/migrated/utils/dashboardPath';
export default function DashboardGate(){const {user,status,reload}=useSession();useEffect(()=>{if(status==='anonymous')window.location.replace(loginHref('/dashboard'));else if(user){const path=resolveDashboardPath(user.role);if(path!=='/dashboard')window.location.replace(path);}},[user,status]);return <main className="container" style={{padding:'64px 24px'}}>{status==='unavailable'?<><h1>Your account is temporarily unavailable.</h1><button onClick={()=>void reload()}>Try again</button></>:<p role="status">{user&&resolveDashboardPath(user.role)==='/dashboard'?'Your account does not have a dashboard assigned.':'Opening your dashboard…'}</p>}</main>;}
