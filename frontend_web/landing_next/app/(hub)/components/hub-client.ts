import { browserApi } from '@/lib/browser-api';
export function api<T>(path:string,method='GET',body?:unknown):Promise<T> { return browserApi<T>(`/api/hub/${path}`,method,body); }
