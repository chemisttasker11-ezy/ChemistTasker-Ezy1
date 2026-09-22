import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Chip, IconButton, Text } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { chemistTaskerApi } from '@/config/api';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { ActionButtons, DataRow, EmptyState, Field, InfoNote, MetricGrid, ParityPage, PharmacyRequired, ScreenLink, Section, palette } from './ParityUI';
import { asArray, dateLabel, errorMessage, replaceUnderscore, toNumber } from './utils';

type AttendanceScreen =
  | 'home'
  | 'clock'
  | 'exception'
  | 'correction'
  | 'reviews'
  | 'review-detail'
  | 'review-decision'
  | 'kiosk-status';

const attendance = chemistTaskerApi.attendance;
const workforce = chemistTaskerApi.workforce;

const titles: Record<AttendanceScreen,string> = {
  home:'Attendance',
  clock:'Clock & breaks',
  exception:'Attendance exception',
  correction:'Attendance correction',
  reviews:'Attendance reviews',
  'review-detail':'Attendance review detail',
  'review-decision':'Review decision',
  'kiosk-status':'Kiosk & PIN status',
};

const managerRoles = new Set(['OWNER','ORGANIZATION','ORG_ADMIN','ORG_OWNER','ORG_STAFF','CHIEF_ADMIN','REGION_ADMIN']);

function canManage(user:any) {
  const role=String(user?.role||'').toUpperCase();
  return managerRoles.has(role) || (Array.isArray(user?.admin_assignments)&&user.admin_assignments.length>0);
}

export function AttendanceParityScreen({screen}:{screen:AttendanceScreen}) {
  const router=useRouter();
  const params=useLocalSearchParams<{id?:string;sessionId?:string;eventId?:string;timesheetId?:string}>();
  const {user}=useAuth();
  const workspace=useWorkspace();
  const pharmacyId=workspace.selectedPharmacyId;
  const manager=canManage(user);
  const [status,setStatus]=useState<any>(null);
  const [pending,setPending]=useState<any[]>([]);
  const [pinPharmacies,setPinPharmacies]=useState<any[]>([]);
  const [timeline,setTimeline]=useState<any>(null);
  const [hours,setHours]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const selectedPending=useMemo(()=>pending.find((row:any)=>String(row.provisional_id||row.id)===String(params.id||''))||null,[pending,params.id]);

  const load=useCallback(async()=>{
    setError('');
    try{
      if(screen==='home'||screen==='clock') setStatus(await attendance.getWorkerStatus());
      if(screen==='reviews'||screen==='review-detail'||screen==='review-decision'||screen==='exception'){
        if(manager&&pharmacyId) setPending(asArray(await attendance.getManagerPending(pharmacyId)));
      }
      if(screen==='kiosk-status') {
        const result=await attendance.getPinPharmacies();
        setPinPharmacies(asArray((result as any)?.pharmacies??result));
      }
      if(screen==='correction'&&!manager) setHours(asArray(await workforce.getMyHours()));
    }catch(e){setError(errorMessage(e,'Unable to load attendance data.'));}
    finally{setLoading(false);setRefreshing(false);}
  },[screen,manager,pharmacyId]);

  useEffect(()=>{void load();},[load]);

  useEffect(()=>{
    const sessionId=selectedPending?.session_id||toNumber(params.sessionId);
    if((screen==='review-detail'||screen==='review-decision'||screen==='exception')&&sessionId){
      attendance.getManagerTimeline(Number(sessionId)).then(setTimeline).catch((e)=>setError(errorMessage(e,'Unable to load attendance timeline.')));
    }
  },[screen,selectedPending,params.sessionId]);

  if((screen==='reviews'||screen==='review-detail'||screen==='review-decision'||screen==='exception')&&manager&&!pharmacyId){
    return <ParityPage title={titles[screen]} subtitle="Pharmacy-scoped attendance review"><PharmacyRequired onOpen={()=>router.push('/owner/dashboard' as any)}/></ParityPage>;
  }

  if(screen==='clock') return <ClockScreen status={status} loading={loading} error={error} onReload={load}/>;
  if(screen==='correction') return <CorrectionScreen manager={manager} rows={hours} params={params} loading={loading} error={error} />;
  if(screen==='kiosk-status') return <KioskStatus rows={pinPharmacies} loading={loading} error={error} />;

  if(screen==='reviews'){
    return <ParityPage title={titles[screen]} subtitle="Review provisional and cross-site attendance before it becomes rostered history." loading={loading} error={error} onRetry={load} onRefresh={()=>{setRefreshing(true);void load();}} refreshing={refreshing}>
      <MetricGrid items={[{label:'Pending',value:pending.length,tone:pending.length?'warning':'success'}]}/>
      <Section title="Pending provisional shifts">
        {pending.length?pending.map((row:any)=><DataRow key={row.provisional_id} title={row.worker_name||row.worker_email||'Worker'} subtitle={`${replaceUnderscore(row.cover_type)} · ${dateLabel(row.started_at)}`} status={row.status||'PENDING'} onPress={()=>router.push(`/attendance/reviews/${row.provisional_id}` as any)}/>):<EmptyState title="Nothing to review" body="No provisional attendance is waiting for a manager decision."/>}
      </Section>
    </ParityPage>;
  }

  if(screen==='review-detail'||screen==='review-decision'||screen==='exception'){
    return <ReviewDetail screen={screen} row={selectedPending} timeline={timeline} loading={loading} error={error} onReload={load}/>;
  }

  const active=Boolean(status?.has_active_session);
  return <ParityPage title="Attendance" subtitle="Clocking, breaks, attendance exceptions and manager review." loading={loading} error={error} onRetry={load} onRefresh={()=>{setRefreshing(true);void load();}} refreshing={refreshing}>
    <MetricGrid items={[
      {label:'Status',value:active?'Clocked in':'Not clocked in',tone:active?'success':'primary'},
      {label:'Pharmacy',value:status?.pharmacy_name||'—'},
      {label:'Break',value:status?.is_on_break?'On break':'Working',tone:status?.is_on_break?'warning':'success'},
    ]}/>
    {status?.is_provisional?<InfoNote title="Provisional attendance" tone="warning">This session needs manager review before it is treated as approved roster history.</InfoNote>:null}
    <Section title="Attendance tools">
      <ScreenLink title="Clock & breaks" subtitle="Clock in/out from a pharmacy QR token and manage breaks." onPress={()=>router.push('/attendance/clock' as any)}/>
      <ScreenLink title="Attendance correction" subtitle={manager?'Append an audited correction to a recorded event.':'Request a missing-punch correction through your timesheet.'} onPress={()=>router.push('/attendance/corrections/new' as any)}/>
      <ScreenLink title="Kiosk & PIN status" subtitle="Review pharmacies with worker PIN setup." onPress={()=>router.push('/attendance/kiosk-status' as any)}/>
      {manager?<ScreenLink title="Manager reviews" subtitle="Approve or reject provisional attendance." onPress={()=>router.push('/attendance/reviews' as any)}/>:null}
      <ScreenLink title="My hours" subtitle="Review timesheet periods and recorded hours." onPress={()=>router.push('/my-hours' as any)}/>
    </Section>
  </ParityPage>;
}

function ClockScreen({status,loading,error,onReload}:{status:any;loading:boolean;error:string;onReload:()=>Promise<void>}) {
  const [qrToken,setQrToken]=useState('');
  const [busy,setBusy]=useState(false);
  const [localError,setLocalError]=useState('');
  const active=Boolean(status?.has_active_session);
  const run=async(kind:'in'|'out'|'break-start'|'break-end')=>{
    setBusy(true);setLocalError('');
    try{
      if(kind==='in') await attendance.clockIn(qrToken.trim());
      if(kind==='out') await attendance.clockOut(qrToken.trim());
      if(kind==='break-start') await attendance.breakStart();
      if(kind==='break-end') await attendance.breakEnd();
      await onReload();
    }catch(e){setLocalError(errorMessage(e,'Attendance action failed.'));}finally{setBusy(false);}
  };
  return <ParityPage title="Clock & breaks" subtitle="Use the pharmacy kiosk QR token for clock in/out. Break actions use the active session." loading={loading} error={error||localError}>
    <MetricGrid items={[{label:'Status',value:active?'Clocked in':'Not clocked in',tone:active?'success':'primary'},{label:'Pharmacy',value:status?.pharmacy_name||'—'},{label:'Started',value:status?.started_at?dateLabel(status.started_at):'—'}]}/>
    {!active||!status?.is_on_break?<Field label="Kiosk QR token" value={qrToken} onChangeText={setQrToken} placeholder="Paste or enter token from the pharmacy kiosk"/>:null}
    <ActionButtons>
      {!active?<Button mode="contained" loading={busy} disabled={!qrToken.trim()||busy} onPress={()=>void run('in')}>Clock in</Button>:null}
      {active&&!status?.is_on_break?<Button mode="contained-tonal" disabled={busy} onPress={()=>void run('break-start')}>Start break</Button>:null}
      {active&&status?.is_on_break?<Button mode="contained-tonal" disabled={busy} onPress={()=>void run('break-end')}>End break</Button>:null}
      {active?<Button mode="outlined" loading={busy} disabled={!qrToken.trim()||busy} onPress={()=>void run('out')}>Clock out</Button>:null}
    </ActionButtons>
    <InfoNote title="Audit trail">Clock, break and correction events are retained as attendance history. Manager corrections append audit records rather than rewriting raw scan events.</InfoNote>
  </ParityPage>;
}

function ReviewDetail({screen,row,timeline,loading,error,onReload}:{screen:AttendanceScreen;row:any;timeline:any;loading:boolean;error:string;onReload:()=>Promise<void>}) {
  const router=useRouter();
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [localError,setLocalError]=useState('');
  const act=async(kind:'approve'|'reject')=>{
    if(!row)return;setBusy(true);setLocalError('');
    try{
      if(kind==='approve') await attendance.approve(Number(row.provisional_id),reason.trim());
      else await attendance.reject(Number(row.provisional_id),reason.trim()||'Rejected by attendance manager');
      await onReload();router.replace('/attendance/reviews' as any);
    }catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}
  };
  const events=asArray<any>(timeline?.timeline);
  return <ParityPage title={titles[screen]} subtitle="Session chronology and audit-safe manager decision." loading={loading} error={error||localError}>
    {!row?<EmptyState title="Attendance record not found" body="This provisional attendance item is no longer pending for the selected pharmacy."/>:<>
      <Section title={row.worker_name||'Worker'} description={row.worker_email}>
        <MetricGrid items={[{label:'Cover type',value:replaceUnderscore(row.cover_type)},{label:'Started',value:dateLabel(row.started_at)},{label:'Ended',value:row.ended_at?dateLabel(row.ended_at):'In progress',tone:row.ended_at?'success':'warning'}]}/>
        {row.source_pharmacy_name?<DataRow title="Home pharmacy" subtitle={row.source_pharmacy_name}/>:null}
      </Section>
      <Section title="Session chronology">
        {events.length?events.map((ev:any,index:number)=><DataRow key={ev.event_id||index} title={replaceUnderscore(ev.event_type||'Attendance event')} subtitle={`${dateLabel(ev.effective_timestamp||ev.original_timestamp)}${ev.is_corrected?' · corrected':''}`} status={ev.is_corrected?'Corrected':'Original'} onPress={()=>router.push(`/attendance/corrections/new?eventId=${ev.event_id}&sessionId=${row.session_id}` as any)}/>):<EmptyState title="No timeline events" body="No event chronology was returned for this session."/>}
      </Section>
      {screen==='review-decision'?<>
        <Field label="Manager note / rejection reason" value={reason} multiline onChangeText={setReason}/>
        <ActionButtons><Button mode="contained" loading={busy} onPress={()=>void act('approve')}>Approve & backfill</Button><Button mode="outlined" textColor={palette.danger} disabled={busy||!reason.trim()} onPress={()=>void act('reject')}>Reject</Button></ActionButtons>
      </>:<Button mode="contained" onPress={()=>router.push(`/attendance/reviews/${row.provisional_id}/decision` as any)}>Make decision</Button>}
    </>}
  </ParityPage>;
}

function CorrectionScreen({manager,rows,params,loading,error}:{manager:boolean;rows:any[];params:any;loading:boolean;error:string}) {
  const [eventId,setEventId]=useState(String(params.eventId||''));
  const [timesheetId,setTimesheetId]=useState(String(params.timesheetId||''));
  const [sessionId,setSessionId]=useState(String(params.sessionId||''));
  const [kind,setKind]=useState<'CLOCK_IN'|'CLOCK_OUT'>('CLOCK_IN');
  const [timestamp,setTimestamp]=useState(new Date().toISOString().slice(0,16));
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [localError,setLocalError]=useState('');
  const [success,setSuccess]=useState('');
  const submit=async()=>{
    setBusy(true);setLocalError('');setSuccess('');
    try{
      if(manager){
        if(!eventId.trim()) throw new Error('Attendance event ID is required for a manager correction.');
        await attendance.correct(toNumber(eventId),new Date(timestamp).toISOString(),reason.trim());
        setSuccess('Correction appended to the attendance audit history.');
      }else{
        if(!timesheetId.trim()||!sessionId.trim()) throw new Error('Select a timesheet/session from My Hours before requesting a missing punch.');
        await workforce.addMissingPunch(toNumber(timesheetId),{sessionId:toNumber(sessionId),eventType:kind,occurredAt:new Date(timestamp).toISOString(),reason:reason.trim()});
        setSuccess('Missing-punch request recorded on the timesheet.');
      }
    }catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}
  };
  return <ParityPage title="Attendance correction" subtitle={manager?'Append a manager correction without deleting original scan evidence.':'Request a missing punch through the workforce timesheet audit trail.'} loading={loading} error={error||localError}>
    {success?<InfoNote title="Saved" tone="success">{success}</InfoNote>:null}
    {manager?<Field label="Attendance event ID" value={eventId} keyboardType="numeric" onChangeText={setEventId}/>:<>
      <InfoNote title="Worker workflow">Use the timesheet and session identifiers from My Hours. Missing punches are reviewed through workforce timesheet checks.</InfoNote>
      <Field label="Timesheet ID" value={timesheetId} keyboardType="numeric" onChangeText={setTimesheetId}/>
      <Field label="Session ID" value={sessionId} keyboardType="numeric" onChangeText={setSessionId}/>
      <View style={{flexDirection:'row',gap:8}}><Chip selected={kind==='CLOCK_IN'} onPress={()=>setKind('CLOCK_IN')}>Missing clock in</Chip><Chip selected={kind==='CLOCK_OUT'} onPress={()=>setKind('CLOCK_OUT')}>Missing clock out</Chip></View>
    </>}
    <Field label="Corrected date/time" value={timestamp} onChangeText={setTimestamp}/>
    <Field label="Reason" value={reason} multiline onChangeText={setReason}/>
    <Button mode="contained" loading={busy} disabled={busy||!reason.trim()} onPress={()=>void submit()}>{manager?'Save correction':'Request correction'}</Button>
  </ParityPage>;
}

function KioskStatus({rows,loading,error}:{rows:any[];loading:boolean;error:string}) {
  const router=useRouter();
  return <ParityPage title="Kiosk & PIN status" subtitle="Worker PIN setup across pharmacies available to your account." loading={loading} error={error}>
    <Section title="Pharmacies">{rows.length?rows.map((row:any)=><DataRow key={row.id} title={row.name} subtitle={row.has_pin?'Worker PIN is configured':'Worker PIN setup required'} status={row.has_pin?'Ready':'Action needed'} onPress={()=>router.push('/attendance-pin' as any)}/>):<EmptyState title="No PIN pharmacies" body="No pharmacies are currently available for worker PIN management."/>}</Section>
    <InfoNote title="Kiosk access">Kiosk pairing remains an explicit deep-link/device workflow. This screen exposes only the authenticated worker PIN status and setup entry point.</InfoNote>
  </ParityPage>;
}
