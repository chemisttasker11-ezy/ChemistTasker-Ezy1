import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { Button, Chip, Icon, Text } from 'react-native-paper';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { attendance, canManageKioskDevices, correctionTimestamp, workforce } from '@chemisttasker/shared-core';
import type { AttendanceClockOptions, ShiftOffer, WorkerCoverTerms } from '@chemisttasker/shared-core';
import ShiftEngagementTermsDialog from '../../roles/shared/shifts/ShiftsBoard/components/ShiftEngagementTermsDialog';
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

export function AttendanceParityScreen({screen}:{screen:AttendanceScreen}) {
  const router=useRouter();
  const params=useLocalSearchParams<{id?:string;sessionId?:string;eventId?:string;timesheetId?:string}>();
  const {user,hasCapability}=useAuth();
  const workspace=useWorkspace();
  const pharmacyId=workspace.selectedPharmacyId;
  // The selected pharmacy must actually grant roster management. Account roles
  // and assignments at other sites cannot enable a manager endpoint here.
  const manager=Boolean(pharmacyId && hasCapability('MANAGE_ROSTER',pharmacyId));
  const accountKey=user ? String(user.id ?? user.email ?? '') : '';

  const detailScope = `${params.id || ''}:${params.sessionId || ''}:${params.eventId || ''}:${params.timesheetId || ''}`;
  const scopeKey = `${accountKey}:${pharmacyId ?? 'none'}:${manager?'manager':'worker'}:${screen}:${detailScope}`;

  return (
    <AttendanceParityContent
      key={scopeKey}
      screen={screen}
      accountKey={accountKey}
      pharmacyId={pharmacyId}
      manager={manager}
      user={user}
      params={params}
      router={router}
    />
  );
}

function AttendanceParityContent({
  screen,
  accountKey,
  pharmacyId,
  manager,
  user,
  params,
  router,
}:{
  screen: AttendanceScreen;
  accountKey: string;
  pharmacyId: number | null;
  manager: boolean;
  user: any;
  params: any;
  router: any;
}) {
  const accountRef=useRef(accountKey);
  accountRef.current=accountKey;
  const pharmacyRef=useRef(pharmacyId);
  pharmacyRef.current=pharmacyId;
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
  const timelineSequence=useRef(0);

  useEffect(() => {
    return () => {
      loadSequence.current += 1;
      timelineSequence.current += 1;
    };
  }, []);

  const selectedPending=useMemo(()=>pending.find((row:any)=>String(row.provisional_id||row.id)===String(params.id||''))||null,[pending,params.id]);

  const load=useCallback(async()=>{
    const sequence=++loadSequence.current;
    const currentAccount=accountKey;
    const currentPharmacy=pharmacyId;
    const isCurrent=()=>
      sequence===loadSequence.current &&
      accountRef.current===currentAccount &&
      pharmacyRef.current===currentPharmacy;

    setError('');
    try{
      if(screen==='home'||screen==='clock') {
        const nextStatus=await attendance.getWorkerStatus();
        if(!isCurrent()) return;
        setStatus(nextStatus);
      }
      if(screen==='reviews'||screen==='review-detail'||screen==='review-decision'||screen==='exception'){
        if(manager&&pharmacyId) {
          const nextPending=asArray(await attendance.getManagerPending(pharmacyId));
          if(!isCurrent()) return;
          setPending(nextPending);
        } else {
          if(!isCurrent()) return;
          setPending([]);
        }
      }
      if(screen==='kiosk-status') {
        const result=await attendance.getPinPharmacies();
        if(!isCurrent()) return;
        setPinPharmacies(asArray((result as any)?.pharmacies??result));
        if(canManageKiosk&&pharmacyId){
          const devices=await attendance.getManagerKioskDevices(pharmacyId);
          if(!isCurrent()) return;
          setKioskDevices(asArray((devices as any)?.devices??devices));
        }else{
          if(!isCurrent()) return;
          setKioskDevices([]);
        }
      }
      if(screen==='correction'&&!manager) {
        const nextHours=asArray(await workforce.getMyHours());
        if(!isCurrent()) return;
        setHours(nextHours);
      }
    }catch(e){
      if(isCurrent()) setError(errorMessage(e,'Unable to load attendance data.'));
    }finally{
      if(isCurrent()){setLoading(false);setRefreshing(false);}
    }
  },[screen,manager,canManageKiosk,pharmacyId,accountKey]);

  useEffect(()=>{void load();},[load]);

  useEffect(()=>{
    const seq=++timelineSequence.current;
    const currentAccount=accountKey;
    const currentPharmacy=pharmacyId;
    const sessionId=selectedPending?.session_id||toNumber(params.sessionId);
    setTimeline(null);
    if(manager && pharmacyId && (screen==='review-detail'||screen==='review-decision'||screen==='exception')&&sessionId){
      attendance.getManagerTimeline(Number(sessionId))
        .then((result)=>{
          if(seq===timelineSequence.current&&accountRef.current===currentAccount&&pharmacyRef.current===currentPharmacy){
            setTimeline(result);
          }
        })
        .catch((e)=>{
          if(seq===timelineSequence.current&&accountRef.current===currentAccount&&pharmacyRef.current===currentPharmacy){
            setError(errorMessage(e,'Unable to load attendance timeline.'));
          }
        });
    }
    return ()=>{
      timelineSequence.current+=1;
    };
  },[screen,selectedPending,params.sessionId,accountKey,pharmacyId,manager]);

  if(screen==='reviews'||screen==='review-detail'||screen==='review-decision'||screen==='exception'){
    if(!pharmacyId) {
      return <ParityPage title={titles[screen]} subtitle="Select a pharmacy before reviewing attendance"><PharmacyRequired onOpen={()=>router.push('/my-hours' as any)}/></ParityPage>;
    }
    if(!manager) {
      return <ParityPage title={titles[screen]} subtitle="Roster management is not authorised for this pharmacy">
        <InfoNote title="No attendance management access" tone="warning">Select a pharmacy where you have MANAGE_ROSTER authority. An assignment at another pharmacy does not grant access here.</InfoNote>
      </ParityPage>;
    }
  }

  if(screen==='clock') return <ClockScreen status={status} loading={loading} error={error} onReload={load}/>;
  if(screen==='correction') return <CorrectionScreen manager={manager} pharmacyId={pharmacyId} rows={hours} params={params} loading={loading} error={error} />;
  if(screen==='kiosk-status') return <KioskStatus rows={pinPharmacies} devices={kioskDevices} canManageKiosk={canManageKiosk} pharmacyId={pharmacyId} loading={loading} error={error} onReload={load} />;

  if(screen==='reviews'){
    return <ParityPage title={titles[screen]} subtitle="Review provisional and cross-site attendance before it becomes rostered history." loading={loading} error={error} onRetry={load} onRefresh={()=>{setRefreshing(true);void load();}} refreshing={refreshing}>
      <MetricGrid items={[{label:'Pending',value:pending.length,tone:pending.length?'warning':'success'}]}/>
      <Section title="Pending provisional shifts">
        {pending.some((row:any)=>coverInfo(row.cover_type).hint)?<InfoNote title="Unbooked locum cover" tone="warning">{UNBOOKED_HINT}</InfoNote>:null}
        {pending.length?pending.map((row:any)=><DataRow key={row.provisional_id} title={row.worker_name||row.worker_email||'Worker'} subtitle={`${coverInfo(row.cover_type).label} · ${dateLabel(row.started_at)}`} status={row.status||'PENDING'} onPress={()=>router.push(`/attendance/reviews/${row.provisional_id}` as any)}/>):<EmptyState title="Nothing to review" body="No provisional attendance is waiting for a manager decision."/>}
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
    <ProvisionalNote status={status}/>
    <CoverTerms key={accountKey}/>
    <Section title="Attendance tools">
      <ScreenLink title="Clock & breaks" subtitle="Clock in/out from a pharmacy QR token and manage breaks." onPress={()=>router.push('/attendance/clock' as any)}/>
      <ScreenLink title="Attendance correction" subtitle={manager?'Append an audited correction to a recorded event.':'Request a missing-punch correction through your timesheet.'} onPress={()=>router.push('/attendance/corrections/new' as any)}/>
      <ScreenLink title="Kiosk & PIN status" subtitle="Review pharmacies with worker PIN setup." onPress={()=>router.push('/attendance/kiosk-status' as any)}/>
      {manager?<ScreenLink title="Manager reviews" subtitle="Approve or reject provisional attendance." onPress={()=>router.push('/attendance/reviews' as any)}/>:null}
      <ScreenLink title="Published shifts" subtitle="View this week's shifts and acknowledge your roster." onPress={()=>router.push('/attendance/published-roster' as any)}/>
      <ScreenLink title="My hours" subtitle="Review timesheet periods and recorded hours." onPress={()=>router.push('/my-hours' as any)}/>
    </Section>
  </ParityPage>;
}

const UNBOOKED_HINT='No booking or membership here: a manager must approve this before any time is payable.';
function coverInfo(type:string){
  return type==='UNBOOKED_LOCUM_COVER'?{label:'Unbooked locum cover',hint:UNBOOKED_HINT}:{label:replaceUnderscore(type),hint:''};
}

// The cover-terms API is snake_case; the shared terms dialog reads the camelCase offer preview.
function camelize(value:any):any{
  if(Array.isArray(value)) return value.map(camelize);
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),camelize(item)]));
  return value;
}

// Approved emergency cover is closed, so it is listed apart from the live clock-in status.
function CoverTerms() {
  const router=useRouter();
  const {user}=useAuth();
  const accountKey=user ? String(user.id ?? user.email ?? '') : '';
  const accountRef=useRef(accountKey);
  accountRef.current=accountKey;
  const loadSequence=useRef(0);
  const [covers,setCovers]=useState<WorkerCoverTerms[]>([]);
  const [failed,setFailed]=useState(false);
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [accepting,setAccepting]=useState(false);
  const [acceptError,setAcceptError]=useState('');
  const acceptingRef=useRef(false);
  const paymentPath=user?.role==='PHARMACIST'?'/pharmacist/profile-payment':user?.role==='OTHER_STAFF'?'/otherstaff/profile-payment':null;
  const loadCovers=useCallback(async()=>{
    const seq=++loadSequence.current;
    const currentAccount=accountKey;
    try{
      const data=asArray(await attendance.getWorkerCoverTerms());
      if(seq===loadSequence.current&&accountRef.current===currentAccount){
        setCovers(data);
        setFailed(false);
      }
    }catch{
      if(seq===loadSequence.current&&accountRef.current===currentAccount){
        setFailed(true);
      }
    }
  },[accountKey]);

  useEffect(()=>{
    loadSequence.current+=1;
    setCovers([]);
    setFailed(false);
    void loadCovers();
    return ()=>{
      loadSequence.current+=1;
      acceptingRef.current=false;
    };
  },[loadCovers]);

  const selected=covers.find((cover)=>cover.assignment_id===selectedId);
  const offers=useMemo(()=>selected?([{engagementTermsPreview:camelize(selected.engagement_terms_preview)}] as unknown as ShiftOffer[]):null,[selected]);
  const shown=covers.filter((cover)=>{
    const terms=cover.engagement_terms_preview;
    return cover.status==='APPROVED'&&(cover.engagement_terms_accepted_at||terms.payment_profile_incomplete||terms.pricing_missing||(terms.acceptance_required&&terms.settlement_channel==='INVOICE'));
  });
  const openPaymentProfile=paymentPath?()=>router.push(paymentPath as any):undefined;
  const accept=async(payload:{engagementTermsAccepted?:boolean;independentContractorStatusConfirmed?:boolean})=>{
    if(selectedId==null||acceptingRef.current) return;
    acceptingRef.current=true;
    setAccepting(true);setAcceptError('');
    try{
      await attendance.acceptWorkerCoverTerms(selectedId,{...payload,termsVersion:selected?.engagement_terms_preview.terms_version});
      setSelectedId(null);
      await loadCovers();
    }catch(e:any){
      if(e?.status===409&&e?.payload?.code==='TERMS_CHANGED'){
        // Discard the rejected preview before fetching a new version and consents.
        setCovers((current)=>current.filter((cover)=>cover.assignment_id!==selectedId));
        setAcceptError('These terms have changed. Review the updated terms and confirm both agreements again.');
        await loadCovers();
      }else setAcceptError(errorMessage(e,'Could not accept the terms. Try again.'));
    }
    finally{acceptingRef.current=false;setAccepting(false);}
  };

  if(!failed&&!shown.length) return null;
  return <Section title="Approved cover" description="Accept the engagement terms for cover a manager approved so it can be invoiced.">
    {failed?<>
      <InfoNote title="Cover terms" tone="warning">Unable to load your approved cover terms.</InfoNote>
      <Button mode="outlined" onPress={()=>void loadCovers()}>Try again</Button>
    </>:null}
    {shown.map((cover)=>{
      const terms=cover.engagement_terms_preview;
      const first=terms.occurrences[0];
      const accepted=Boolean(cover.engagement_terms_accepted_at);
      const when=first?` · ${first.date} ${first.start_time.slice(0,5)}–${first.end_time.slice(0,5)}`:'';
      return <View key={cover.assignment_id} style={scannerStyles.coverRow}>
        <DataRow title={cover.pharmacy_name} subtitle={`${coverInfo(cover.cover_type).label}${when}${accepted?' · Terms accepted':''}`}/>
        {!accepted&&terms.payment_profile_incomplete?<>
          <InfoNote title="Payment details incomplete" tone="warning">{terms.notice||'Your payment details are incomplete.'}</InfoNote>
          {openPaymentProfile?<Button mode="outlined" onPress={openPaymentProfile}>Complete payment profile</Button>:null}
        </>:null}
        {!accepted&&terms.pricing_missing?<InfoNote title="Pay rate not set" tone="info">{terms.notice||'Ask the pharmacy to set its pay rates before you can accept these terms.'}</InfoNote>:null}
        {!accepted&&!terms.blocked?<ActionButtons><Button mode="contained" onPress={()=>{setAcceptError('');setSelectedId(cover.assignment_id);}}>Accept terms</Button></ActionButtons>:null}
      </View>;
    })}
    {offers?<ShiftEngagementTermsDialog visible offers={offers} loading={accepting} error={acceptError} onDismiss={()=>setSelectedId(null)} onConfirm={accept} onOpenPaymentProfile={openPaymentProfile}/>:null}
  </Section>;
}

function ProvisionalNote({status}:{status:any}) {
  if(!status?.is_provisional) return null;
  return <InfoNote title="Provisional attendance" tone="warning">{status.cover_type==='UNBOOKED_LOCUM_COVER'?'Unbooked cover: a manager at this pharmacy must approve this session before it is payable.':'This session needs manager review before it is treated as approved roster history.'}</InfoNote>;
}

function ClockScreen({status,loading,error,onReload}:{status:any;loading:boolean;error:string;onReload:()=>Promise<void>}) {
  const [qrToken,setQrToken]=useState('');
  const [busy,setBusy]=useState(false);
  const [localError,setLocalError]=useState('');
  const [scannerOpen,setScannerOpen]=useState(false);
  const [scanLocked,setScanLocked]=useState(false);
  const [permission,requestPermission]=useCameraPermissions();
  const active=Boolean(status?.has_active_session);
  const run=async(kind:'in'|'out'|'break-start'|'break-end',scannedToken?:string,confirmation?:AttendanceClockOptions)=>{
    const token=(scannedToken??qrToken).trim();
    setBusy(true);setLocalError('');
    try{
      if(kind==='in') await attendance.clockIn(token, confirmation);
      if(kind==='out') await attendance.clockOut(token, confirmation);
      if(kind==='break-start') await attendance.breakStart();
      if(kind==='break-end') await attendance.breakEnd();
      setQrToken('');
      setScannerOpen(false);
      await onReload();
    }catch(e: any){
      // shared-core ApiError carries the server body in `payload`.
      const errData = e?.payload;
      const is409 = e?.status === 409 && errData?.code === 'CONFIRM_OPPOSITE_ACTION';
      if (is409) {
        const message = errData?.message || (kind === 'out' ? 'You just clocked in. Clock out now?' : 'You just clocked out. Clock in now?');
        Alert.alert(
          'Confirm clock action',
          message,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Confirm',
              onPress: () => {
                void run(kind, token, { confirm_opposite: true, expected_action: errData.pending_action, observed_session_id: errData.observed_session_id });
              },
            },
          ]
        );
        return;
      }
      if (e?.status === 409 && errData?.code === 'STALE_CONFIRMATION') {
        setScannerOpen(false);
        setQrToken('');
        await onReload();
        setLocalError(errData.error || errData.message || 'Your attendance changed. Review the current status and try again.');
      } else setLocalError(errorMessage(e,'Attendance action failed.'));
    }
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

    <ProvisionalNote status={status}/>
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
  coverRow:{gap:8},
  scannerShell:{gap:12},
  cameraFrame:{height:360,borderRadius:16,overflow:'hidden',backgroundColor:'#07111F',position:'relative'},
  scanOverlay:{...StyleSheet.absoluteFill,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(7,17,31,0.24)'},
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
        <MetricGrid items={[{label:'Cover type',value:coverInfo(row.cover_type).label},{label:'Started',value:dateLabel(row.started_at)},{label:'Ended',value:row.ended_at?dateLabel(row.ended_at):'In progress',tone:row.ended_at?'success':'warning'}]}/>
        {coverInfo(row.cover_type).hint?<InfoNote title="Unbooked locum cover" tone="warning">{UNBOOKED_HINT}</InfoNote>:null}
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

function attendanceWallTime(instant:string,timeZone:string):string {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).formatToParts(new Date(instant)).filter((p)=>p.type!=='literal').map((p)=>[p.type,p.value]));
  return [parts.year,parts.month,parts.day].join('-')+'T'+[parts.hour,parts.minute].join(':');
}

function isValidAttendanceLocal(value:string):boolean {
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if(!match)return false;
  const [y,m,d,h,min]=match.slice(1).map(Number);
  const stamp=new Date(Date.UTC(y,m-1,d,h,min));
  return stamp.getUTCFullYear()===y&&stamp.getUTCMonth()===m-1&&
    stamp.getUTCDate()===d&&stamp.getUTCHours()===h&&stamp.getUTCMinutes()===min;
}

function CorrectionScreen({manager,pharmacyId,rows,params,loading,error}:{
  manager:boolean;pharmacyId:number|null;rows:any[];params:any;loading:boolean;error:string;
}) {
  const [eventId,setEventId]=useState(String(params.eventId||''));
  const [timesheetId,setTimesheetId]=useState(String(params.timesheetId||''));
  const [sessionId,setSessionId]=useState(String(params.sessionId||''));
  const [kind,setKind]=useState<'CLOCK_IN'|'CLOCK_OUT'>('CLOCK_IN');
  const [timestamp,setTimestamp]=useState('');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  const mounted=useRef(true);
  const [localError,setLocalError]=useState('');
  const [success,setSuccess]=useState('');
  const [context,setContext]=useState<{timeZone:string;event:any}|null>(null);
  const [contextLoading,setContextLoading]=useState(false);
  const [contextError,setContextError]=useState('');

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(!manager)return;
    let active=true;
    const requestedSession=toNumber(params.sessionId);
    const requestedEvent=toNumber(params.eventId);
    setContext(null);setContextError('');
    if(!pharmacyId||!Number.isSafeInteger(requestedSession)||requestedSession<=0||
       !Number.isSafeInteger(requestedEvent)||requestedEvent<=0){
      setContextError('Open an event from the attendance review timeline. A session and event are required.');
      return;
    }
    setContextLoading(true);
    void attendance.getManagerTimeline(requestedSession)
      .then((timeline:any)=>{
        if(!active)return;
        if(Number(timeline?.pharmacy_id)!==pharmacyId){
          throw new Error('This event belongs to a different pharmacy. Return to the selected pharmacy.');
        }
        const event=asArray<any>(timeline?.timeline)
          .find((entry:any)=>Number(entry.event_id)===requestedEvent);
        if(!event||!event.effective_timestamp||!timeline.pharmacy_timezone){
          throw new Error('The original event or pharmacy timezone is unavailable. Reload the attendance review.');
        }
        const timeZone=String(timeline.pharmacy_timezone);
        const local=attendanceWallTime(event.effective_timestamp,timeZone);
        setContext({timeZone,event});
        setEventId(String(event.event_id));
        setTimestamp(local);
      })
      .catch((e)=>{if(active)setContextError(errorMessage(e,'Unable to verify attendance event context.'));})
      .finally(()=>{if(active)setContextLoading(false);});
    return()=>{active=false;};
  },[manager,pharmacyId,params.eventId,params.sessionId]);

  const selectedTimesheet=rows.find((row:any)=>String(row.id)===timesheetId);
  const submit=async()=>{
    if(busyRef.current)return;
    if(!reason.trim()){setLocalError('Explain the requested attendance change.');return;}
    if(!isValidAttendanceLocal(timestamp)){
      setLocalError('Enter a valid pharmacy-local date and time (YYYY-MM-DDTHH:mm).');
      return;
    }
    busyRef.current=true;setBusy(true);setLocalError('');setSuccess('');
    try{
      if(manager){
        if(!context||Number(eventId)!==Number(context.event.event_id)){
          throw new Error('Open and verify an event from the attendance timeline before correcting it.');
        }
        const instant=correctionTimestamp(timestamp,context.event.effective_timestamp,context.timeZone);
        await attendance.correct(toNumber(eventId),instant,reason.trim());
        if(mounted.current)setSuccess('Correction appended to the attendance audit history.');
      }else{
        if(!selectedTimesheet)throw new Error('Select one of your own timesheets before requesting a correction.');
        const requested='Missing '+(kind==='CLOCK_IN'?'clock in':'clock out')+
          ' ('+kind+') on '+timestamp+' pharmacy local time'+
          (sessionId.trim()?', session '+sessionId.trim():'')+
          '. Reason: '+reason.trim()+'. This is a request, not a completed attendance event.';
        await workforce.addTimesheetComment(toNumber(timesheetId),requested,true);
        if(mounted.current)setSuccess('Request sent to the timesheet reviewer.');
      }
    }catch(e){if(mounted.current)setLocalError(errorMessage(e,'Unable to submit attendance correction.'));}
    finally{busyRef.current=false;if(mounted.current)setBusy(false);}
  };

  return <ParityPage title="Attendance correction" subtitle={manager
      ? 'Append a manager correction without deleting original scan evidence.'
      : 'Request a review of a missing punch on your own timesheet.'}
    loading={loading||contextLoading} error={error||contextError||localError}>
    {success?<InfoNote title={manager?'Saved':'Request sent'} tone="success">{success}</InfoNote>:null}
    {manager?<>
      <InfoNote title="Audited event context">Open an event from the selected pharmacy's session timeline. Freehand event IDs and device-local time are not accepted.</InfoNote>
      {context?<DataRow title={'Event '+eventId} subtitle={'Session '+String(params.sessionId)+' · '+context.timeZone}/>:null}
    </>:<>
      <InfoNote title="Worker correction request">Choose your timesheet and describe the missing clock entry. This records a comment for the manager; it does not change recorded attendance.</InfoNote>
      {rows.length?<Section title="Your timesheets">{rows.map((row:any)=>
        <DataRow key={row.id} title={row.pharmacy?.name||'Pharmacy'}
          subtitle={String(row.start_date||'')+' – '+String(row.end_date||'')+' · '+replaceUnderscore(row.status||'')}
          status={timesheetId===String(row.id)?'Selected':undefined}
          onPress={()=>setTimesheetId(String(row.id))}/>)}</Section>:null}
      <Field label="Timesheet ID" value={timesheetId} keyboardType="numeric" onChangeText={setTimesheetId}/>
      <Field label="Session ID (optional)" value={sessionId} keyboardType="numeric" onChangeText={setSessionId}/>
      <View style={{flexDirection:'row',gap:8}}>
        <Chip selected={kind==='CLOCK_IN'} onPress={()=>setKind('CLOCK_IN')}>Missing clock in</Chip>
        <Chip selected={kind==='CLOCK_OUT'} onPress={()=>setKind('CLOCK_OUT')}>Missing clock out</Chip>
      </View>
    </>}
    <Field label="Corrected date/time" value={timestamp} onChangeText={setTimestamp}/>
    <Field label="Reason" value={reason} multiline onChangeText={setReason}/>
    <Button mode="contained" loading={busy} disabled={busy||!reason.trim()||(manager&&!context)}
      onPress={()=>void submit()}>{manager?'Save correction':'Request correction'}</Button>
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
