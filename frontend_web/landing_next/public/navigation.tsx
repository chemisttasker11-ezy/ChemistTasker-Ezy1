'use client';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams as useNextSearchParams, useParams as useNextParams } from 'next/navigation';
import { forwardRef, useCallback, type AnchorHTMLAttributes } from 'react';
type To = string | { pathname?: string; search?: string; hash?: string };
const hrefOf = (to: To) => typeof to === 'string' ? to : `${to.pathname || ''}${to.search || ''}${to.hash || ''}`;
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
  if (typeof window !== 'undefined') { try { state = JSON.parse(sessionStorage.getItem(`ct:route:${pathname}`) || 'null'); } catch {} }
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
