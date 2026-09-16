import {browserRequest} from '@/shared/browser-session';

export type Blocker={code:string;message?:string;detail?:string};
export type GoodsAccess={can_trade_personally:boolean;can_trade_for_pharmacy:boolean;role_code:string|null;role_label:string|null;blockers:Blocker[];eligible_pharmacies:{id:number;label:string;suburb:string;state:string}[]};
export type EthicalContext={pharmacy:{id:number;label:string;suburb:string;state:string};admitted:boolean;action:string;pharmacy_id:number;is_owner:boolean;grant_actions:string[];blockers:Blocker[]};

export const marketApi=<T>(path:string,method='GET',body?:unknown)=>browserRequest<T>(`/api/platform/marketplace/${path}`,method,body);
export const ethicalApi=<T>(path:string,method='GET',body?:unknown)=>browserRequest<T>(`/api/platform/ethical/${path}`,method,body);
