'use client';
import {chemistTaskerApi} from './chemisttasker-api';
export {csrfToken} from '../shared/browser-session';
export const contentApi=<T>(path:string,method='GET',body?:unknown)=>chemistTaskerApi.contentManagement.request<T>(`/content/${path}`,{method,body:body as object|undefined});
