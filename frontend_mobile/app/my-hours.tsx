import React, { useCallback, useEffect, useState } from 'react';
import { Button, Chip, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { workforce } from '@chemisttasker/shared-core';
import {
  DataRow,
  EmptyState,
  InfoNote,
  MetricGrid,
  ParityPage,
  Section,
  palette,
} from '@/features/parity/ParityUI';

type Row = {
  id: number;
  pharmacy: { id: number; name: string };
  start_date: string;
  end_date: string;
  status: string;
  revision_number: number | null;
  needs_rebuild: boolean;
  rostered_minutes: number;
  worked_minutes: number;
  approved_leave_minutes: number;
  reviewed_minutes: number;
  blocking_checks: number;
  warning_checks: number;
};

const hours = (value?: number | null) => value == null ? '—' : `${(value / 60).toFixed(2)} h`;

export default function MyHoursScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState<number | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const response = await workforce.getMyHours();
      setRows(Array.isArray(response) ? response : []);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to load your hours.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (row: Row) => {
    if (!row.revision_number) return;
    setSubmitting(row.id);
    setError('');
    try {
      await workforce.submitTimesheet(row.id, row.revision_number);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to submit the timesheet.');
    } finally {
      setSubmitting(null);
    }
  };

  const latest = rows[0] ?? null;
  const totalBlocking = rows.reduce((sum, row) => sum + Number(row.blocking_checks || 0), 0);
  const totalWarnings = rows.reduce((sum, row) => sum + Number(row.warning_checks || 0), 0);

  return (
    <ParityPage
      title="My hours"
      subtitle="Compare rostered, captured and reviewed time before submission."
      loading={loading}
      error={error}
      onRetry={() => load()}
      onRefresh={() => load(true)}
      refreshing={refreshing}
    >
      <MetricGrid items={[
        { label: 'Periods', value: rows.length },
        { label: 'Blocking checks', value: totalBlocking, tone: totalBlocking ? 'danger' : 'success' },
        { label: 'Warnings', value: totalWarnings, tone: totalWarnings ? 'warning' : 'success' },
      ]} />

      <InfoNote title="How corrections work">
        Attendance remains the source of truth. If a clock event is missing, request the correction from the relevant period rather than editing reviewed hours directly.
      </InfoNote>

      <Section title="Timesheet periods">
        {rows.length ? rows.map((row) => (
          <Section
            key={row.id}
            title={row.pharmacy?.name || 'Pharmacy'}
            description={`${row.start_date} – ${row.end_date}`}
            action={<Chip compact>{String(row.status || '').replaceAll('_', ' ')}</Chip>}
          >
            <MetricGrid items={[
              { label: 'Rostered', value: hours(row.rostered_minutes) },
              { label: 'Worked', value: hours(row.worked_minutes) },
              { label: 'Leave', value: hours(row.approved_leave_minutes) },
              { label: 'Reviewed', value: hours(row.reviewed_minutes) },
            ]} />
            {row.blocking_checks || row.warning_checks || row.needs_rebuild ? (
              <>
                {row.blocking_checks > 0 ? <Text style={{ color: palette.danger }}>{row.blocking_checks} blocking check{row.blocking_checks === 1 ? '' : 's'} must be resolved.</Text> : null}
                {row.warning_checks > 0 ? <Text style={{ color: palette.warning }}>{row.warning_checks} warning{row.warning_checks === 1 ? '' : 's'} require review.</Text> : null}
                {row.needs_rebuild ? <InfoNote title="Recalculation pending" tone="warning">This period needs to be rebuilt before it can be submitted.</InfoNote> : null}
              </>
            ) : <InfoNote title="Ready for review" tone="success">No blocking checks are reported for this period.</InfoNote>}
            <DataRow
              title="Attendance correction"
              subtitle="Request a missing clock-in or clock-out against this timesheet."
              onPress={() => router.push(`/attendance/corrections/new?timesheetId=${row.id}` as any)}
            />
            <Button
              mode="contained"
              loading={submitting === row.id}
              disabled={!row.revision_number || row.needs_rebuild || row.status === 'APPROVED' || row.status === 'SUBMITTED' || submitting != null}
              onPress={() => void submit(row)}
            >
              {row.status === 'SUBMITTED' ? 'Submitted' : row.status === 'APPROVED' ? 'Approved' : 'Submit reviewed hours'}
            </Button>
          </Section>
        )) : <EmptyState title="No timesheet periods" body="Periods will appear after attendance and roster data create your first timesheet." />}
      </Section>

      {latest ? (
        <Text variant="bodySmall" style={{ color: palette.muted }}>
          Most recent period: {latest.start_date} – {latest.end_date}
        </Text>
      ) : null}
    </ParityPage>
  );
}
