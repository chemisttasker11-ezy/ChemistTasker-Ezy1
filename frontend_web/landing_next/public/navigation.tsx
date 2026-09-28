'use client';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams as useNextSearchParams, useParams as useNextParams } from 'next/navigation';
import { forwardRef, useCallback, type AnchorHTMLAttributes } from 'react';
type To = string | { pathname?: string; search?: string; hash?: string };
const hrefOf = (to: To) => typeof to === 'string' ? to : `${to.pathname || ''}${to.search || ''}${to.hash || ''}`;
function consumeBridgePayload(pathname:string){
  if(typeof window==='undefined')return null;
  const url=new URL(window.location.href);
  const encoded=url.searchParams.get('__ct_bridge');
  if(!encoded)return null;
  try{
    const normalized=encoded.replace(/-/g,'+').replace(/_/g,'/');
    const padded=normalized.padEnd(Math.ceil(normalized.length/4)*4,'=');
    const payload=JSON.parse(decodeURIComponent(Array.from(atob(padded),char=>`%${char.charCodeAt(0).toString(16).padStart(2,'0')}`).join('')));
    if(payload?.path===pathname&&payload.state!==undefined)sessionStorage.setItem(`ct:route:${pathname}`,JSON.stringify(payload.state));
    if(typeof payload?.returnTo==='string')sessionStorage.setItem('ct:return-to',payload.returnTo);
  }catch{}
  url.searchParams.delete('__ct_bridge');
  window.history.replaceState(window.history.state,'',url.pathname+(url.search?`?${url.searchParams}`:'')+url.hash);
  try{return JSON.parse(sessionStorage.getItem(`ct:route:${pathname}`)||'null');}catch{return null;}
}
export function useNavigate() {
  const router = useRouter();
  return useCallback((to: To | number, options?: { replace?: boolean; state?: unknown }) => {
    if (typeof to === 'number') { window.history.go(to); return; }
    const href = hrefOf(to);
    if (options?.state !== undefined) sessionStorage.setItem(`ct:route:${href.split('?')[0]}`, JSON.stringify(options.state));
    if (/^\/(dashboard|onboarding|setup)(\/|$)/.test(href) && !href.startsWith('/onboarding/referee-reject/')) { window.location.assign(href); return; }
    if (options?.replace) router.replace(href); else router.push(href);
  }, [router]);
}
export function useLocation() {
  const pathname = usePathname(); const params = useNextSearchParams();
  let state: any = null;
  if (typeof window !== 'undefined') { state=consumeBridgePayload(pathname); if(state===null)try { state = JSON.parse(sessionStorage.getItem(`ct:route:${pathname}`) || 'null'); } catch {} }
  return { pathname, search: params.size ? `?${params}` : '', hash: typeof window === 'undefined' ? '' : window.location.hash, state, key: pathname };
}
export function useParams<T extends Record<string, string | undefined>>() { return useNextParams() as T; }
export function useSearchParams() {
  const params = useNextSearchParams(); const navigate = useNavigate(); const pathname = usePathname();
  return [params, (next: URLSearchParams | string, options?: {replace?: boolean}) => navigate(`${pathname}?${next}`, options)] as const;
}
type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: To; replace?: boolean; state?: unknown };
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, replace, state, onClick, ...props }, ref) {
  const href = hrefOf(to);
  if (/^\/(dashboard|onboarding|setup)(\/|$)/.test(href) && !href.startsWith('/onboarding/referee-reject/')) return <a {...props} href={href} ref={ref} onClick={onClick}/>;
  return <NextLink {...props} href={href} replace={replace} ref={ref} onClick={event => {
    onClick?.(event);
    if (!event.defaultPrevented && state !== undefined) sessionStorage.setItem(`ct:route:${href.split('?')[0]}`, JSON.stringify(state));
  }}/>;
});
