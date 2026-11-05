import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  Clock,
  CreditCard,
  Hourglass,
  Inbox,
  Navigation,
  Plus,
  ReceiptText,
  Search,
  Store,
  Timer,
  UserRound,
} from 'lucide-react-native';
import {
  attendance,
  fetchMyConfirmedShifts,
  fetchRosterWorkerAssignments,
  fetchShiftOffersService,
  fetchWorkerShiftRequestsService,
  formatAttendanceMinutes,
  getLeaveRequests,
  getOnboardingDetail,
  workforce,
} from '@chemisttasker/shared-core';
import { ContentState, SectionCard, ViewAllLink } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { statusToneFor } from '@/features/parity/statusTone';
import { openMap } from '@/roles/shared/shifts/WorkerBookedShifts';
import getShiftPharmacyName from '@/roles/shared/shifts/utils/getShiftPharmacyName';
import { type DashboardPayload, useScopedDashboard } from './dashboardScope';
import { BlockLoading, BlockNote, HomeScroll, ItemRow, type NextStep, NextStepCard, Rows } from './ManagerHome';
import { formatDay, formatTime, plural, roleWord, slotStart, timeRange } from './managerHomeLogic';
import {
  bookedShifts,
  canClockIn,
  isoDay,
  isRunning,
  isSoon,
  myRequests,
  ownRosterAssignments,
  type RequestRow,
  rosterShifts,
  startsIn,
  type WorkerShift,
  workerStep,
  type WorkerStepKey,
} from './workerHomeLogic';

type AwaitingOffer = {
  offeredSlotDate?: string | null;
  slotDetail?: { date?: string | null; startTime?: string | null } | null;
  offeredStartTime?: string | null;
  shiftDetail?: { pharmacyName?: string | null; pharmacyDetail?: { name?: string | null } | null } | null;
};
type HoursRow = { id: number; status?: string; worked_minutes?: number; start_date?: string; end_date?: string; pharmacy?: { id: number; name: string } };
type ClockStatus = { has_active_session?: boolean; pharmacy_name?: string | null; started_at?: string | null; is_on_break?: boolean };

type HomeData = {
  scopeKey: string;
  dashboard: DashboardPayload | null;
  status: ClockStatus | null;
  shiftsFailed: boolean;
  /** Booked and rostered shifts that have not ended; null when neither source loaded. */
  shifts: WorkerShift[] | null;
  /** Internal workspace: this week's roster, null when it failed. */
  week: WorkerShift[] | null;
  awaiting: AwaitingOffer[] | null;
  progress: number | null;
  requests: RequestRow[] | null;
  hours: HoursRow[] | null;
};

const valueOf = <T,>(result: PromiseSettledResult<T>): T | null => (result.status === 'fulfilled' ? result.value : null);
const asList = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? value : Array.isArray((value as any)?.results) ? (value as any).results : [];
const ROWS = 4;
const WEEK_DAYS = 7;

/** A dashboard shift's start, from its ISO datetime or its date. */
function previewStart(shift: { date?: string; start_datetime?: string; startDatetime?: string }): Date | null {
  const iso = shift.start_datetime || shift.startDatetime;
  const parsed = iso ? new Date(iso) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : slotStart(shift.date);
}

/** Latest timesheet period per pharmacy: the hours a worker is building up right now. */
function currentHours(rows: HoursRow[]): HoursRow[] {
  const latest = new Map<number | string, HoursRow>();
  for (const row of rows) {
    const key = row.pharmacy?.id ?? row.id;
    const seen = latest.get(key);
    if (!seen || String(row.start_date ?? '') > String(seen.start_date ?? '')) latest.set(key, row);
  }
  return [...latest.values()].slice(0, 2);
}

/**
 * Pharmacist and other staff Home: one next step (the shift they are on or about to start first), then blocks that
 * follow the workspace switch. Internal: this week's roster, requests, hours. Platform: shifts for you, money.
 */
export default function WorkerHome({ role }: { role: 'PHARMACIST' | 'OTHER_STAFF' }) {
  const router = useRouter();
  const { user } = useAuth();
  const persona = role === 'PHARMACIST' ? 'pharmacist' : 'otherstaff';
  const scope = useScopedDashboard(role);
  const { fetchDashboard, isLoading: scopeLoading, workspace, selectedPharmacyId } = scope;
  const platform = workspace === 'platform';
  const userId = Number(user?.id || 0);
  const scopeKey = `${userId}:${workspace}:${selectedPharmacyId}`;
  const [snapshot, setData] = useState<HomeData | null>(null);
  const data = !scopeLoading && snapshot?.scopeKey === scopeKey ? snapshot : null;
  const [failedScope, setFailedScope] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // Only the newest load may land, so a workspace switch mid-load never shows the old workspace.
  const generation = useRef(0);
  const go = useCallback((route: string) => router.push(route as any), [router]);

  const load = useCallback(async () => {
    if (scopeLoading) return;
    const id = ++generation.current;
    const at = new Date();
    const internal = !platform;
    const weekEnd = new Date(at.getFullYear(), at.getMonth(), at.getDate() + WEEK_DAYS);
    const rosterQuery = { startDate: isoDay(at), endDate: isoDay(weekEnd), ...(selectedPharmacyId != null ? { pharmacyId: selectedPharmacyId } : {}) };
    const skip = Promise.resolve(null);
    const [dashboard, status, booked, roster, awaiting, onboarding, shiftRequests, leave, hours] = await Promise.allSettled([
      fetchDashboard(),
      attendance.getWorkerStatus(),
      fetchMyConfirmedShifts(),
      internal ? fetchRosterWorkerAssignments(rosterQuery) : skip,
      fetchShiftOffersService({ status: 'ACCEPTED_AWAITING_PAYMENT' }),
      getOnboardingDetail(role === 'PHARMACIST' ? 'pharmacist' : 'other_staff'),
      internal ? fetchWorkerShiftRequestsService(selectedPharmacyId != null ? { pharmacyId: selectedPharmacyId } : {}) : skip,
      internal ? getLeaveRequests() : skip,
      internal ? workforce.getMyHours() : skip,
    ]);
    if (id !== generation.current) return;
    const bookedList = valueOf(booked) ? bookedShifts(valueOf(booked) as any[], at) : null;
    const ownRoster = valueOf(roster) ? ownRosterAssignments(asList<any>(valueOf(roster)), userId) : null;
    const rosterList = ownRoster ? rosterShifts(ownRoster, at) : null;
    const merged = bookedList || rosterList ? [...(bookedList ?? []), ...(rosterList ?? [])].sort((a, b) => a.start.getTime() - b.start.getTime()) : null;
    setNow(at);
    setFailedScope([dashboard, status, booked].every((result) => result.status === 'rejected') ? scopeKey : null);
    setData({
      scopeKey,
      dashboard: valueOf(dashboard),
      status: valueOf(status) as ClockStatus | null,
      shiftsFailed: booked.status === 'rejected' || (internal && roster.status === 'rejected'),
      shifts: merged,
      week: internal ? rosterList : null,
      awaiting: awaiting.status === 'fulfilled' ? (awaiting.value as AwaitingOffer[]) : null,
      progress: (valueOf(onboarding) as any)?.progress_percent ?? null,
      requests: internal && shiftRequests.status === 'fulfilled' && leave.status === 'fulfilled'
        ? myRequests(asList(shiftRequests.value), asList<any>(leave.value).map((row) => {
          const assignment = ownRoster?.find((item) => item.id === row.slot_assignment);
          return {
            id: row.id, user: row.user, leaveType: row.leave_type, status: row.status, dateApplied: row.date_applied,
            startAt: row.start_at, slotDate: row.slot_date ?? assignment?.slotDate ?? assignment?.slotDetail?.date,
            pharmacyName: row.pharmacy_name ?? assignment?.shiftDetail?.pharmacyName,
          };
        }), userId)
        : null,
      hours: internal && hours.status === 'fulfilled' ? currentHours(asList(hours.value)) : null,
    });
  }, [fetchDashboard, platform, role, scopeKey, scopeLoading, selectedPharmacyId, userId]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const shiftRoute = useCallback(
    (shift: WorkerShift) => (shift.source === 'booked' && shift.shiftId != null ? `/${persona}/shifts/${shift.shiftId}` : `/${persona}/roster`),
    [persona],
  );

  const step = useMemo<NextStep | null>(() => {
    if (!data) return null;
    const next = data.shifts?.[0] ?? null;
    const clock = data.status;
    const offers = data.awaiting ?? [];
    const key: WorkerStepKey = workerStep({
      clockFailed: clock == null,
      shiftsFailed: data.shiftsFailed,
      awaitingFailed: data.awaiting == null,
      progressFailed: data.progress == null,
      clockedIn: Boolean(clock?.has_active_session),
      soon: Boolean(next && isSoon(next, now)),
      payment: offers.length > 0,
      profile: data.progress != null && data.progress < 100,
      upcoming: Boolean(next),
      platform,
    });
    const directions = next?.address
      ? { label: 'Directions', icon: <Navigation />, onPress: () => openMap(next.address) }
      : undefined;
    const where = (shift: WorkerShift) => [roleWord(shift.role), shift.pharmacyName].filter(Boolean).join(' at ');
    const steps: Record<WorkerStepKey, () => NextStep> = {
      retry: () => ({
        key: 'retry',
        title: clock == null ? 'Clock status could not load' : 'Your next step could not load',
        body: 'Check your connection, then try again.',
        action: 'Try again',
        icon: <Clock />,
        onPress: refresh,
      }),
      clockedIn: () => ({
        key: 'clockedIn',
        title: clock?.is_on_break ? 'You are on a break' : `You are clocked in${clock?.pharmacy_name ? ` at ${clock.pharmacy_name}` : ''}`,
        body: clock?.started_at && !Number.isNaN(new Date(clock.started_at).getTime())
          ? `Since ${formatTime(new Date(clock.started_at).toTimeString())}. Clock out here when you finish.`
          : 'Clock out here when you finish.',
        action: clock?.is_on_break ? 'Open clock' : 'Clock out',
        icon: <Timer />,
        onPress: () => go('/attendance/clock'),
      }),
      soon: () => ({
        key: 'soon',
        title: next && isRunning(next, now) ? `On now at ${next.pharmacyName}` : `${startsIn(next!.start, now)} at ${next!.pharmacyName}`,
        body: `${where(next!)}, ${formatDay(next!.start, now)} ${timeRange(next!.startTime, next!.endTime)}.`,
        action: canClockIn(next!, now) ? 'Clock in' : 'View shift',
        icon: canClockIn(next!, now) ? <Clock /> : <CalendarDays />,
        onPress: () => go(canClockIn(next!, now) ? '/attendance/clock' : shiftRoute(next!)),
        secondary: directions,
      }),
      payment: () => {
        const offer = offers[0];
        const pharmacy = offer?.shiftDetail?.pharmacyName || offer?.shiftDetail?.pharmacyDetail?.name;
        const start = slotStart(offer?.offeredSlotDate ?? offer?.slotDetail?.date, offer?.offeredStartTime ?? offer?.slotDetail?.startTime);
        return {
          key: 'payment',
          title: offers.length > 1 ? `${offers.length} shifts reserved for you` : 'Reserved, waiting for payment',
          body: offers.length > 1
            ? 'Each booking is confirmed once the pharmacy pays and the payment is verified.'
            : `${pharmacy || 'The pharmacy'}${start ? ` for ${formatDay(start, now)}` : ''}. Your booking is confirmed once their payment is verified.`,
          action: 'View shifts',
          icon: <Hourglass />,
          onPress: () => go(`/${persona}/shifts`),
        };
      },
      profile: () => ({
        key: 'profile',
        title: 'Finish your profile',
        body: `It is ${data.progress}% complete. Pharmacies need a complete, verified profile before they can book you.`,
        action: 'Finish profile',
        icon: <UserRound />,
        onPress: () => go(`/${persona}/profile`),
      }),
      upcoming: () => ({
        key: 'upcoming',
        title: `Next shift at ${next!.pharmacyName}`,
        body: `${roleWord(next!.role)}, ${formatDay(next!.start, now)} ${timeRange(next!.startTime, next!.endTime)}.`,
        action: 'View shift',
        icon: <CalendarDays />,
        onPress: () => go(shiftRoute(next!)),
        secondary: directions,
      }),
      publish: () => ({
        key: 'publish',
        title: 'Let pharmacies know you are free',
        body: 'Publish your availability and pharmacies on ChemistTasker can offer you shifts.',
        action: 'Publish availability',
        icon: <CalendarPlus />,
        onPress: () => go(`/${persona}/publish-availability`),
      }),
      availability: () => ({
        key: 'availability',
        title: 'When can you work?',
        body: 'Set your available days and times so your manager can roster you.',
        action: 'Set availability',
        icon: <CalendarCheck />,
        onPress: () => go(`/${persona}/availability`),
      }),
    };
    return steps[key]();
  }, [data, go, now, persona, platform, refresh, shiftRoute]);

  if (failedScope === scopeKey && data) {
    return (
      <HomeScroll refreshing={refreshing} onRefresh={refresh}>
        <ContentState kind="error" title="Home could not load" description="Check your connection, then try again." onAction={refresh} />
      </HomeScroll>
    );
  }

  const loading = !data;

  return (
    <HomeScroll refreshing={refreshing} onRefresh={refresh}>
      <NextStepCard step={step} loading={loading} />
      {platform ? (
        <>
          <ShiftsForYou data={data} loading={loading} now={now} persona={persona} go={go} onRetry={refresh} />
          <Money data={data} loading={loading} persona={persona} go={go} onRetry={refresh} />
        </>
      ) : (
        <>
          <ThisWeek data={data} loading={loading} now={now} persona={persona} go={go} onRetry={refresh} />
          <Requests data={data} loading={loading} now={now} go={go} persona={persona} onRetry={refresh} />
          <Hours data={data} loading={loading} go={go} onRetry={refresh} />
        </>
      )}
    </HomeScroll>
  );
}

type BlockProps = { data: HomeData | null; loading: boolean; go: (route: string) => void; onRetry: () => void };

function ThisWeek({ data, loading, now, persona, go, onRetry }: BlockProps & { now: Date; persona: string }) {
  const week = data?.week;
  return (
    <SectionCard title="This week" icon={<CalendarDays />} flush action={<ViewAllLink onPress={() => go(`/${persona}/roster`)}>My roster</ViewAllLink>}>
      {loading ? (
        <BlockLoading rows={3} />
      ) : week == null ? (
        <BlockNote text="Your roster could not load." action="Try again" onAction={onRetry} />
      ) : week.length === 0 ? (
        <BlockNote text="Nothing rostered in the next 7 days." action="Set availability" onAction={() => go(`/${persona}/availability`)} />
      ) : (
        <Rows>
          {week.slice(0, ROWS).map((shift) => (
            <ItemRow
              key={shift.key}
              icon={<CalendarDays />}
              tone={isRunning(shift, now) ? 'cyan' : 'violet'}
              label={shift.pharmacyName}
              detail={[roleWord(shift.role), `${formatDay(shift.start, now)}, ${timeRange(shift.startTime, shift.endTime)}`].filter(Boolean).join(', ')}
              pill={isRunning(shift, now) ? { label: 'On now', tone: 'green' } : undefined}
              onPress={() => go(`/${persona}/roster`)}
            />
          ))}
          {week.length > ROWS ? (
            <BlockNote text={`${plural(week.length - ROWS, 'more shift')} this week.`} action="See my roster" onAction={() => go(`/${persona}/roster`)} />
          ) : null}
        </Rows>
      )}
    </SectionCard>
  );
}

function Requests({ data, loading, now, persona, go, onRetry }: BlockProps & { now: Date; persona: string }) {
  const requests = data?.requests;
  return (
    <SectionCard title="Requests" icon={<Inbox />} flush action={<ViewAllLink onPress={() => go('/my-leave')}>My leave</ViewAllLink>}>
      {loading ? (
        <BlockLoading />
      ) : requests == null ? (
        <BlockNote text="Your requests could not load." action="Try again" onAction={onRetry} />
      ) : requests.length === 0 ? (
        <BlockNote text="No shift or leave requests. Need time off?" action="Request leave" onAction={() => go('/my-leave')} />
      ) : (
        <Rows>
          {requests.slice(0, ROWS).map((row) => {
            const start = row.date ? slotStart(row.date, row.startTime) : null;
            return (
              <ItemRow
                key={row.key}
                icon={row.kind === 'leave' ? <CalendarCheck /> : <CalendarPlus />}
                tone={row.kind === 'leave' ? 'blue' : 'violet'}
                label={row.title}
                detail={[start ? `${row.dateLabel}${formatDay(start, now)} ${timeRange(row.startTime, row.endTime)}`.trim() : null, row.pharmacyName || (row.kind === 'leave' ? 'Pharmacy not supplied' : null)].filter(Boolean).join(', ') || undefined}
                pill={{ label: row.status, tone: statusToneFor(row.status) }}
                onPress={() => go(row.kind === 'leave' ? '/my-leave' : `/${persona}/roster`)}
              />
            );
          })}
        </Rows>
      )}
    </SectionCard>
  );
}

function Hours({ data, loading, go, onRetry }: BlockProps) {
  const hours = data?.hours;
  return (
    <SectionCard title="Hours this period" icon={<Timer />} flush action={<ViewAllLink onPress={() => go('/my-hours')}>My hours</ViewAllLink>}>
      {loading ? (
        <BlockLoading rows={1} />
      ) : hours == null ? (
        <BlockNote text="Your hours could not load." action="Try again" onAction={onRetry} />
      ) : hours.length === 0 ? (
        <BlockNote text="No hours recorded yet. They appear here once your pharmacy opens a timesheet." action="My attendance" onAction={() => go('/attendance')} />
      ) : (
        <Rows>
          {hours.map((row) => (
            <ItemRow
              key={row.id}
              icon={<Clock />}
              tone="cyan"
              label={row.pharmacy?.name || 'Timesheet'}
              detail={`${formatAttendanceMinutes(row.worked_minutes ?? 0)} worked`}
              pill={row.status ? { label: roleWord(row.status), tone: statusToneFor(roleWord(row.status)) } : undefined}
              onPress={() => go('/my-hours')}
            />
          ))}
        </Rows>
      )}
    </SectionCard>
  );
}

function ShiftsForYou({ data, loading, now, persona, go, onRetry }: BlockProps & { now: Date; persona: string }) {
  const shifts = data?.dashboard ? data.dashboard.recommended_shifts ?? [] : null;
  return (
    <SectionCard title="Shifts for you" icon={<Search />} flush action={<ViewAllLink onPress={() => go(`/${persona}/shifts`)}>All shifts</ViewAllLink>}>
      {loading ? (
        <BlockLoading rows={3} />
      ) : shifts == null ? (
        <BlockNote text="Shifts could not load." action="Try again" onAction={onRetry} />
      ) : shifts.length === 0 ? (
        <BlockNote text="No matches right now. New shifts near you show up here first." action="Browse shifts" onAction={() => go(`/${persona}/shifts`)} />
      ) : (
        <Rows>
          {shifts.slice(0, ROWS).map((shift) => {
            const start = previewStart(shift);
            return (
              <ItemRow
                key={shift.id}
                icon={<Store />}
                tone="blue"
                label={getShiftPharmacyName(shift)}
                detail={[start ? `${formatDay(start, now)}${shift.start_datetime || shift.startDatetime ? `, ${formatTime(start.toTimeString())}` : ''}` : null, shift.reason, shift.status ? roleWord(shift.status) : null].filter(Boolean).join(', ') || undefined}
                onPress={() => go(`/${persona}/shifts/${shift.id}`)}
              />
            );
          })}
        </Rows>
      )}
    </SectionCard>
  );
}

function Money({ data, loading, persona, go, onRetry }: BlockProps & { persona: string }) {
  const summary = data?.dashboard?.invoice_summary;
  const unpaid = Number(summary?.unpaid_count ?? 0) || 0;
  const billed = summary?.total_billed ?? data?.dashboard?.bills_summary?.total_billed;
  return (
    <SectionCard title="Money" icon={<CreditCard />} flush action={<ViewAllLink onPress={() => go(`/${persona}/invoice`)}>Invoices</ViewAllLink>}>
      {loading ? (
        <BlockLoading />
      ) : !data?.dashboard ? (
        <BlockNote text="Invoices could not load." action="Try again" onAction={onRetry} />
      ) : (
        <Rows>
          <ItemRow
            icon={<ReceiptText />}
            tone="magenta"
            label={unpaid ? 'Unpaid invoices' : 'No unpaid invoices'}
            detail={[unpaid && summary?.unpaid_total != null ? `${summary.unpaid_total} outstanding` : null, billed != null ? `${billed} billed` : null].filter(Boolean).join(', ') || undefined}
            count={unpaid || undefined}
            countLabel={unpaid ? plural(unpaid, 'unpaid invoice') : undefined}
            onPress={() => go(`/${persona}/invoice`)}
          />
          <ItemRow icon={<Plus />} tone="violet" label="New invoice" detail="Bill a pharmacy for a shift you worked" onPress={() => go(`/${persona}/invoice/new`)} />
        </Rows>
      )}
    </SectionCard>
  );
}
