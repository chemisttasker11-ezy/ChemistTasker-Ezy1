import { chemistTaskerApi } from '@/lib/chemisttasker-api';
export function api<T>(path:string,method='GET',body?:unknown):Promise<T> { return chemistTaskerApi.publicContent.request<T>(`/public-hub/${path}`,{method,body:body as object|undefined}); }
