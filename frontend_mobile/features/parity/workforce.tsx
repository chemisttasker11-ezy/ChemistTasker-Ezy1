import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Checkbox, Chip, IconButton, Switch, Text } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { workforce } from '@chemisttasker/shared-core';
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

const engagementStatus = (row: any) => {
  const today = isoDate();
  const start = String(row?.effective_from || '');
  const end = String(row?.effective_to || '');
  if (start && start > today) return 'Future';
  if (end && end < today) return 'Historical';
  return 'Current';
};

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
  const params = useLocalSearchParams<{ id?: string; membershipId?: string; supersedes?: string; edit?: string }>();
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
              <DataRow title="Classification" subtitle={target.award_classification || 'Not recorded'} status={target.terms_editable ? 'Editable future terms' : engagementStatus(target)} />
              {ratePairs(target).map(([label, value]) => <DataRow key={label} title={label} right={<Text variant="titleSmall">{money(value)}/hr</Text>} />)}
              {target.notes ? <InfoNote title="Notes">{target.notes}</InfoNote> : null}
            </Section>
            {target.ordinary_hours_pattern?.days?.length ? (
              <Section title="Part-time agreed ordinary hours" description="Frozen with these dated terms.">
                {target.ordinary_hours_pattern.days.map((day: any) => (
                  <DataRow
                    key={day.weekday}
                    title={day.weekday_label || `Day ${day.weekday}`}
                    subtitle={`${day.start_time}–${day.end_time} · ${day.meal_break_minutes || 0} min meal break${day.meal_break_start ? ` from ${day.meal_break_start}` : ''}`}
                  />
                ))}
              </Section>
            ) : null}
            <ActionButtons>
              <Button mode="contained" onPress={() => router.push(`/workforce/employment-engagements/new?membershipId=${target.membership_id}&supersedes=${target.public_id}` as any)}>New terms</Button>
              <Button mode="outlined" onPress={() => router.push(`/workforce/employment-engagements/new?membershipId=${target.membership_id}&edit=${target.public_id}` as any)}>
                {target.terms_editable ? 'Edit future' : 'End / notes'}
              </Button>
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
            status={engagementStatus(row)}
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
  const [effectiveFrom, setEffectiveFrom] = useState(isoDate());
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const selected = staff.find((row) => Number(row.membership_id) === membershipId);
  const classificationOptions = selected?.award_classification_options || [];

  useEffect(() => {
    if (!selected) return;
    setEmploymentType(selected.employment_type || 'FULL_TIME');
    setClassification(selected.default_award_classification || selected.award_classification_options?.[0]?.value || '');
    setPreview(null);
  }, [selected]);

  const run = async () => {
    if (!membershipId || !classification || !effectiveFrom) return;
    setBusy(true);
    setLocalError('');
    try {
      setPreview(await workforce.previewEmploymentEngagementAward({
        membership_id: membershipId,
        employment_type: employmentType,
        award_classification: classification,
        effective_from: effectiveFrom,
      }));
    } catch (e) {
      setLocalError(errorMessage(e, 'Unable to preview Award rates.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ParityPage title="Award preview" subtitle={subtitleFor['award-preview']} loading={loading} error={error || localError}>
      <Section title="Eligible staff">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {staff.filter((row) => row.employment_engagement_eligible !== false).map((row) => (
            <Chip key={row.membership_id} selected={membershipId === Number(row.membership_id)} onPress={() => setMembershipId(Number(row.membership_id))}>
              {row.worker_name || `#${row.membership_id}`}
            </Chip>
          ))}
        </View>
      </Section>
      {selected ? (
        <>
          <ChoiceChips
            value={employmentType}
            onChange={(value) => { setEmploymentType(value); setPreview(null); }}
            options={[{ value: 'FULL_TIME', label: 'Full time' }, { value: 'PART_TIME', label: 'Part time' }, { value: 'CASUAL', label: 'Casual' }]}
          />
          <Field label="Effective from (YYYY-MM-DD)" value={effectiveFrom} onChangeText={(value) => { setEffectiveFrom(value); setPreview(null); }} />
          {classificationOptions.length ? (
            <Section title="Award classification" description="Choose from the backend-provided classifications for this worker.">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {classificationOptions.map((option: any) => (
                  <Chip key={option.value} selected={classification === option.value} onPress={() => { setClassification(option.value); setPreview(null); }}>
                    {option.label}
                  </Chip>
                ))}
              </View>
            </Section>
          ) : <Field label="Award classification" value={classification} onChangeText={(value) => { setClassification(value); setPreview(null); }} />}
          <Button mode="contained" loading={busy} disabled={!classification || !effectiveFrom || busy} onPress={() => void run()}>
            Preview Award
          </Button>
        </>
      ) : <EmptyState title="Choose a worker" body="Select an eligible employee membership to resolve its Award options." />}
      {preview ? (
        <Section title="Preview">
          <InfoNote title={preview.classification_label || preview.award_source_label || 'Award source'}>
            {preview.award_effective_basis || (preview.award_effective_from ? `Effective ${preview.award_effective_from}` : 'Award guidance for the selected date')}
          </InfoNote>
          {preview.rate_scope === 'junior' ? (
            <InfoNote title="Junior rate">
              {preview.age_at_effective_date != null ? `Age ${preview.age_at_effective_date}` : 'DOB-based rate'}
              {preview.junior_percentage ? ` · ${preview.junior_percentage}%` : ''}
              {preview.next_rate_review_date ? ` · review again from ${preview.next_rate_review_date}` : ''}
            </InfoNote>
          ) : null}
          {ratePairs(preview).map(([label, value]) => <DataRow key={label} title={label} right={<Text variant="titleSmall">{money(value)}/hr</Text>} />)}
          {preview.ordinary_hours_note ? <InfoNote title="Ordinary hours">{preview.ordinary_hours_note}</InfoNote> : null}
        </Section>
      ) : null}
    </ParityPage>
  );
}

type PartTimeDay = {
  weekday: number;
  label: string;
  enabled: boolean;
  start_time: string;
  end_time: string;
  meal_break_start: string;
  meal_break_minutes: number;
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function buildPartTimeDays(pattern?: any): PartTimeDay[] {
  const saved = Array.isArray(pattern?.days) ? pattern.days : [];
  return WEEKDAYS.map((label, weekday) => {
    const row = saved.find((day: any) => Number(day.weekday) === weekday);
    return {
      weekday,
      label,
      enabled: Boolean(row),
      start_time: String(row?.start_time || '09:00'),
      end_time: String(row?.end_time || '17:00'),
      meal_break_start: String(row?.meal_break_start || ''),
      meal_break_minutes: Number(row?.meal_break_minutes || 0),
    };
  });
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
  const params = useLocalSearchParams<{ membershipId?: string; supersedes?: string; edit?: string }>();
  const editing = params.edit ? engagements.find((row) => String(row.public_id || row.id) === String(params.edit)) : null;
  const superseded = params.supersedes ? engagements.find((row) => String(row.public_id || row.id) === String(params.supersedes)) : null;
  const source = editing || superseded;
  const historical = Boolean(editing && editing.terms_editable === false);
  const completedHistorical = Boolean(historical && editing?.effective_to && String(editing.effective_to) < isoDate());
  const today = isoDate();
  const successorEffectiveFrom = superseded && String(superseded.effective_from || '') === today
    ? isoDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
    : today;
  const initialMembership = params.membershipId ? Number(params.membershipId) : source?.membership_id ? Number(source.membership_id) : null;
  const [membershipId, setMembershipId] = useState<number | null>(initialMembership);
  const worker = staff.find((row) => Number(row.membership_id) === membershipId);
  const [employmentType, setEmploymentType] = useState(String(source?.employment_type || worker?.employment_type || 'FULL_TIME'));
  const [effectiveFrom, setEffectiveFrom] = useState(String(editing?.effective_from || successorEffectiveFrom));
  const [effectiveTo, setEffectiveTo] = useState(String(editing?.effective_to || ''));
  const [jobTitle, setJobTitle] = useState(String(source?.job_title || ''));
  const [payBasis, setPayBasis] = useState(String(source?.pay_basis || 'AWARD'));
  const [classification, setClassification] = useState(String(source?.award_classification || worker?.default_award_classification || ''));
  const [adultConfirmed, setAdultConfirmed] = useState(Boolean(source?.adult_rate_confirmed));
  const [notes, setNotes] = useState(String(editing?.notes || ''));
  const [preview, setPreview] = useState<any>(null);
  const [partTimeDays, setPartTimeDays] = useState<PartTimeDay[]>(buildPartTimeDays(source?.ordinary_hours_pattern));
  const [rates, setRates] = useState({
    rate_weekday: String(source?.rate_weekday || ''),
    rate_saturday: String(source?.rate_saturday || ''),
    rate_sunday: String(source?.rate_sunday || ''),
    rate_public_holiday: String(source?.rate_public_holiday || ''),
    rate_early_morning: String(source?.rate_early_morning || ''),
    rate_late_night: String(source?.rate_late_night || ''),
    early_morning_applicable: Boolean(source?.early_morning_applicable),
    late_night_applicable: Boolean(source?.late_night_applicable),
  });
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const classificationOptions = worker?.award_classification_options || [];

  useEffect(() => {
    if (!worker || editing || superseded) return;
    setEmploymentType(String(worker.employment_type || 'FULL_TIME'));
    setClassification(String(worker.default_award_classification || worker.award_classification_options?.[0]?.value || ''));
  }, [worker, editing, superseded]);

  const updatePartTimeDay = (weekday: number, patch: Partial<PartTimeDay>) => {
    setPartTimeDays((rows) => rows.map((day) => day.weekday === weekday ? { ...day, ...patch } : day));
  };

  const previewAward = async () => {
    if (!membershipId || !classification || !effectiveFrom) return;
    setBusy(true);
    setLocalError('');
    try {
      const next = await workforce.previewEmploymentEngagementAward({
        membership_id: membershipId,
        employment_type: employmentType,
        award_classification: classification,
        effective_from: effectiveFrom,
      });
      setPreview(next);
      if (payBasis === 'AWARD') {
        setRates((current) => ({
          ...current,
          rate_weekday: String(next.rate_weekday || ''),
          rate_saturday: String(next.rate_saturday || ''),
          rate_sunday: String(next.rate_sunday || ''),
          rate_public_holiday: String(next.rate_public_holiday || ''),
          rate_early_morning: String(next.rate_early_morning || ''),
          rate_late_night: String(next.rate_late_night || ''),
          early_morning_applicable: Boolean(next.early_morning_applicable),
          late_night_applicable: Boolean(next.late_night_applicable),
        }));
      }
    } catch (e) {
      setLocalError(errorMessage(e, 'Unable to preview Award rates.'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!membershipId || busy) return;
    if (!historical && (!classification || !effectiveFrom)) return;
    setBusy(true);
    setLocalError('');
    try {
      if (historical && editing) {
        await workforce.updateEmploymentEngagement(
          editing.public_id,
          completedHistorical
            ? { notes }
            : { effective_to: effectiveTo || null, notes },
        );
      } else {
        const payload: any = {
          membership_id: membershipId,
          ...(params.supersedes ? { supersedes_public_id: params.supersedes } : {}),
          effective_from: effectiveFrom,
          effective_to: effectiveTo || null,
          employment_type: employmentType,
          job_title: jobTitle,
          pay_basis: payBasis,
          award_classification: classification,
          adult_rate_confirmed: adultConfirmed,
          notes,
        };
        if (employmentType === 'PART_TIME') {
          payload.ordinary_hours_pattern = {
            days: partTimeDays.filter((day) => day.enabled).map((day) => ({
              weekday: day.weekday,
              start_time: day.start_time,
              end_time: day.end_time,
              meal_break_start: day.meal_break_minutes ? day.meal_break_start || null : null,
              meal_break_minutes: day.meal_break_minutes,
            })),
          };
        }
        if (payBasis === 'ABOVE_AWARD') {
          Object.assign(payload, {
            rate_weekday: rates.rate_weekday,
            rate_saturday: rates.rate_saturday,
            rate_sunday: rates.rate_sunday,
            rate_public_holiday: rates.rate_public_holiday,
            rate_early_morning: rates.early_morning_applicable ? rates.rate_early_morning : null,
            rate_late_night: rates.late_night_applicable ? rates.rate_late_night : null,
            early_morning_applicable: rates.early_morning_applicable,
            late_night_applicable: rates.late_night_applicable,
          });
        }
        if (editing) await workforce.updateEmploymentEngagement(editing.public_id, payload);
        else await workforce.createEmploymentEngagement(payload);
      }
      await onReload();
      router.replace('/workforce/employment-engagements' as any);
    } catch (e) {
      setLocalError(errorMessage(e, historical ? 'Unable to update this engagement.' : 'Unable to save employment engagement.'));
    } finally {
      setBusy(false);
    }
  };

  const enabledPartTimeDays = partTimeDays.filter((day) => day.enabled);
  const partTimePatternComplete = employmentType !== 'PART_TIME' || (
    enabledPartTimeDays.length > 0
    && enabledPartTimeDays.every(
      (day) => Boolean(day.start_time && day.end_time && (!day.meal_break_minutes || day.meal_break_start)),
    )
  );
  const aboveAwardComplete = payBasis !== 'ABOVE_AWARD' || Boolean(
    rates.rate_weekday
    && rates.rate_saturday
    && rates.rate_sunday
    && rates.rate_public_holiday
    && (!rates.early_morning_applicable || rates.rate_early_morning)
    && (!rates.late_night_applicable || rates.rate_late_night)
  );
  const canSave = historical || Boolean(
    membershipId
    && classification
    && effectiveFrom
    && partTimePatternComplete
    && aboveAwardComplete
  );

  const title = completedHistorical ? 'Update historical notes' : historical ? 'End engagement / notes' : editing ? 'Edit future engagement' : params.supersedes ? 'Create successor terms' : 'Create engagement';

  return (
    <ParityPage title={title} subtitle={subtitleFor['engagement-new']} loading={loading} error={error || localError}>
      <InfoNote title={pharmacyName || `Pharmacy #${pharmacyId}`}>
        {completedHistorical
          ? 'Completed employment terms are locked for payroll history. The end date is immutable; only notes can be amended.'
          : historical
          ? 'Started employment terms are locked for payroll history. Only the end date and notes can be amended.'
          : params.supersedes
            ? 'Saving successor terms atomically ends the current engagement on the day before the new effective date.'
            : 'Employment engagements are dated records. Historical payroll evidence is never rewritten.'}
      </InfoNote>

      <Section title="Worker">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {staff.filter((row) => row.employment_engagement_eligible !== false).map((row) => (
            <Chip
              key={row.membership_id}
              selected={membershipId === Number(row.membership_id)}
              disabled={Boolean(editing || params.supersedes)}
              onPress={() => { setMembershipId(Number(row.membership_id)); setPreview(null); }}
            >
              {row.worker_name || `#${row.membership_id}`}
            </Chip>
          ))}
        </View>
      </Section>

      {worker ? (
        <>
          <Field label="Effective from (YYYY-MM-DD)" value={effectiveFrom} disabled={historical} onChangeText={(value) => { setEffectiveFrom(value); setPreview(null); }} />
          <Field label="Effective to (optional, YYYY-MM-DD)" value={effectiveTo} disabled={completedHistorical} onChangeText={setEffectiveTo} />

          {!historical ? (
            <>
              <ChoiceChips
                value={employmentType}
                onChange={(value) => { setEmploymentType(value); setPreview(null); }}
                options={[{ value: 'FULL_TIME', label: 'Full time' }, { value: 'PART_TIME', label: 'Part time' }, { value: 'CASUAL', label: 'Casual' }]}
              />
              <Field label="Job title" value={jobTitle} onChangeText={setJobTitle} />

              {employmentType === 'PART_TIME' ? (
                <Section title="Part-time agreed ordinary hours" description="Record the written day/start/finish/meal-break pattern. The backend validates Award limits and minimum shift rules.">
                  {partTimeDays.map((day) => (
                    <Card key={day.weekday} mode="outlined">
                      <Card.Content style={{ gap: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Checkbox status={day.enabled ? 'checked' : 'unchecked'} onPress={() => updatePartTimeDay(day.weekday, { enabled: !day.enabled })} />
                          <Text variant="titleSmall" style={{ flex: 1 }}>{day.label}</Text>
                        </View>
                        {day.enabled ? (
                          <>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                              <View style={{ flex: 1 }}><Field label="Start (HH:MM)" value={day.start_time} onChangeText={(value) => updatePartTimeDay(day.weekday, { start_time: value })} /></View>
                              <View style={{ flex: 1 }}><Field label="Finish (HH:MM)" value={day.end_time} onChangeText={(value) => updatePartTimeDay(day.weekday, { end_time: value })} /></View>
                            </View>
                            <ChoiceChips
                              value={String(day.meal_break_minutes)}
                              onChange={(value) => updatePartTimeDay(day.weekday, { meal_break_minutes: Number(value), meal_break_start: Number(value) ? day.meal_break_start : '' })}
                              options={[{ value: '0', label: 'No meal break' }, { value: '30', label: '30 min' }, { value: '45', label: '45 min' }, { value: '60', label: '60 min' }]}
                            />
                            {day.meal_break_minutes ? <Field label="Meal break starts (HH:MM)" value={day.meal_break_start} onChangeText={(value) => updatePartTimeDay(day.weekday, { meal_break_start: value })} /> : null}
                          </>
                        ) : null}
                      </Card.Content>
                    </Card>
                  ))}
                  <InfoNote title="Written variation">Later changes should be saved as new dated terms rather than overwriting this frozen part-time agreement.</InfoNote>
                </Section>
              ) : null}

              {classificationOptions.length ? (
                <Section title="Award classification" description="Select the classification from duties, competencies and qualifications; do not infer it from the role name.">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {classificationOptions.map((option: any) => (
                      <Chip key={option.value} selected={classification === option.value} onPress={() => { setClassification(option.value); setPreview(null); }}>
                        {option.label}
                      </Chip>
                    ))}
                  </View>
                </Section>
              ) : <Field label="Award classification" value={classification} onChangeText={(value) => { setClassification(value); setPreview(null); }} />}

              <ChoiceChips
                value={payBasis}
                onChange={(value) => {
                  setPayBasis(value);
                  setPreview(null);
                  if (value === 'ABOVE_AWARD') {
                    setRates((current) => ({ ...current, rate_weekday: '', rate_saturday: '', rate_sunday: '', rate_public_holiday: '', rate_early_morning: '', rate_late_night: '', early_morning_applicable: false, late_night_applicable: false }));
                  }
                }}
                options={[{ value: 'AWARD', label: 'Award' }, { value: 'ABOVE_AWARD', label: 'Above Award' }]}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Checkbox status={adultConfirmed ? 'checked' : 'unchecked'} onPress={() => setAdultConfirmed(!adultConfirmed)} />
                <Text style={{ flex: 1 }}>Adult rate confirmed where applicable</Text>
              </View>

              <Button mode="outlined" loading={busy} disabled={!classification || !effectiveFrom || busy} onPress={() => void previewAward()}>
                Preview Award for effective date
              </Button>

              {preview ? (
                <Section title={payBasis === 'AWARD' ? 'Award hourly rate summary' : 'Award minimum underpinning'}>
                  <InfoNote title={preview.classification_label || preview.award_source_label || 'Award preview'}>
                    {preview.award_effective_basis || (preview.award_effective_from ? `Effective ${preview.award_effective_from}` : 'Award guidance loaded')}
                  </InfoNote>
                  {preview.rate_scope === 'junior' ? (
                    <InfoNote title="DOB-based junior rate">
                      {preview.age_at_effective_date != null ? `Age ${preview.age_at_effective_date}` : 'Junior rate'}
                      {preview.junior_percentage ? ` · ${preview.junior_percentage}%` : ''}
                      {preview.next_rate_review_date ? ` · create successor terms from ${preview.next_rate_review_date}` : ''}
                    </InfoNote>
                  ) : null}
                  {ratePairs(preview).map(([label, value]) => <DataRow key={label} title={label} right={<Text variant="titleSmall">{money(value)}/hr</Text>} />)}
                  {preview.ordinary_hours_note ? <InfoNote title="Ordinary hours">{preview.ordinary_hours_note}</InfoNote> : null}
                </Section>
              ) : null}

              {payBasis === 'ABOVE_AWARD' ? (
                <Section title="Agreed hourly rates" description="The API enforces the selected Award minimum as the floor.">
                  <Field label="Weekday 8 am–7 pm" value={rates.rate_weekday} keyboardType="decimal-pad" onChangeText={(value) => setRates((current) => ({ ...current, rate_weekday: value }))} />
                  <Field label="Saturday 8 am–6 pm" value={rates.rate_saturday} keyboardType="decimal-pad" onChangeText={(value) => setRates((current) => ({ ...current, rate_saturday: value }))} />
                  <Field label="Sunday 7 am–9 pm" value={rates.rate_sunday} keyboardType="decimal-pad" onChangeText={(value) => setRates((current) => ({ ...current, rate_sunday: value }))} />
                  <Field label="Public holiday" value={rates.rate_public_holiday} keyboardType="decimal-pad" onChangeText={(value) => setRates((current) => ({ ...current, rate_public_holiday: value }))} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Checkbox status={rates.early_morning_applicable ? 'checked' : 'unchecked'} onPress={() => setRates((current) => ({ ...current, early_morning_applicable: !current.early_morning_applicable }))} />
                    <Text style={{ flex: 1 }}>Separate weekday 7–8 am agreed rate applies</Text>
                  </View>
                  {rates.early_morning_applicable ? <Field label="Weekday 7–8 am rate" value={rates.rate_early_morning} keyboardType="decimal-pad" onChangeText={(value) => setRates((current) => ({ ...current, rate_early_morning: value }))} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Checkbox status={rates.late_night_applicable ? 'checked' : 'unchecked'} onPress={() => setRates((current) => ({ ...current, late_night_applicable: !current.late_night_applicable }))} />
                    <Text style={{ flex: 1 }}>Separate weekday 9 pm–midnight agreed rate applies</Text>
                  </View>
                  {rates.late_night_applicable ? <Field label="Weekday 9 pm–midnight rate" value={rates.rate_late_night} keyboardType="decimal-pad" onChangeText={(value) => setRates((current) => ({ ...current, rate_late_night: value }))} /> : null}
                  <InfoNote title="Penalty floor">When no separate agreed penalty-window rate is recorded, payroll must still use at least the frozen Award floor.</InfoNote>
                </Section>
              ) : null}
            </>
          ) : null}

          <Field label="Agreement notes" value={notes} multiline onChangeText={setNotes} />
          <Button
            mode="contained"
            loading={busy}
            disabled={busy || !canSave}
            onPress={() => void save()}
          >
            {historical ? 'Save end date / notes' : editing ? 'Save changes' : 'Save engagement'}
          </Button>
        </>
      ) : <EmptyState title="Choose an eligible worker" body="Only employee memberships eligible for employment engagement setup are shown." />}
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
