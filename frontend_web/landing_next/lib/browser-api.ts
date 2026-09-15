'use client';
import {browserRequest} from '../shared/browser-session';
export {csrfToken} from '../shared/browser-session';
export const browserApi=browserRequest;
export const contentApi=<T>(path:string,method='GET',body?:unknown)=>browserRequest<T>(`/api/platform/content/${path}`,method,body);
