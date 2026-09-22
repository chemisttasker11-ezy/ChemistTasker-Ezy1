import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Checkbox, Chip, IconButton, Switch, Text } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { chemistTaskerApi } from '@/config/api';
import { useWorkspace } from '@/context/WorkspaceContext';
import { ActionButtons, ChoiceChips, DataRow, EmptyState, Field, InfoNote, MetricGrid, ParityPage, PharmacyRequired, ScreenLink, Section, palette } from './ParityUI';
import { errorMessage, isoDate, money, replaceUnderscore, toNumber } from './utils';

type WorkforceScreen =
  | 'engagements'
  | 'engagement-detail'
  | 'engagement-new'
  | 'award-preview'
  | 'rates'
  | 'history'
  | 'payroll-configuration'
  | 'work-settings'
  | 'payroll-export';

const workforce = chemistTaskerApi.workforce;

const titleFor: Record<WorkforceScreen, string> = {
  engagements: 'Employment engagements',
  'engagement-detail': 'Engagement detail',
  'engagement-new': 'Create engagement',
  'award-preview': 'Award preview',
  rates: 'Agreed rates',
  history: 'Rate history',
  'payroll-configuration': 'Payroll configuration',
  'work-settings': 'Work settings',
  'payroll-export': 'Payroll-ready export',
};

const subtitleFor: Record<WorkforceScreen, string> = {
  engagements: 'Durable employment relationships, classifications and payment basis.',
  'engagement-detail': 'Review the dated employment terms and current status.',
  'engagement-new': 'Create a dated employment engagement without rewriting prior payroll history.',
  'award-preview': 'Preview current Award classification and rate guidance before saving.',
  rates: 'Review agreed weekday, weekend and penalty rates.',
  history: 'Review dated employment terms and successor relationships.',
  'payroll-configuration': 'Choose whether ChemistTasker payroll preparation is enabled for this pharmacy.',
  'work-settings': 'Maintain contracted hours and worker settings used by workforce calculations.',
  'payroll-export': 'Export approved timesheet rows for payroll processing.',
};

const ratePairs = (row: any) => [
  ['Weekday', row?.rate_weekday],
  ['Saturday', row?.rate_saturday],
  ['Sunday', row?.rate_sunday],
  ['Public holiday', row?.rate_public_holiday],
  ['Early morning', row?.rate_early_morning],
  ['Late night', row?.rate_late_night],
].filter(([, value]) => value != null && value !== '');

function usePharmacy() {
  const workspace = useWorkspace();
  const router = useRouter();
  return {
    pharmacyId: workspace.selectedPharmacyId,
    pharmacyName: workspace.selectedPharmacyName,
    missing: !workspace.selectedPharmacyId,
    missingView: <PharmacyRequired onOpen={() => router.push('/owner/dashboard' as any)} />,
  };
}

export function WorkforceParityScreen({ screen }: { screen: WorkforceScreen }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; membershipId?: string; supersedes?: string }>();
  const { pharmacyId, pharmacyName, missing, missingView } = usePharmacy();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [engagements, setEngagements] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any>(null);
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!pharmacyId) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      if (screen === 'payroll-configuration') {
        setPayroll(await workforce.getPayrollConfiguration(pharmacyId));
      } else if (screen === 'work-settings' || screen === 'engagement-new' || screen === 'award-preview') {
        const [workRows, engagementRows] = await Promise.all([
          workforce.listWorkSettings(pharmacyId),
          workforce.listEmploymentEngagements(pharmacyId),
        ]);
        setStaff(Array.isArray(workRows) ? workRows : []);
        setEngagements(Array.isArray(engagementRows) ? engagementRows : []);
      } else if (screen === 'payroll-export') {
        const result = await workforce.listTimesheetPeriods(pharmacyId);
        const rows = Array.isArray(result) ? result : Array.isArray((result as any)?.results) ? (result as any).results : [];
        setPeriods(rows);
        if (!selectedPeriodId && rows[0]?.id) setSelectedPeriodId(Number(rows[0].id));
      } else {
        const rows = await workforce.listEmploymentEngagements(pharmacyId);
        setEngagements(Array.isArray(rows) ? rows : []);
      }
    } catch (e) {
      setError(errorMessage(e, 'Unable to load workforce data.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [pharmacyId, screen, selectedPeriodId]);

  useEffect(() => { void load(); }, [load]);

  if (missing) {
    return <ParityPage title={titleFor[screen]} subtitle={subtitleFor[screen]}>{missingView}</ParityPage>;
  }

  if (screen === 'engagement-new') {
    return <EngagementEditor pharmacyId={pharmacyId!} pharmacyName={pharmacyName} staff={staff} engagements={engagements} loading={loading} error={error} onReload={load} />;
  }

  if (screen === 'award-preview') {
    return <AwardPreview staff={staff} loading={loading} error={error} />;
  }

  if (screen === 'payroll-configuration') {
    const enabled = Boolean(payroll?.use_chemisttasker_payroll);
    const update = async (next: boolean) => {
      if (!pharmacyId || busy) return;
      setBusy(true);
      setError('');
      try {
        setPayroll(await workforce.updatePayrollConfiguration({ pharmacy_id: pharmacyId, use_chemisttasker_payroll: next }));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    };
    return (
      <ParityPage title={titleFor[screen]} subtitle={subtitleFor[screen]} loading={loading} error={error} onRetry={load}>
        <Section title={pharmacyName || 'Selected pharmacy'}>
          <Card mode="outlined">
            <Card.Content style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium">ChemistTasker payroll preparation</Text>
                  <Text variant="bodySmall" style={{ color: palette.muted }}>
                    {enabled ? 'Enabled for workforce calculations and payroll-ready workflows.' : 'Disabled. Timesheet and attendance records remain available.'}
                  </Text>
                </View>
                <Switch value={enabled} onValueChange={(next) => void update(next)} disabled={busy} />
              </View>
              <InfoNote title="Configuration boundary">
                This setting controls ChemistTasker payroll preparation. It does not send funds or replace your payroll processor.
              </InfoNote>
            </Card.Content>
          </Card>
        </Section>
      </ParityPage>
    );
  }

  if (screen === 'work-settings') {
    return <WorkSettingsScreen staff={staff} loading={loading} error={error} onReload={load} />;
  }

  if (screen === 'payroll-export') {
    const exportRows = async () => {
      if (!selectedPeriodId || busy) return;
      setBusy(true);
      setError('');
      try {
        const rows = await workforce.listTimesheets(selectedPeriodId);
        const list = Array.isArray(rows) ? rows : Array.isArray((rows as any)?.results) ? (rows as any).results : [];
        const approved = list.filter((row: any) => ['APPROVED', 'LOCKED'].includes(String(row.status || '').toUpperCase()));
        const columns = ['timesheet_id','worker','status','regular_hours','overtime_hours','total_hours','gross_pay'];
        const line = (value: any) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
        const csv = [
          columns.join(','),
          ...approved.map((row: any) => [
            row.id,
            row.worker_name || row.worker?.name || row.user_name || '',
            row.status,
            row.regular_hours ?? row.ordinary_hours ?? '',
            row.overtime_hours ?? '',
            row.total_hours ?? row.hours ?? '',
            row.gross_pay ?? row.total_pay ?? '',
          ].map(line).join(',')),
        ].join('\n');
        const file = new File(Paths.cache, `chemisttasker-payroll-${selectedPeriodId}.csv`);
        file.create({ overwrite: true });
        file.write(csv);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export payroll-ready timesheets' });
        }
      } catch (e) {
        setError(errorMessage(e, 'Unable to create payroll export.'));
      } finally {
        setBusy(false);
      }
    };
    return (
      <ParityPage title={titleFor[screen]} subtitle={subtitleFor[screen]} loading={loading} error={error} onRetry={load}>
        <Section title="Timesheet period">
          {periods.length ? periods.map((period: any) => (
            <DataRow
              key={period.id}
              title={period.label || `${period.start_date || period.start || ''} – ${period.end_date || period.end || ''}`}
              subtitle={`${replaceUnderscore(period.status || 'OPEN')} · ${period.timesheet_count ?? period.count ?? 0} timesheets`}
              status={selectedPeriodId === Number(period.id) ? 'Selected' : undefined}
              onPress={() => setSelectedPeriodId(Number(period.id))}
            />
          )) : <EmptyState title="No timesheet periods" body="Open a timesheet period before exporting payroll-ready rows." />}
        </Section>
        <InfoNote title="Export rule">Only approved or locked timesheets are included in the CSV export.</InfoNote>
        <Button mode="contained" icon="download" loading={busy} disabled={!selectedPeriodId || busy} onPress={() => void exportRows()}>
          Export CSV
        </Button>
      </ParityPage>
    );
  }

  const target = params.id ? engagements.find((row: any) => String(row.public_id || row.id) === String(params.id)) : null;

  if (screen === 'engagement-detail' || screen === 'rates') {
    return (
      <ParityPage title={titleFor[screen]} subtitle={subtitleFor[screen]} loading={loading} error={error} onRetry={load}>
        {!target ? <EmptyState title="Engagement not found" body="The requested engagement is not available in the selected pharmacy." /> : (
          <>
            <Section title={target.worker_name || target.worker?.name || `Membership #${target.membership_id}`} description={`${replaceUnderscore(target.role)} · ${replaceUnderscore(target.employment_type)}`}>
              <MetricGrid items={[
                { label: 'Pay basis', value: replaceUnderscore(target.pay_basis || '—') },
                { label: 'Effective from', value: target.effective_from || '—' },
                { label: 'Effective to', value: target.effective_to || 'Current', tone: target.effective_to ? 'warning' : 'success' },
              ]} />
              <DataRow title="Classification" subtitle={target.award_classification || 'Not recorded'} status={target.terms_editable ? 'Editable future terms' : 'Historical'} />
              {ratePairs(target).map(([label, value]) => <DataRow key={label} title={label} right={<Text variant="titleSmall">{money(value)}/hr</Text>} />)}
              {target.notes ? <InfoNote title="Notes">{target.notes}</InfoNote> : null}
            </Section>
            <ActionButtons>
              <Button mode="contained" onPress={() => router.push(`/workforce/employment-engagements/new?membershipId=${target.membership_id}&supersedes=${target.public_id}` as any)}>New terms</Button>
              <Button mode="outlined" onPress={() => router.push(`/workforce/employment-engagements/${target.public_id}/history` as any)}>History</Button>
            </ActionButtons>
          </>
        )}
      </ParityPage>
    );
  }

  if (screen === 'history') {
    const membershipId = target?.membership_id;
    const rows = membershipId ? engagements.filter((row: any) => Number(row.membership_id) === Number(membershipId)) : engagements.filter((row: any) => String(row.public_id || row.id) === String(params.id));
    return (
      <ParityPage title={titleFor[screen]} subtitle={subtitleFor[screen]} loading={loading} error={error} onRetry={load}>
        <Section title="Dated terms">
          {rows.length ? rows.sort((a: any,b: any) => String(b.effective_from || '').localeCompare(String(a.effective_from || ''))).map((row: any) => (
            <DataRow
              key={row.public_id || row.id}
              title={row.award_classification || replaceUnderscore(row.role)}
              subtitle={`${row.effective_from || '—'} → ${row.effective_to || 'Current'} · Weekday ${money(row.rate_weekday)}/hr`}
              status={row.effective_to ? 'Historical' : 'Current'}
              onPress={() => router.push(`/workforce/employment-engagements/${row.public_id || row.id}` as any)}
            />
          )) : <EmptyState title="No history" body="No dated employment terms were found." />}
        </Section>
      </ParityPage>
    );
  }

  return (
    <ParityPage
      title={titleFor[screen]}
      subtitle={subtitleFor[screen]}
      loading={loading}
      error={error}
      onRetry={load}
      onRefresh={() => { setRefreshing(true); void load(); }}
      refreshing={refreshing}
      right={<IconButton icon="plus" onPress={() => router.push('/workforce/employment-engagements/new' as any)} />}
    >
      <Section title={pharmacyName || 'Employment relationships'} description="Current and historical terms remain separate for auditability.">
        {engagements.length ? engagements.map((row: any) => (
          <DataRow
            key={row.public_id || row.id}
            title={row.worker_name || row.worker?.name || `Membership #${row.membership_id}`}
            subtitle={`${replaceUnderscore(row.employment_type)} · ${row.award_classification || replaceUnderscore(row.role)} · ${row.effective_from || '—'} → ${row.effective_to || 'Current'}`}
            status={row.effective_to ? 'Historical' : 'Active'}
            onPress={() => router.push(`/workforce/employment-engagements/${row.public_id || row.id}` as any)}
          />
        )) : <EmptyState title="No employment engagements" body="Add dated employment terms for eligible employee memberships." actionLabel="New engagement" onAction={() => router.push('/workforce/employment-engagements/new' as any)} />}
      </Section>
      <Section title="Workforce tools">
        <ScreenLink title="Award preview" subtitle="Preview classifications and rates." onPress={() => router.push('/workforce/award-preview' as any)} />
        <ScreenLink title="Payroll configuration" subtitle="Control payroll preparation for this pharmacy." onPress={() => router.push('/workforce/payroll-configuration' as any)} />
        <ScreenLink title="Work settings" subtitle="Contracted hours and worker settings." onPress={() => router.push('/workforce/work-settings' as any)} />
        <ScreenLink title="Payroll-ready export" subtitle="Share approved timesheets as CSV." onPress={() => router.push('/workforce/payroll-export' as any)} />
      </Section>
    </ParityPage>
  );
}

function AwardPreview({ staff, loading, error }: { staff: any[]; loading: boolean; error: string }) {
  const [membershipId, setMembershipId] = useState<number | null>(null);
  const [classification, setClassification] = useState('');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const selected = staff.find((row) => Number(row.membership_id) === membershipId);
  useEffect(() => {
    if (!selected) return;
    setEmploymentType(selected.employment_type || 'FULL_TIME');
    setClassification(selected.default_award_classification || selected.award_classification_options?.[0]?.value || '');
  }, [selected]);
  const run = async () => {
    if (!membershipId) return;
    setBusy(true); setLocalError('');
    try {
      setPreview(await workforce.previewEmploymentEngagementAward({ membership_id: membershipId, employment_type: employmentType, award_classification: classification }));
    } catch (e) { setLocalError(errorMessage(e, 'Unable to preview Award rates.')); }
    finally { setBusy(false); }
  };
  return (
    <ParityPage title="Award preview" subtitle={subtitleFor['award-preview']} loading={loading} error={error || localError}>
      <Section title="Eligible staff">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {staff.filter((row) => row.employment_engagement_eligible !== false).map((row) => (
            <Chip key={row.membership_id} selected={membershipId === Number(row.membership_id)} onPress={() => setMembershipId(Number(row.membership_id))}>{row.worker_name || `#${row.membership_id}`}</Chip>
          ))}
        </View>
      </Section>
      {selected ? <>
        <ChoiceChips value={employmentType} onChange={setEmploymentType} options={[{value:'FULL_TIME',label:'Full time'},{value:'PART_TIME',label:'Part time'},{value:'CASUAL',label:'Casual'}]} />
        <Field label="Award classification" value={classification} onChangeText={setClassification} />
        <Button mode="contained" loading={busy} disabled={!classification || busy} onPress={() => void run()}>Preview Award</Button>
      </> : <EmptyState title="Choose a worker" body="Select an eligible employee membership to resolve its Award options." />}
      {preview ? <Section title="Preview">
        <InfoNote title={preview.award_source_label || 'Award source'}>{preview.award_effective_from ? `Effective ${preview.award_effective_from}` : 'Current Award guidance'}</InfoNote>
        {ratePairs(preview).map(([label,value]) => <DataRow key={label} title={label} right={<Text variant="titleSmall">{money(value)}/hr</Text>} />)}
      </Section> : null}
    </ParityPage>
  );
}

function EngagementEditor({
  pharmacyId,
  pharmacyName,
  staff,
  engagements,
  loading,
  error,
  onReload,
}: {
  pharmacyId: number;
  pharmacyName: string | null;
  staff: any[];
  engagements: any[];
  loading: boolean;
  error: string;
  onReload: () => Promise<void>;
}) {
  const router = useRouter();
  const params = useLocalSearchParams<{ membershipId?: string; supersedes?: string }>();
  const initialMembership = params.membershipId ? Number(params.membershipId) : null;
  const [membershipId, setMembershipId] = useState<number | null>(initialMembership);
  const worker = staff.find((row) => Number(row.membership_id) === membershipId);
  const superseded = params.supersedes ? engagements.find((row) => String(row.public_id) === String(params.supersedes)) : null;
  const [employmentType, setEmploymentType] = useState(String(superseded?.employment_type || worker?.employment_type || 'FULL_TIME'));
  const [effectiveFrom, setEffectiveFrom] = useState(isoDate());
  const [jobTitle, setJobTitle] = useState(String(superseded?.job_title || ''));
  const [payBasis, setPayBasis] = useState(String(superseded?.pay_basis || 'AWARD'));
  const [classification, setClassification] = useState(String(superseded?.award_classification || worker?.default_award_classification || ''));
  const [adultConfirmed, setAdultConfirmed] = useState(Boolean(superseded?.adult_rate_confirmed));
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [rates, setRates] = useState({
    rate_weekday: String(superseded?.rate_weekday || ''),
    rate_saturday: String(superseded?.rate_saturday || ''),
    rate_sunday: String(superseded?.rate_sunday || ''),
    rate_public_holiday: String(superseded?.rate_public_holiday || ''),
  });
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!worker) return;
    setEmploymentType(String(superseded?.employment_type || worker.employment_type || 'FULL_TIME'));
    setClassification(String(superseded?.award_classification || worker.default_award_classification || worker.award_classification_options?.[0]?.value || ''));
  }, [worker, superseded]);

  const previewAward = async () => {
    if (!membershipId || !classification) return;
    setBusy(true); setLocalError('');
    try {
      const next = await workforce.previewEmploymentEngagementAward({ membership_id: membershipId, employment_type: employmentType, award_classification: classification });
      setPreview(next);
      if (payBasis === 'AWARD') {
        setRates({
          rate_weekday: String(next.rate_weekday || ''),
          rate_saturday: String(next.rate_saturday || ''),
          rate_sunday: String(next.rate_sunday || ''),
          rate_public_holiday: String(next.rate_public_holiday || ''),
        });
      }
    } catch (e) { setLocalError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!membershipId || !classification || busy) return;
    setBusy(true); setLocalError('');
    try {
      const payload: any = {
        membership_id: membershipId,
        ...(params.supersedes ? { supersedes_public_id: params.supersedes } : {}),
        effective_from: effectiveFrom,
        employment_type: employmentType,
        job_title: jobTitle,
        pay_basis: payBasis,
        award_classification: classification,
        adult_rate_confirmed: adultConfirmed,
        notes,
      };
      if (payBasis === 'ABOVE_AWARD') Object.assign(payload, rates);
      await workforce.createEmploymentEngagement(payload);
      await onReload();
      router.replace('/workforce/employment-engagements' as any);
    } catch (e) { setLocalError(errorMessage(e, 'Unable to create employment engagement.')); }
    finally { setBusy(false); }
  };

  return (
    <ParityPage title="Create engagement" subtitle={subtitleFor['engagement-new']} loading={loading} error={error || localError}>
      <InfoNote title={pharmacyName || `Pharmacy #${pharmacyId}`}>
        Employment engagements are dated records. New terms can supersede an existing engagement without rewriting historical payroll evidence.
      </InfoNote>
      <Section title="Worker">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {staff.filter((row) => row.employment_engagement_eligible !== false).map((row) => (
            <Chip key={row.membership_id} selected={membershipId === Number(row.membership_id)} onPress={() => setMembershipId(Number(row.membership_id))}>{row.worker_name || `#${row.membership_id}`}</Chip>
          ))}
        </View>
      </Section>
      {worker ? <>
        <ChoiceChips value={employmentType} onChange={setEmploymentType} options={[{value:'FULL_TIME',label:'Full time'},{value:'PART_TIME',label:'Part time'},{value:'CASUAL',label:'Casual'}]} />
        <Field label="Effective from (YYYY-MM-DD)" value={effectiveFrom} onChangeText={setEffectiveFrom} />
        <Field label="Job title" value={jobTitle} onChangeText={setJobTitle} />
        <Field label="Award classification" value={classification} onChangeText={setClassification} />
        <ChoiceChips value={payBasis} onChange={setPayBasis} options={[{value:'AWARD',label:'Award'},{value:'ABOVE_AWARD',label:'Above Award'}]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Checkbox status={adultConfirmed ? 'checked' : 'unchecked'} onPress={() => setAdultConfirmed(!adultConfirmed)} />
          <Text style={{ flex: 1 }}>Adult rate confirmed where applicable</Text>
        </View>
        <Button mode="outlined" loading={busy} disabled={busy} onPress={() => void previewAward()}>Preview Award rates</Button>
        {preview ? <InfoNote title={preview.award_source_label || 'Award preview'}>{preview.award_effective_from ? `Effective ${preview.award_effective_from}` : 'Current rates loaded'}</InfoNote> : null}
        {payBasis === 'ABOVE_AWARD' ? <Section title="Agreed rates">
          <Field label="Weekday rate" value={rates.rate_weekday} keyboardType="decimal-pad" onChangeText={(value) => setRates((current) => ({...current, rate_weekday:value}))} />
          <Field label="Saturday rate" value={rates.rate_saturday} keyboardType="decimal-pad" onChangeText={(value) => setRates((current) => ({...current, rate_saturday:value}))} />
          <Field label="Sunday rate" value={rates.rate_sunday} keyboardType="decimal-pad" onChangeText={(value) => setRates((current) => ({...current, rate_sunday:value}))} />
          <Field label="Public holiday rate" value={rates.rate_public_holiday} keyboardType="decimal-pad" onChangeText={(value) => setRates((current) => ({...current, rate_public_holiday:value}))} />
        </Section> : null}
        <Field label="Notes" value={notes} multiline onChangeText={setNotes} />
        <Button mode="contained" loading={busy} disabled={!membershipId || !classification || busy} onPress={() => void save()}>Create engagement</Button>
      </> : <EmptyState title="Choose an eligible worker" body="Only employee memberships eligible for employment engagement setup are shown." />}
    </ParityPage>
  );
}

function WorkSettingsScreen({ staff, loading, error, onReload }: { staff: any[]; loading: boolean; error: string; onReload: () => Promise<void> }) {
  const [editing, setEditing] = useState<any>(null);
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const start = (row: any) => { setEditing(row); setMinutes(row.contracted_weekly_minutes == null ? '' : String(row.contracted_weekly_minutes)); };
  const save = async () => {
    if (!editing || busy) return;
    setBusy(true); setLocalError('');
    try {
      await workforce.saveWorkSettings({
        membership_id: editing.membership_id,
        contracted_weekly_minutes: minutes.trim() ? toNumber(minutes) : null,
        effective_from: isoDate(),
        work_pattern: editing.work_pattern || {},
      });
      setEditing(null);
      await onReload();
    } catch (e) { setLocalError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <ParityPage title="Work settings" subtitle={subtitleFor['work-settings']} loading={loading} error={error || localError}>
      <Section title="Workers">
        {staff.length ? staff.map((row) => <DataRow
          key={row.membership_id}
          title={row.worker_name || `Membership #${row.membership_id}`}
          subtitle={`${replaceUnderscore(row.role)} · ${replaceUnderscore(row.employment_type)} · ${row.contracted_weekly_minutes == null ? 'No contracted hours' : (Number(row.contracted_weekly_minutes) / 60).toFixed(1) + ' h/week'}`}
          onPress={() => start(row)}
        />) : <EmptyState title="No workforce settings" body="No pharmacy staff settings are available." />}
      </Section>
      {editing ? <Card mode="outlined"><Card.Content style={{ gap: 12 }}>
        <Text variant="titleMedium">{editing.worker_name || 'Worker settings'}</Text>
        <Field label="Contracted weekly minutes" value={minutes} keyboardType="numeric" onChangeText={setMinutes} />
        <ActionButtons><Button mode="contained" loading={busy} onPress={() => void save()}>Save</Button><Button onPress={() => setEditing(null)}>Cancel</Button></ActionButtons>
      </Card.Content></Card> : null}
    </ParityPage>
  );
}
