import {redirect} from 'next/navigation';
import {safeNext} from '@/shared/browser-session';
export default async function SignIn({searchParams}:{searchParams:Promise<{next?:string}>}){const next=safeNext((await searchParams).next)||'/hubs';redirect(`/login?next=${encodeURIComponent(next)}`);}
