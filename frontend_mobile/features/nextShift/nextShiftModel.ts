import type { Shift } from '@chemisttasker/shared-core';

export type OfflineShift = {
 shiftId: number; slotId: number; pharmacy: string; address: string; role: string;
 start: string; end: string; wallStart: string; wallEnd: string; timeZone: string;
};
const STATE_ZONE: Record<string,string> = {
 QLD:'Australia/Brisbane', NSW:'Australia/Sydney', ACT:'Australia/Sydney',
 VIC:'Australia/Melbourne', TAS:'Australia/Hobart', SA:'Australia/Adelaide',
 WA:'Australia/Perth', NT:'Australia/Darwin',
};
function validDate(date: string): boolean {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
 const dt=new Date(date+'T00:00:00Z');
 return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0,10)===date;
}
function validTime(time: string): boolean {
 if(!/^\d{2}:\d{2}(?::\d{2})?$/.test(time))return false;
 const [h,m,s=0]=time.split(':').map(Number);
 return h<24 && m<60 && s<60;
}
function zoneFor(state?: string | null, explicit?: string | null): string | null {
 const zone=(explicit||'').trim() || STATE_ZONE[String(state||'').toUpperCase()] || '';
 if (!zone || !/^Australia\/[A-Za-z_]+$/.test(zone)) return null;
 try {new Intl.DateTimeFormat('en-AU',{timeZone:zone});return zone;}
 catch{return null;}
}
/** Resolve a pharmacy-local wall clock to an instant, including Australian DST.
 * Nonexistent spring-forward wall times are rejected rather than silently shifted.
 */
function zonedInstant(date:string,time:string,zone:string):string|null {
 if(!validDate(date)||!validTime(time))return null;
 const [year,month,day]=date.split('-').map(Number);
 const [hour,minute,second=0]=time.split(':').map(Number);
 const desired=Date.UTC(year,month-1,day,hour,minute,second);
 const formatter=new Intl.DateTimeFormat('en-AU',{
  timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',
  hourCycle:'h23'
 });
 let epoch=desired;
 for(let i=0;i<4;i++){
  const map=Object.fromEntries(formatter.formatToParts(new Date(epoch)).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
  const wall=Date.UTC(map.year,map.month-1,map.day,map.hour,map.minute,map.second);
  epoch+=desired-wall;
 }
 const parts=Object.fromEntries(formatter.formatToParts(new Date(epoch)).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
 if(parts.year!==year||parts.month!==month||parts.day!==day||parts.hour!==hour||parts.minute!==minute||parts.second!==second)return null;
 return new Date(epoch).toISOString();
}
function nextDate(date:string):string{
 return new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
}
export function sanitizeConfirmedShifts(shifts: Shift[], userId?: number | string | null): OfflineShift[] {
 if(userId==null)return [];
 const rows:OfflineShift[]=[];
 for(const shift of shifts){
  if(!Number.isSafeInteger(shift?.id)||shift.id<=0)continue;
  const pharmacy=shift.pharmacyDetail;
  const address=[pharmacy?.streetAddress,pharmacy?.suburb,pharmacy?.state,pharmacy?.postcode].filter(Boolean).join(', ');
  for(const slot of shift.slots||[]){
   if(!Number.isSafeInteger(slot.id)||slot.id<=0)continue;
   const date=slot.date||'',from=slot.startTime||'',to=slot.endTime||'';
   if(!validDate(date)||!validTime(from)||!validTime(to)||from.slice(0,5)===to.slice(0,5))continue;
   const zone=zoneFor(pharmacy?.state,slot.timezone);
   if(!zone)continue;
   const endDate=to.slice(0,5)<from.slice(0,5)?nextDate(date):date;
   const start=zonedInstant(date,from,zone),end=zonedInstant(endDate,to,zone);
   if(!start||!end||Date.parse(end)<=Date.parse(start))continue;
   rows.push({
    shiftId:shift.id,slotId:slot.id,pharmacy:String(pharmacy?.name||'Pharmacy').slice(0,120),
    address:address.slice(0,300),role:String(shift.roleLabel||shift.roleNeeded||'Shift').slice(0,100),
    start,end,wallStart:date+'T'+from.slice(0,5)+':00',wallEnd:endDate+'T'+to.slice(0,5)+':00',timeZone:zone
   });
  }
 }
 const seen=new Set<string>();
 return rows.sort((a,b)=>a.start.localeCompare(b.start)).filter(row=>{
  const key=row.shiftId+':'+row.slotId;if(seen.has(key))return false;seen.add(key);return true;
 }).slice(0,100);
}
export function upcomingShifts(rows:OfflineShift[],now=new Date()):OfflineShift[]{
 return rows.filter(row=>Date.parse(row.end)>now.getTime()).sort((a,b)=>a.start.localeCompare(b.start));
}
export function calendarEditorUrl(shift:OfflineShift):string{
 const wall=(value:string)=>value.replace(/[-:]/g,'');
 const query=new URLSearchParams({
  action:'TEMPLATE',text:shift.role+' — '+shift.pharmacy,
  dates:wall(shift.wallStart)+'/'+wall(shift.wallEnd),ctz:shift.timeZone,
  details:'Confirmed ChemistTasker shift. Recheck the app for changes before travelling.',
  location:shift.address
 });
 return 'https://calendar.google.com/calendar/render?'+query.toString();
}
export function directionsUrl(shift:OfflineShift):string|null{
 return shift.address?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(shift.address):null;
}
