import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, Chip, Icon, Text } from 'react-native-paper';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { attendance, canManageKioskDevices, workforce } from '@chemisttasker/shared-core';
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
  const canManageKiosk=pharmacyId!=null&&canManageKioskDevices(user,pharmacyId);
  const [status,setStatus]=useState<any>(null);
  const [pending,setPending]=useState<any[]>([]);
  const [pinPharmacies,setPinPharmacies]=useState<any[]>([]);
  const [kioskDevices,setKioskDevices]=useState<any[]>([]);
  const [timeline,setTimeline]=useState<any>(null);
  const [hours,setHours]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const loadSequence=useRef(0);

  const selectedPending=useMemo(()=>pending.find((row:any)=>String(row.provisional_id||row.id)===String(params.id||''))||null,[pending,params.id]);

  const load=useCallback(async()=>{
    const sequence=++loadSequence.current;
    setError('');
    try{
      if(screen==='home'||screen==='clock') setStatus(await attendance.getWorkerStatus());
      if(screen==='reviews'||screen==='review-detail'||screen==='review-decision'||screen==='exception'){
        if(manager&&pharmacyId) setPending(asArray(await attendance.getManagerPending(pharmacyId)));
      }
      if(screen==='kiosk-status') {
        const result=await attendance.getPinPharmacies();
        if(sequence!==loadSequence.current) return;
        setPinPharmacies(asArray((result as any)?.pharmacies??result));
        if(canManageKiosk&&pharmacyId){
          const devices=await attendance.getManagerKioskDevices(pharmacyId);
          if(sequence!==loadSequence.current) return;
          setKioskDevices(asArray((devices as any)?.devices??devices));
        }else{
          setKioskDevices([]);
        }
      }
      if(screen==='correction'&&!manager) setHours(asArray(await workforce.getMyHours()));
    }catch(e){if(sequence===loadSequence.current)setError(errorMessage(e,'Unable to load attendance data.'));}
    finally{if(sequence===loadSequence.current){setLoading(false);setRefreshing(false);}}
  },[screen,manager,canManageKiosk,pharmacyId]);

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
  if(screen==='kiosk-status') return <KioskStatus rows={pinPharmacies} devices={kioskDevices} canManageKiosk={canManageKiosk} pharmacyId={pharmacyId} loading={loading} error={error} onReload={load} />;

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
  const [scannerOpen,setScannerOpen]=useState(false);
  const [scanLocked,setScanLocked]=useState(false);
  const [permission,requestPermission]=useCameraPermissions();
  const active=Boolean(status?.has_active_session);
  const run=async(kind:'in'|'out'|'break-start'|'break-end',scannedToken?:string)=>{
    const token=(scannedToken??qrToken).trim();
    setBusy(true);setLocalError('');
    try{
      if(kind==='in') await attendance.clockIn(token);
      if(kind==='out') await attendance.clockOut(token);
      if(kind==='break-start') await attendance.breakStart();
      if(kind==='break-end') await attendance.breakEnd();
      setQrToken('');
      setScannerOpen(false);
      await onReload();
    }catch(e){setLocalError(errorMessage(e,'Attendance action failed.'));}
    finally{setBusy(false);setScanLocked(false);}
  };

  const openScanner=async()=>{
    setLocalError('');
    if(!permission?.granted){
      if(permission&&!permission.canAskAgain){
        setLocalError('Camera access is blocked. Open device settings and allow camera access for ChemistTasker.');
        return;
      }
      const next=await requestPermission();
      if(!next.granted){
        setLocalError(next.canAskAgain
          ? 'Camera permission is required to scan the pharmacy attendance QR code.'
          : 'Camera access is blocked. Open device settings and allow camera access for ChemistTasker.');
        return;
      }
    }
    setScanLocked(false);
    setScannerOpen(true);
  };

  const handleBarcodeScanned=({data}:BarcodeScanningResult)=>{
    if(scanLocked||busy||!data?.trim()) return;
    const token=data.trim();
    setScanLocked(true);
    setQrToken(token);
    void run(active?'out':'in',token);
  };

  const cameraBlocked=permission?.status==='denied'&&!permission.canAskAgain;

  return <ParityPage title="Clock & breaks" subtitle="Scan the rotating pharmacy kiosk QR to clock in or out. Break actions use your active session." loading={loading} error={error||localError}>
    <MetricGrid minItemWidth={140} items={[{label:'Status',value:active?'Clocked in':'Not clocked in',tone:active?'success':'primary'},{label:'Pharmacy',value:status?.pharmacy_name||'—'},{label:'Started',value:status?.started_at?dateLabel(status.started_at):'—'}]}/>

    <Section title={active?'Scan to clock out':'Scan to clock in'} description="The kiosk QR changes regularly and is valid only for its pharmacy.">
      {scannerOpen ? <View style={scannerStyles.scannerShell}>
        <View style={scannerStyles.cameraFrame}>
          <CameraView
            accessibilityLabel="Attendance QR camera"
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{barcodeTypes:['qr']}}
            onBarcodeScanned={scanLocked||busy?undefined:handleBarcodeScanned}
          />
          <View pointerEvents="none" style={scannerStyles.scanOverlay}>
            <View style={scannerStyles.guideFrame} />
          </View>
          <View style={scannerStyles.cameraStatus}>
            <Icon source={busy?'progress-clock':'qrcode-scan'} size={20} color="#FFFFFF" />
            <Text style={scannerStyles.cameraStatusText}>{busy?'Verifying attendance…':'Centre the kiosk QR inside the frame'}</Text>
          </View>
        </View>
        <Button mode="outlined" disabled={busy} icon="close" onPress={()=>setScannerOpen(false)}>Cancel scanner</Button>
      </View> : <View style={scannerStyles.scanStart}>
        <View style={scannerStyles.scanIcon} accessibilityElementsHidden>
          <Icon source="qrcode-scan" size={30} color={palette.primary} />
        </View>
        <View style={scannerStyles.scanCopy}>
          <Text variant="titleSmall" style={scannerStyles.scanTitle}>Ready to scan</Text>
          <Text variant="bodySmall" style={scannerStyles.scanBody}>Hold your phone steady in front of the QR displayed on the kiosk.</Text>
        </View>
        <Button mode="contained" loading={busy} disabled={busy} icon="camera-outline" onPress={()=>void openScanner()}>
          Open camera
        </Button>
        {cameraBlocked?<Button mode="text" icon="cog-outline" onPress={()=>void Linking.openSettings()}>Open device settings</Button>:null}
      </View>}
    </Section>

    <Section title="Manual fallback" description="Use the token only when the camera cannot scan the displayed code.">
      <Field label="Kiosk QR token" value={qrToken} onChangeText={setQrToken} placeholder="Paste or enter the QR token"/>
      {!active?<Button mode="outlined" loading={busy} disabled={!qrToken.trim()||busy} onPress={()=>void run('in')}>Clock in with token</Button>:null}
      {active?<Button mode="outlined" loading={busy} disabled={!qrToken.trim()||busy} onPress={()=>void run('out')}>Clock out with token</Button>:null}
    </Section>

    {active?<Section title="Breaks" description="Break actions use your current attendance session and do not need another scan.">
      <ActionButtons>
        {!status?.is_on_break?<Button mode="contained-tonal" disabled={busy} onPress={()=>void run('break-start')}>Start break</Button>:null}
        {status?.is_on_break?<Button mode="contained-tonal" disabled={busy} onPress={()=>void run('break-end')}>End break</Button>:null}
      </ActionButtons>
    </Section>:null}
    <InfoNote title="Audit trail">QR clocking, kiosk PIN clocking, breaks and corrections feed the same attendance history and timesheet workflow.</InfoNote>
  </ParityPage>;
}

const scannerStyles=StyleSheet.create({
  scannerShell:{gap:12},
  cameraFrame:{height:360,borderRadius:16,overflow:'hidden',backgroundColor:'#07111F',position:'relative'},
  scanOverlay:{...StyleSheet.absoluteFillObject,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(7,17,31,0.24)'},
  guideFrame:{width:'68%',aspectRatio:1,borderWidth:3,borderRadius:16,borderColor:'#FFFFFF',backgroundColor:'transparent'},
  cameraStatus:{position:'absolute',left:16,right:16,bottom:16,minHeight:48,borderRadius:12,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'rgba(7,17,31,0.82)'},
  cameraStatusText:{color:'#FFFFFF',fontWeight:'700',textAlign:'center',flexShrink:1},
  scanStart:{gap:12,alignItems:'stretch'},
  scanIcon:{width:56,height:56,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:palette.primarySoft},
  scanCopy:{gap:4},
  scanTitle:{color:palette.text,fontWeight:'700'},
  scanBody:{color:palette.muted,lineHeight:20},
});

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
        await workforce.addMissingPunch(toNumber(timesheetId),{session_id:toNumber(sessionId),event_type:kind,occurred_at:new Date(timestamp).toISOString(),reason:reason.trim()});
        setSuccess('Missing-punch request recorded on the timesheet.');
      }
    }catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}
  };
  return <ParityPage title="Attendance correction" subtitle={manager?'Append a manager correction without deleting original scan evidence.':'Request a missing punch through the workforce timesheet audit trail.'} loading={loading} error={error||localError}>
    {success?<InfoNote title="Saved" tone="success">{success}</InfoNote>:null}
    {manager?<Field label="Attendance event ID" value={eventId} keyboardType="numeric" onChangeText={setEventId}/>:<>
      <InfoNote title="Worker workflow">Select the relevant timesheet, then provide the attendance session identifier for the missing punch. Requests are reviewed through workforce timesheet checks.</InfoNote>
      {rows.length?<Section title="Timesheet period">{rows.map((row:any)=><DataRow key={row.id} title={row.pharmacy?.name||'Pharmacy'} subtitle={String(row.start_date||'')+' – '+String(row.end_date||'')+' · '+replaceUnderscore(row.status||'')} status={timesheetId===String(row.id)?'Selected':undefined} onPress={()=>setTimesheetId(String(row.id))}/>)}</Section>:null}
      <Field label="Timesheet ID" value={timesheetId} keyboardType="numeric" onChangeText={setTimesheetId}/>
      <Field label="Session ID" value={sessionId} keyboardType="numeric" onChangeText={setSessionId}/>
      <View style={{flexDirection:'row',gap:8}}><Chip selected={kind==='CLOCK_IN'} onPress={()=>setKind('CLOCK_IN')}>Missing clock in</Chip><Chip selected={kind==='CLOCK_OUT'} onPress={()=>setKind('CLOCK_OUT')}>Missing clock out</Chip></View>
    </>}
    <Field label="Corrected date/time" value={timestamp} onChangeText={setTimestamp}/>
    <Field label="Reason" value={reason} multiline onChangeText={setReason}/>
    <Button mode="contained" loading={busy} disabled={busy||!reason.trim()} onPress={()=>void submit()}>{manager?'Save correction':'Request correction'}</Button>
  </ParityPage>;
}

function KioskStatus({rows,devices,canManageKiosk,pharmacyId,loading,error,onReload}:{rows:any[];devices:any[];canManageKiosk:boolean;pharmacyId:number|null;loading:boolean;error:string;onReload:()=>Promise<void>}) {
  const router=useRouter();
  const [confirmDeviceId,setConfirmDeviceId]=useState<number|null>(null);
  const [busyDeviceId,setBusyDeviceId]=useState<number|null>(null);
  const [localError,setLocalError]=useState('');
  const [success,setSuccess]=useState('');

  const revokeDevice=async(device:any)=>{
    setBusyDeviceId(Number(device.id));setLocalError('');setSuccess('');
    try{
      await attendance.revokeManagerKioskDevice(Number(device.id));
      setConfirmDeviceId(null);
      setSuccess(`${device.device_name||'Kiosk terminal'} was revoked.`);
      await onReload();
    }catch(e){
      setLocalError(errorMessage(e,'Unable to revoke this kiosk device.'));
    }finally{
      setBusyDeviceId(null);
    }
  };

  return <ParityPage title="Kiosk devices & PINs" subtitle="Review attendance terminals and worker PIN setup." loading={loading} error={error||localError} onRetry={onReload}>
    {success?<InfoNote title="Device updated" tone="success">{success}</InfoNote>:null}
    {canManageKiosk?<Section title="Registered kiosk devices" description="Revocation blocks new attendance. Previously signed offline evidence can still upload for review.">
      {!pharmacyId?<PharmacyRequired onOpen={()=>router.push('/owner/dashboard' as any)}/>:devices.length?devices.map((device:any)=><View key={device.id} style={{paddingVertical:14,borderBottomWidth:1,borderBottomColor:palette.border,gap:8}}>
        <DataRow title={device.device_name||'Kiosk terminal'} subtitle={[replaceUnderscore(device.client_kind||''),device.platform||'Unknown platform',device.app_version?`v${device.app_version}`:null].filter(Boolean).join(' · ')} status={device.is_active?'Active':'Revoked'} />
        <MetricGrid items={[
          {label:'Last seen',value:device.last_seen_at?dateLabel(device.last_seen_at):'Never'},
          {label:'Last sync',value:device.last_sync_at?dateLabel(device.last_sync_at):'Never'},
          {label:'Received sequence',value:Number(device.last_contiguous_sequence||0)},
        ]}/>
        {device.is_active?(confirmDeviceId===Number(device.id)?<>
          <InfoNote title="Confirm revocation" tone="warning">This terminal will need pairing again before recording attendance.</InfoNote>
          <ActionButtons>
            <Button mode="contained" buttonColor={palette.danger} loading={busyDeviceId===Number(device.id)} disabled={busyDeviceId!==null} onPress={()=>void revokeDevice(device)}>Confirm revoke</Button>
            <Button mode="outlined" disabled={busyDeviceId!==null} onPress={()=>setConfirmDeviceId(null)}>Cancel</Button>
          </ActionButtons>
        </>:<Button mode="outlined" textColor={palette.danger} disabled={busyDeviceId!==null} onPress={()=>setConfirmDeviceId(Number(device.id))}>Revoke kiosk</Button>):<InfoNote title="Revoked">{device.revoked_at?`Revoked ${dateLabel(device.revoked_at)}. `:''}Pair again to record new attendance.</InfoNote>}
      </View>):<EmptyState title="No registered kiosks" body="No attendance terminal is registered for this pharmacy."/>}
    </Section>:null}
    <Section title="Worker attendance PINs">{rows.length?rows.map((row:any)=><DataRow key={row.id} title={row.name} subtitle={row.has_pin?'Worker PIN is configured':'Worker PIN setup required'} status={row.has_pin?'Ready':'Action needed'} onPress={()=>router.push('/attendance-pin' as any)}/>):<EmptyState title="No PIN pharmacies" body="No pharmacies are currently available for worker PIN management."/>}</Section>
    <InfoNote title="Device lifecycle">A native kiosk needs its dashboard PIN and a server revocation before it disconnects. Unsynced attendance remains on the terminal.</InfoNote>
  </ParityPage>;
}
