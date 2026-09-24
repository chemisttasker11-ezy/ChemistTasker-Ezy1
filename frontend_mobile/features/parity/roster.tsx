import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Checkbox, Chip, IconButton, Text } from 'react-native-paper';
import { DatePickerInput } from 'react-native-paper-dates';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchRosterOwnerMembersService, fetchWorkerShiftRequestsService, isRosterMemberEligibleForRole, rosterMemberLabel, rosterMemberUserId, rosterV2, workforce, type RosterPharmacyMember, type WorkerShiftRequest } from '@chemisttasker/shared-core';
import { useWorkspace } from '@/context/WorkspaceContext';
import { ActionButtons, ChoiceChips, DataRow, EmptyState, Field, InfoNote, MetricGrid, ParityPage, PharmacyRequired, ScreenLink, Section, palette } from './ParityUI';
import { asArray, dateFromIso, dateLabel, errorMessage, isoDate, replaceUnderscore, startOfWeek, toNumber } from './utils';

type RosterScreen =
  | 'workspace'
  | 'calendar'
  | 'staff'
  | 'coverage'
  | 'shift-editor'
  | 'validate'
  | 'publish'
  | 'acknowledgements'
  | 'copy-week'
  | 'templates'
  | 'approvals'
  | 'audit';

const roster = rosterV2;

const titles: Record<RosterScreen, string> = {
  workspace: 'Roster workspace',
  calendar: 'Roster calendar',
  staff: 'Roster by staff',
  coverage: 'Coverage requirements',
  'shift-editor': 'Add / edit roster shift',
  validate: 'Validate revision',
  publish: 'Publish revision',
  acknowledgements: 'Acknowledgements',
  'copy-week': 'Copy week',
  templates: 'Roster templates',
  approvals: 'Swap & cover approvals',
  audit: 'Roster audit',
};

function flattenAssignments(period: any) {
  const direct = asArray<any>(period?.assignments);
  if (direct.length) return direct;
  return asArray<any>(period?.staff_view).flatMap((row: any) => asArray<any>(row?.assignments || row?.shifts));
}

function slotSummary(row: any) {
  const date = row.slot_date || row.date || row.slot?.date || row.shift_date || '';
  const start = row.start_time || row.slot?.start_time || row.slot_detail?.start_time || row.slotDetail?.startTime || '';
  const end = row.end_time || row.slot?.end_time || row.slot_detail?.end_time || row.slotDetail?.endTime || '';
  return `${date || 'Date not set'} · ${start || '—'}–${end || '—'}`;
}

export function RosterParityScreen({ screen }: { screen: RosterScreen }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ pharmacyId?: string }>();
  const workspace = useWorkspace();
  const scopedPharmacyId = Number(params.pharmacyId || 0);
  const pharmacyId = Number.isFinite(scopedPharmacyId) && scopedPharmacyId > 0 ? scopedPharmacyId : workspace.selectedPharmacyId;
  const pharmacyName = pharmacyId === workspace.selectedPharmacyId ? workspace.selectedPharmacyName : null;
  const [weekStart, setWeekStart] = useState(startOfWeek());
  const [period, setPeriod] = useState<any>(null);
  const [coverage, setCoverage] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [requests, setRequests] = useState<WorkerShiftRequest[]>([]);
  const [membersByRole, setMembersByRole] = useState<Record<string, RosterPharmacyMember[]>>({});
  const [audits, setAudits] = useState<any[]>([]);
  const [acknowledgements, setAcknowledgements] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadPeriod = useCallback(async () => {
    if (!pharmacyId) return null;
    const result = await roster.getPeriod(pharmacyId, weekStart);
    setPeriod(result);
    return result;
  }, [pharmacyId, weekStart]);

  const load = useCallback(async () => {
    if (!pharmacyId) { setLoading(false); return; }
    setError('');
    try {
      const p = await loadPeriod();
      if (screen === 'coverage') setCoverage(asArray(await workforce.listCoverageRequirements(pharmacyId)));
      if (screen === 'templates') setTemplates(asArray(await roster.getTemplates(pharmacyId)));
      if (screen === 'approvals') {
        const rows = asArray<WorkerShiftRequest>(
          await fetchWorkerShiftRequestsService({ pharmacyId, status: 'PENDING' } as any),
        ).filter((row) => String(row.status || '').toUpperCase() === 'PENDING');
        setRequests(rows);

        const roles = [...new Set(rows.map((row) => String(row.role || '').toUpperCase()).filter(Boolean))];
        const entries = await Promise.all(
          roles.map(async (role) => [
            role,
            asArray<RosterPharmacyMember>(await fetchRosterOwnerMembersService(pharmacyId, role)),
          ] as const),
        );
        setMembersByRole(Object.fromEntries(entries));
      }
      if (screen === 'audit') {
        const result = await roster.getAudits(pharmacyId);
        setAudits(asArray((result as any)?.audits ?? result));
      }
      if (screen === 'acknowledgements' && p?.period_id) {
        setAcknowledgements(await roster.getAcknowledgements(Number(p.period_id)));
      }
    } catch (e) {
      setError(errorMessage(e, 'Unable to load roster data.'));
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [loadPeriod, pharmacyId, screen]);

  useEffect(() => { void load(); }, [load]);

  if (!pharmacyId) {
    return <ParityPage title={titles[screen]} subtitle="Manager roster parity"><PharmacyRequired onOpen={() => router.push('/owner/dashboard' as any)} /></ParityPage>;
  }

  const assignments = flattenAssignments(period);
  const vacant = asArray<any>(period?.vacant_slots);
  const periodId = Number(period?.period_id || period?.id || 0);

  const ensurePeriod = async () => {
    if (periodId) return period;
    const initialized = await roster.initializePeriod(pharmacyId, weekStart);
    setPeriod(initialized);
    return initialized;
  };

  if (screen === 'shift-editor') {
    return <ShiftEditor pharmacyId={pharmacyId} pharmacyName={pharmacyName} weekStart={weekStart} period={period} ensurePeriod={ensurePeriod} onSaved={load} />;
  }
  if (screen === 'coverage') {
    return <CoverageScreen pharmacyId={pharmacyId} rows={coverage} loading={loading} error={error} onReload={load} />;
  }
  if (screen === 'copy-week') {
    return <CopyWeek period={period} weekStart={weekStart} setWeekStart={setWeekStart} loading={loading} error={error} onReload={load} />;
  }
  if (screen === 'templates') {
    return <TemplatesScreen pharmacyId={pharmacyId} period={period} rows={templates} loading={loading} error={error} onReload={load} />;
  }
  if (screen === 'approvals') {
    return <ApprovalsScreen rows={requests} membersByRole={membersByRole} loading={loading} error={error} onReload={load} />;
  }
  if (screen === 'audit') {
    return (
      <ParityPage title={titles[screen]} subtitle="Immutable roster action history for the selected pharmacy." loading={loading} error={error} onRetry={load}>
        <Section title="Recent actions">
          {audits.length ? audits.map((row: any) => <DataRow
            key={row.id}
            title={replaceUnderscore(row.action_type || row.action || 'Roster action')}
            subtitle={`${row.performed_by || 'System'} · ${dateLabel(row.created_at)}`}
            status={row.target_user || undefined}
          />) : <EmptyState title="No audit activity" body="Roster changes and approvals will appear here." />}
        </Section>
      </ParityPage>
    );
  }
  if (screen === 'acknowledgements') {
    const rows = asArray<any>(acknowledgements?.workers || acknowledgements?.acknowledgements || acknowledgements?.results);
    return (
      <ParityPage title={titles[screen]} subtitle="Published-roster acknowledgement status." loading={loading} error={error} onRetry={load}>
        <MetricGrid items={[
          { label: 'Acknowledged', value: acknowledgements?.acknowledged_count ?? rows.filter((x:any)=>x.acknowledged_at || x.is_acknowledged).length, tone: 'success' },
          { label: 'Pending', value: acknowledgements?.pending_count ?? rows.filter((x:any)=>!(x.acknowledged_at || x.is_acknowledged)).length, tone: 'warning' },
        ]} />
        <Section title="Workers">
          {rows.length ? rows.map((row:any,index:number)=><DataRow key={row.user_id || row.id || index} title={row.worker_name || row.user_name || row.name || `Worker ${index+1}`} subtitle={row.acknowledged_at ? dateLabel(row.acknowledged_at) : 'Awaiting acknowledgement'} status={row.acknowledged_at || row.is_acknowledged ? 'Acknowledged' : 'Pending'} />) : <EmptyState title="No acknowledgement data" body={period?.status === 'PUBLISHED' ? 'No worker acknowledgement rows were returned.' : 'Publish the roster before collecting acknowledgements.'} />}
        </Section>
      </ParityPage>
    );
  }
  if (screen === 'validate') {
    const run = async () => {
      setBusy(true); setError('');
      try {
        const p = await ensurePeriod();
        setValidation(await roster.validate({ period_id: Number(p.period_id || p.id) }));
      } catch (e) { setError(errorMessage(e, 'Roster validation failed.')); }
      finally { setBusy(false); }
    };
    const errors = asArray<any>(validation?.errors);
    const warnings = asArray<any>(validation?.warnings);
    return (
      <ParityPage title={titles[screen]} subtitle="Pre-publish safety and coverage validation." loading={loading} error={error} onRetry={load}>
        <InfoNote title="Revision">{`${pharmacyName || 'Pharmacy'} · week of ${weekStart} · ${period?.status || 'DRAFT'}`}</InfoNote>
        <Button mode="contained" loading={busy} onPress={() => void run()}>Run validation</Button>
        {validation ? <>
          <MetricGrid items={[{label:'Errors',value:errors.length,tone:errors.length?'danger':'success'},{label:'Warnings',value:warnings.length,tone:warnings.length?'warning':'success'}]} />
          <Section title="Results">
            {errors.map((row:any,index:number)=><DataRow key={'e'+index} title={row.message || row.code || 'Validation error'} status="Error" />)}
            {warnings.map((row:any,index:number)=><DataRow key={'w'+index} title={row.message || row.code || 'Validation warning'} status="Warning" />)}
            {!errors.length && !warnings.length ? <InfoNote title="Ready to publish" tone="success">No blocking validation issues were returned.</InfoNote> : null}
          </Section>
        </> : null}
      </ParityPage>
    );
  }
  if (screen === 'publish') {
    const publish = async (forceWarnings = false) => {
      setBusy(true); setError('');
      try {
        const p = await ensurePeriod();
        await roster.publish({ period_id: Number(p.period_id || p.id), force_warnings: forceWarnings });
        await load();
      } catch (e) { setError(errorMessage(e, 'Unable to publish roster.')); }
      finally { setBusy(false); }
    };
    const unpublish = async () => {
      if (!periodId) return;
      setBusy(true); setError('');
      try { await roster.unpublish({ period_id: periodId }); await load(); }
      catch(e){ setError(errorMessage(e)); } finally { setBusy(false); }
    };
    return (
      <ParityPage title={titles[screen]} subtitle="Publish a validated roster revision atomically." loading={loading} error={error} onRetry={load}>
        <MetricGrid items={[{label:'Status',value:period?.status || 'DRAFT'},{label:'Assignments',value:period?.total_assignments ?? assignments.length},{label:'Vacancies',value:vacant.length,tone:vacant.length?'warning':'success'}]} />
        <InfoNote title="Safe publish">Publishing is server validated. Blocking errors cannot be bypassed; warning-only publication requires explicit confirmation.</InfoNote>
        <ActionButtons>
          {period?.status === 'PUBLISHED'
            ? <Button mode="outlined" loading={busy} onPress={() => void unpublish()}>Return to draft</Button>
            : <>
              <Button mode="contained" loading={busy} onPress={() => void publish(false)}>Publish</Button>
              <Button mode="outlined" disabled={busy} onPress={() => void publish(true)}>Publish with warnings acknowledged</Button>
            </>}
        </ActionButtons>
      </ParityPage>
    );
  }

  const grouped = screen === 'staff'
    ? Object.values(assignments.reduce((acc:any,row:any)=>{const key=String(row.user_id || row.user?.id || row.worker_id || 'vacant');(acc[key] ||= {label:row.worker_name || row.user_name || row.user?.name || 'Vacant',rows:[]}).rows.push(row);return acc;},{}))
    : [];

  return (
    <ParityPage title={titles[screen]} subtitle={screen === 'workspace' ? 'Plan, validate and publish weekly pharmacy coverage.' : screen === 'calendar' ? 'Week-at-a-glance shift coverage.' : 'Staff-centred roster allocation.'} loading={loading} error={error} onRetry={load} onRefresh={() => {setRefreshing(true);void load();}} refreshing={refreshing} right={<IconButton icon="plus" onPress={() => router.push('/manager/roster/shift-editor' as any)} />}>
      <View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
        <DatePickerInput
          locale="en-AU"
          label="Week starting"
          value={dateFromIso(weekStart)}
          onChange={(date) => date && setWeekStart(startOfWeek(date))}
          inputMode="start"
        />
      </View>
      <MetricGrid items={[
        { label:'Status',value:period?.status || 'DRAFT' },
        { label:'Assignments',value:period?.total_assignments ?? assignments.length },
        { label:'Vacancies',value:vacant.length,tone:vacant.length?'warning':'success' },
      ]} />
      {screen === 'staff' ? <Section title="Staff allocation">
        {(grouped as any[]).length ? (grouped as any[]).map((group:any,index:number)=><Card key={index} mode="outlined"><Card.Content style={{gap:8}}><Text variant="titleSmall">{group.label}</Text>{group.rows.map((row:any,i:number)=><Text key={i} variant="bodySmall" style={{color:palette.muted}}>{slotSummary(row)} · {replaceUnderscore(row.role || row.role_needed || '')}</Text>)}</Card.Content></Card>) : <EmptyState title="No assignments" body="Create roster shifts or assign workers to this week." />}
      </Section> : <Section title={screen === 'calendar' ? 'Week schedule' : 'Roster assignments'}>
        {assignments.length ? assignments.map((row:any,index:number)=><DataRow key={row.assignment_id || row.id || index} title={row.worker_name || row.user_name || row.user?.name || 'Assigned worker'} subtitle={`${slotSummary(row)} · ${replaceUnderscore(row.role || row.role_needed || row.shift?.role_needed || '')}`} status="Assigned" />) : <EmptyState title="No assignments" body="This roster week has no assigned shifts yet." />}
        {vacant.map((row:any,index:number)=><DataRow key={'vacant'+(row.id||index)} title={replaceUnderscore(row.role || row.role_needed || 'Open role')} subtitle={slotSummary(row)} status="Vacant" />)}
      </Section>}
      {screen === 'workspace' ? <Section title="Roster tools">
        <ScreenLink title="Calendar" subtitle="Week-by-week schedule." onPress={() => router.push('/manager/roster/calendar' as any)} />
        <ScreenLink title="By staff" subtitle="Review allocations by worker." onPress={() => router.push('/manager/roster/staff' as any)} />
        <ScreenLink title="Coverage requirements" subtitle="Minimum role coverage by weekday." onPress={() => router.push('/manager/roster/coverage' as any)} />
        <ScreenLink title="Validate revision" subtitle="Check blockers before publish." onPress={() => router.push('/manager/roster/validate' as any)} />
        <ScreenLink title="Publish revision" subtitle="Atomic server-side publish." onPress={() => router.push('/manager/roster/publish' as any)} />
        <ScreenLink title="Acknowledgements" subtitle="Track worker acknowledgement." onPress={() => router.push('/manager/roster/acknowledgements' as any)} />
        <ScreenLink title="Copy week" subtitle="Copy shifts and assignments safely." onPress={() => router.push('/manager/roster/copy-week' as any)} />
        <ScreenLink title="Templates" subtitle="Save and apply reusable rosters." onPress={() => router.push('/manager/roster/templates' as any)} />
        <ScreenLink title="Swap & cover approvals" subtitle="Review worker change requests." onPress={() => router.push('/manager/roster/approvals' as any)} />
        <ScreenLink title="Roster audit" subtitle="Review immutable manager actions." onPress={() => router.push('/manager/roster/audit' as any)} />
      </Section> : null}
    </ParityPage>
  );
}

function ShiftEditor({ pharmacyId, pharmacyName, weekStart, period, ensurePeriod, onSaved }: { pharmacyId:number; pharmacyName?:string|null; weekStart:string; period:any; ensurePeriod:()=>Promise<any>; onSaved:()=>Promise<void> }) {
  const router=useRouter();
  const [date,setDate]=useState(weekStart);
  const [start,setStart]=useState('09:00');
  const [end,setEnd]=useState('17:00');
  const [role,setRole]=useState('PHARMACIST');
  const [userId,setUserId]=useState<number|null>(null);
  const [eligibleMembers,setEligibleMembers]=useState<RosterPharmacyMember[]>([]);
  const [membersLoading,setMembersLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(() => {
    let active = true;
    setMembersLoading(true);
    fetchRosterOwnerMembersService(pharmacyId, role)
      .then((rows) => {
        if (active) setEligibleMembers(asArray<RosterPharmacyMember>(rows));
      })
      .catch((e) => {
        if (active) {
          setEligibleMembers([]);
          setError(errorMessage(e, 'Unable to load eligible pharmacy members.'));
        }
      })
      .finally(() => {
        if (active) setMembersLoading(false);
      });
    return () => { active = false; };
  }, [pharmacyId, role]);

  const save=async()=>{
    setBusy(true);setError('');
    try{
      const p=period?.period_id ? period : await ensurePeriod();
      await roster.bulkEdit(Number(p.period_id || p.id), [{action:'create_shift',date,start_time:start,end_time:end,role,...(userId?{user_id:userId}:{})}]);
      await onSaved();router.replace('/manager/roster' as any);
    }catch(e){setError(errorMessage(e,'Unable to create roster shift.'));}finally{setBusy(false);}
  };
  return <ParityPage title="Add roster shift" subtitle="Create a draft roster slot and optionally assign an eligible pharmacy team member." error={error}>
    <InfoNote title={pharmacyName || `Pharmacy #${pharmacyId}`}>Roster changes are transactional and server validated before publication.</InfoNote>
    <Section title="Shift details">
      <DatePickerInput
        locale="en-AU"
        label="Shift date"
        value={dateFromIso(date)}
        onChange={(next) => next && setDate(isoDate(next))}
        inputMode="start"
      />
      <View style={{flexDirection:'row',gap:10}}>
        <View style={{flex:1}}><Field label="Start (HH:MM)" value={start} onChangeText={setStart} /></View>
        <View style={{flex:1}}><Field label="End (HH:MM)" value={end} onChangeText={setEnd} /></View>
      </View>
      <ChoiceChips value={role} onChange={(value)=>{setRole(value);setUserId(null);}} options={[{value:'PHARMACIST',label:'Pharmacist'},{value:'INTERN',label:'Intern'},{value:'TECHNICIAN',label:'Technician'},{value:'ASSISTANT',label:'Assistant'},{value:'STUDENT',label:'Student'}]} />
    </Section>
    <Section title="Assignment" description="Leave unassigned to create a vacant roster slot, or choose an eligible worker.">
      <Chip selected={userId===null} onPress={()=>setUserId(null)}>Leave vacant</Chip>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        {eligibleMembers.map((member)=>{
          const id=Number(member.user || 0);
          return <Chip key={member.id || id} selected={userId===id} onPress={()=>setUserId(id)}>{rosterMemberLabel(member)}</Chip>;
        })}
      </View>
      {membersLoading?<Text variant="bodySmall" style={{color:palette.muted}}>Loading eligible members…</Text>:null}
      {!membersLoading&&!eligibleMembers.length?<Text variant="bodySmall" style={{color:palette.muted}}>No eligible active members were returned for this role.</Text>:null}
    </Section>
    <Button mode="contained" loading={busy} disabled={busy||!date||!start||!end} onPress={()=>void save()}>Create draft shift</Button>
  </ParityPage>;
}

function CoverageScreen({pharmacyId,rows,loading,error,onReload}:{pharmacyId:number;rows:any[];loading:boolean;error:string;onReload:()=>Promise<void>}) {
  const [weekday,setWeekday]=useState('0'),[start,setStart]=useState('09:00'),[end,setEnd]=useState('17:00'),[role,setRole]=useState('PHARMACIST'),[minimum,setMinimum]=useState('1'),[busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
  const create=async()=>{setBusy(true);setLocalError('');try{await workforce.createCoverageRequirement({pharmacy_id:pharmacyId,weekday:toNumber(weekday),start_time:start,end_time:end,role,minimum_staff:toNumber(minimum,1),active:true});await onReload();}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};
  const remove=async(id:number)=>{setBusy(true);try{await workforce.deleteCoverageRequirement(id);await onReload();}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};
  return <ParityPage title="Coverage requirements" subtitle="Minimum pharmacy role coverage used by roster validation." loading={loading} error={error||localError}>
    <Section title="Current rules">{rows.length?rows.map((row:any)=><DataRow key={row.id} title={replaceUnderscore(row.role)} subtitle={`Day ${Number(row.weekday)+1} · ${row.start_time}–${row.end_time} · minimum ${row.minimum_staff}`} right={<IconButton icon="delete-outline" disabled={busy} onPress={()=>void remove(Number(row.id))} />} />):<EmptyState title="No coverage rules" body="Add minimum staffing rules for the selected pharmacy." />}</Section>
    <Section title="Add requirement">
      <Field label="Weekday (0 Monday – 6 Sunday)" value={weekday} keyboardType="numeric" onChangeText={setWeekday} />
      <Field label="Start time" value={start} onChangeText={setStart} /><Field label="End time" value={end} onChangeText={setEnd} />
      <ChoiceChips value={role} onChange={setRole} options={[{value:'PHARMACIST',label:'Pharmacist'},{value:'INTERN',label:'Intern'},{value:'TECHNICIAN',label:'Technician'},{value:'ASSISTANT',label:'Assistant'}]} />
      <Field label="Minimum staff" value={minimum} keyboardType="numeric" onChangeText={setMinimum} />
      <Button mode="contained" loading={busy} onPress={()=>void create()}>Add rule</Button>
    </Section>
  </ParityPage>;
}

function CopyWeek({period,weekStart,setWeekStart,loading,error,onReload}:{period:any;weekStart:string;setWeekStart:(v:string)=>void;loading:boolean;error:string;onReload:()=>Promise<void>}) {
  const [target,setTarget]=useState(''),[include,setInclude]=useState(true),[overwrite,setOverwrite]=useState(false),[busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
  const copy=async()=>{const id=Number(period?.period_id||period?.id||0);if(!id)return;setBusy(true);setLocalError('');try{await roster.copyWeek({source_period_id:id,target_week_start:target,include_assignments:include,overwrite});setWeekStart(target);await onReload();}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};
  return <ParityPage title="Copy week" subtitle="Copy shifts into a new draft week with explicit overwrite controls." loading={loading} error={error||localError}>
    <InfoNote title="Source week">{weekStart} · {period?.status||'DRAFT'}</InfoNote>
    <DatePickerInput
      locale="en-AU"
      label="Target week start"
      value={dateFromIso(target)}
      onChange={(date) => date && setTarget(startOfWeek(date))}
      inputMode="start"
    />
    <View style={{flexDirection:'row',alignItems:'center'}}><Checkbox status={include?'checked':'unchecked'} onPress={()=>setInclude(!include)} /><Text>Include assignments</Text></View>
    <View style={{flexDirection:'row',alignItems:'center'}}><Checkbox status={overwrite?'checked':'unchecked'} onPress={()=>setOverwrite(!overwrite)} /><Text>Overwrite existing target draft</Text></View>
    <Button mode="contained" loading={busy} disabled={!target||busy||!period?.period_id} onPress={()=>void copy()}>Copy roster week</Button>
  </ParityPage>;
}

function TemplatesScreen({pharmacyId,period,rows,loading,error,onReload}:{pharmacyId:number;period:any;rows:any[];loading:boolean;error:string;onReload:()=>Promise<void>}) {
  const [name,setName]=useState(''),[target,setTarget]=useState(''),[busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
  const save=async()=>{if(!name.trim())return;setBusy(true);setLocalError('');try{await roster.createTemplate({name:name.trim(),pharmacy_id:pharmacyId,...(period?.period_id?{from_period_id:Number(period.period_id)}:{template_data:[]}),include_users:true});setName('');await onReload();}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};
  const apply=async(id:number)=>{if(!target)return;setBusy(true);setLocalError('');try{await roster.applyTemplate({template_id:id,target_week_start:target,include_assignments:true,overwrite:false});}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};
  return <ParityPage title="Roster templates" subtitle="Save reusable weekly patterns and apply them into draft periods." loading={loading} error={error||localError}>
    <Section title="Templates">{rows.length?rows.map((row:any)=><DataRow key={row.id} title={row.name} subtitle={`${row.total_slots||0} slots · updated ${dateLabel(row.updated_at||row.created_at)}`} right={<Button compact disabled={!target||busy} onPress={()=>void apply(Number(row.id))}>Apply</Button>} />):<EmptyState title="No templates" body="Save the current roster as a reusable template." />}</Section>
    <Section title="Save current week"><Field label="Template name" value={name} onChangeText={setName} /><Button mode="outlined" loading={busy} disabled={!name.trim()||busy||!period?.period_id} onPress={()=>void save()}>Save template</Button></Section>
    <Section title="Apply target">
      <DatePickerInput
        locale="en-AU"
        label="Target week start"
        value={dateFromIso(target)}
        onChange={(date) => date && setTarget(startOfWeek(date))}
        inputMode="start"
      />
    </Section>
  </ParityPage>;
}

function ApprovalsScreen({rows,membersByRole,loading,error,onReload}:{rows:WorkerShiftRequest[];membersByRole:Record<string,RosterPharmacyMember[]>;loading:boolean;error:string;onReload:()=>Promise<void>}) {
  const [busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
  const [replacementByRequest,setReplacementByRequest]=useState<Record<string,number>>({});

  const isSwapRequest=(row:WorkerShiftRequest)=>/^Direct swap request/i.test(String(row.note||''));
  const action=async(row:WorkerShiftRequest,kind:'approve'|'release'|'reject')=>{
    setBusy(true);setLocalError('');
    try{
      const id=Number(row.id);
      if(kind==='approve'){
        if(isSwapRequest(row)) await roster.approveSwap(id);
        else{
          const replacement=Number(replacementByRequest[String(id)]||0);
          if(!replacement) throw new Error('Select an eligible replacement worker before approving this cover request.');
          await roster.approveReplacement(id,replacement);
        }
      }else if(kind==='release') await roster.releaseWorker(id);
      else await roster.rejectRequest(id,'Rejected from mobile manager review');
      setReplacementByRequest(current=>{const next={...current};delete next[String(id)];return next;});
      await onReload();
    }catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}
  };
  return <ParityPage title="Swap & cover approvals" subtitle="Review pending worker roster-change requests without dropping the current assignment." loading={loading} error={error||localError}>
    <InfoNote title="Assignment safety">Requests preserve the current worker assignment until a manager approves a swap/replacement or explicitly releases the worker.</InfoNote>
    <Section title="Pending requests">{rows.length?rows.map((row)=>{
      const swap=isSwapRequest(row);const requestId=String(row.id);const requesterId=Number(row.requestedBy||0);const requiredRole=String(row.role||'').toUpperCase();
      const eligible=(membersByRole[requiredRole]||[]).filter((member)=>Number(member.user||0)!==requesterId);
      return <Card key={row.id} mode="outlined"><Card.Content style={{gap:10}}>
        <Text variant="titleSmall">{row.requesterName||'Worker request'}</Text>
        <Text variant="bodySmall" style={{color:palette.muted}}>{[row.pharmacyName,row.slotDate,row.startTime&&row.endTime?(row.startTime+'–'+row.endTime):'',replaceUnderscore(row.role||'')].filter(Boolean).join(' · ')}</Text>
        <Text variant="bodySmall">{row.note||'Roster change request'}</Text>
        {!swap?<View style={{gap:8}}><Text variant="labelMedium">Replacement worker</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{eligible.map(member=>{const userId=Number(member.user||0);return <Chip key={member.id||userId} selected={replacementByRequest[requestId]===userId} onPress={()=>setReplacementByRequest(current=>({...current,[requestId]:userId}))}>{rosterMemberLabel(member)}</Chip>;})}</View>{!eligible.length?<Text variant="bodySmall" style={{color:palette.muted}}>No eligible pharmacy members were returned for this roster.</Text>:null}</View>:<InfoNote title="Direct swap">The requested swap target is resolved from the server-side roster audit and revalidated at approval time.</InfoNote>}
        <ActionButtons><Button compact mode="contained" disabled={busy||(!swap&&!replacementByRequest[requestId])} onPress={()=>void action(row,'approve')}>Approve</Button><Button compact mode="outlined" disabled={busy} onPress={()=>void action(row,'release')}>Release worker</Button><Button compact textColor={palette.danger} disabled={busy} onPress={()=>void action(row,'reject')}>Reject</Button></ActionButtons>
      </Card.Content></Card>;
    }):<EmptyState title="No pending requests" body="Swap and cover requests will appear here when workers submit them." />}</Section>
  </ParityPage>;
}
