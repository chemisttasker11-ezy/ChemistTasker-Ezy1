import type { Shift } from '@chemisttasker/shared-core';

export type OfflineShift = {
 shiftId: number; slotId: number; pharmacy: string; address: string;
 role: string; start: string; end: string;
};
function timestamp(date: string, time: string): string | null {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) return null;
 const [hour, minute] = time.split(':').map(Number);
 if (hour > 23 || minute > 59) return null;
 const local = new Date(date + 'T' + time.slice(0,5) + ':00');
 return Number.isFinite(local.getTime()) && local.getFullYear() === Number(date.slice(0,4))
   && local.getMonth()+1 === Number(date.slice(5,7)) && local.getDate() === Number(date.slice(8))
   ? local.toISOString() : null;
}
/** Only non-financial presentation data from server-filtered assigned worker slots. */
export function sanitizeConfirmedShifts(shifts: Shift[], userId?: number | string | null): OfflineShift[] {
 if (userId == null) return [];
 const rows: OfflineShift[] = [];
 for (const shift of shifts) {
  if (!Number.isSafeInteger(shift?.id) || shift.id<=0) continue;
  const pharmacy=shift.pharmacyDetail;
  const address=[pharmacy?.streetAddress,pharmacy?.suburb,pharmacy?.state,pharmacy?.postcode].filter(Boolean).join(', ');
  for (const slot of shift.slots || []) {
   if (!Number.isSafeInteger(slot.id) || slot.id<=0) continue;
   const start=timestamp(slot.date || '',slot.startTime || '');
   const end=timestamp(slot.date || '',slot.endTime || '');
   if (!start || !end || Date.parse(end)<=Date.parse(start)) continue;
   rows.push({shiftId:shift.id,slotId:slot.id,
    pharmacy:String(pharmacy?.name||'Pharmacy').slice(0,120),address:address.slice(0,300),
    role:String(shift.roleLabel||shift.roleNeeded||'Shift').slice(0,100),start,end});
  }
 }
 const seen=new Set<string>();
 return rows.sort((a,b)=>a.start.localeCompare(b.start)).filter(row=>{
  const key=row.shiftId+':'+row.slotId;
  if(seen.has(key))return false;
  seen.add(key);return true;
 }).slice(0,100);
}
export function upcomingShifts(rows: OfflineShift[], now = new Date()): OfflineShift[] {
 return rows.filter(row=>Date.parse(row.end)>now.getTime()).sort((a,b)=>a.start.localeCompare(b.start));
}
export function calendarEditorUrl(shift: OfflineShift): string {
 const stamp=(value:string)=>value.replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const query=new URLSearchParams({
  action:'TEMPLATE',text:shift.role+' — '+shift.pharmacy,
  dates:stamp(shift.start)+'/'+stamp(shift.end),
  details:'Confirmed ChemistTasker shift. Recheck the app for changes before travelling.',
  location:shift.address
 });
 return 'https://calendar.google.com/calendar/render?'+query.toString();
}
export function directionsUrl(shift: OfflineShift): string | null {
 return shift.address ? 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(shift.address) : null;
}
