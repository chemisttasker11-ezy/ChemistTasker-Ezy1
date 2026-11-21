import { fetchActiveShifts, fetchPillBalanceService, fetchRosterOwnerAssignments, getOwnerDashboard, getPendingPharmacyAdminInvitations } from '@chemisttasker/shared-core';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { CalendarClock, CalendarDays, ClipboardCheck, Inbox, MailOpen, MessageSquare, Pill, Plus, Users } from 'lucide-react-native';
import { ContentState, SectionCard, StatList, ViewAllLink } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useAdminWorkspace } from '@/context/AdminWorkspaceContext';
import ChooseAccountTypeCard from '@/components/ChooseAccountTypeCard';
import { type DashboardPayload } from '@/roles/shared/dashboard/dashboardScope';
import {
  BlockLoading,
  BlockNote,
  attendanceStep,
  FAILED_INBOX,
  HomeScroll,
  ItemRow,
  loadManagerInbox,
  type ManagerInbox,
  namesLine,
  type NextStep,
  NextStepCard,
  PersonRow,
  QueueNote,
  Rows,
  timesheetStep,
} from '@/roles/shared/dashboard/ManagerHome';
import { adminStep, formatDay, hoursUntil, openSlots, personName, plural, roleWord, type ShiftLike, slotStart, type StepKey, timeRange } from '@/roles/shared/dashboard/managerHomeLogic';

type Invitation = { id: number; pharmacy_name?: string };
type RosterRow = {
  id: number;
  isUnpublished?: boolean | null;
  userDetail?: { firstName?: string | null; lastName?: string | null; role?: string | null; profilePhotoUrl?: string | null; profilePhoto?: string | null } | null;
  slotDetail?: { date?: string | null; startTime?: string | null; endTime?: string | null } | null;
  shiftDetail?: { roleNeeded?: string | null } | null;
};
type HomeData = {
  scopeKey: string;
  invitations: Invitation[];
  inbox: ManagerInbox;
  active: ShiftLike[] | null;
  roster: RosterRow[] | null;
  dashboard: DashboardPayload | null;
  pills: { balance: number; cost: number } | null;
};

const valueOf = <T,>(result: PromiseSettledResult<T>): T | null => (result.status === 'fulfilled' ? result.value : null);
const asList = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? value : Array.isArray((value as any)?.results) ? (value as any).results : [];
const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function AdminHomeScreen() {
  const router = useRouter();
  const { hasCapability } = useAuth();
  const { activePharmacyId: pharmacyId, activePharmacyName: pharmacyName } = useAdminWorkspace();
  // Web getAdminNav: attendance approvals and the roster need both staff and roster rights.
  const canRoster = Boolean(pharmacyId && hasCapability('MANAGE_ROSTER', pharmacyId));
  const canStaff = Boolean(pharmacyId && hasCapability('MANAGE_STAFF', pharmacyId));
  const canAttendance = canStaff && canRoster;
  const canComms = canStaff || canRoster || Boolean(pharmacyId && hasCapability('MANAGE_COMMUNICATIONS', pharmacyId));
  const scopeKey = `${pharmacyId}:${canRoster}:${canAttendance}`;
  const [snapshot, setData] = useState<HomeData | null>(null);
  // Scope the rendered data too: effects run after the first frame of a pharmacy switch.
  const data = snapshot?.scopeKey === scopeKey ? snapshot : null;
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const generation = useRef(0);
  const go = useCallback((route: string) => router.push(route as any), [router]);
  const adminPath = useCallback((path: string) => (pharmacyId ? `/admin/${pharmacyId}/${path}` : `/admin/${path}`), [pharmacyId]);

  const load = useCallback(async () => {
    const id = ++generation.current;
    const at = new Date();
    const skip = Promise.resolve(null);
    const [invitations, inbox, active, roster, dashboard, pills] = await Promise.allSettled([
      getPendingPharmacyAdminInvitations(),
      pharmacyId ? loadManagerInbox([pharmacyId], { attendance: canAttendance, timesheets: canRoster }) : skip,
      canRoster ? fetchActiveShifts() : skip,
      canAttendance ? fetchRosterOwnerAssignments({ pharmacyId, startDate: isoDay(at), endDate: isoDay(at) }) : skip,
      getOwnerDashboard(pharmacyId ? { workspace: 'internal', pharmacy_id: pharmacyId } : { workspace: 'internal' }),
      fetchPillBalanceService(),
    ]);
    if (id !== generation.current) return;
    const pill = valueOf(pills) as any;
    setNow(at);
    setFailed([dashboard, pills, invitations].every((result) => result.status === 'rejected'));
    setData({
      scopeKey,
      invitations: asList<Invitation>(valueOf(invitations)),
      inbox: (valueOf(inbox) as ManagerInbox | null) ?? FAILED_INBOX,
      active: valueOf(active) as ShiftLike[] | null,
      roster: valueOf(roster) == null ? null : asList<RosterRow>(valueOf(roster)),
      dashboard: valueOf(dashboard) as DashboardPayload | null,
      pills: pill ? { balance: Number(pill.balance ?? 0), cost: Number(pill.shift_post_cost ?? 0) } : null,
    });
  }, [canAttendance, canRoster, pharmacyId, scopeKey]);

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

  const open = useMemo(() => (data?.active ? openSlots(data.active, now, pharmacyId) : []), [data, now, pharmacyId]);
  const today = useMemo(
    () =>
      (data?.roster ?? [])
        // Drafts are not a roster anyone works to yet.
        .filter((row) => !row.isUnpublished)
        .map((row) => ({ row, start: slotStart(row.slotDetail?.date, row.slotDetail?.startTime) }))
        .sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0)),
    [data?.roster],
  );

  const step = useMemo<NextStep | null>(() => {
    if (!data) return null;
    const invite = data.invitations[0];
    const attendance = data.inbox.attendance;
    const gap = open[0];
    const key = adminStep({
      invitations: Boolean(invite), attendance: Boolean(attendance?.count), gap: Boolean(gap),
      timesheets: Boolean(data.inbox.timesheets?.count),
      can: { roster: canRoster, attendance: canAttendance, comms: canComms },
    });
    const steps: Partial<Record<StepKey, () => NextStep | null>> = {
      invitations: () => ({
        key: 'invitations',
        title: data.invitations.length > 1 ? `${data.invitations.length} admin invitations` : `${invite.pharmacy_name || 'A pharmacy'} invited you`,
        body: 'Accept or decline before you can work in that pharmacy.',
        action: 'Review invitations',
        icon: <MailOpen />,
        onPress: () => go('/admin-invitations'),
      }),
      attendance: () => attendanceStep(attendance, () => go('/attendance/reviews'), <Users />, pharmacyName),
      gap: () => ({
        key: 'gap',
        title: `${formatDay(gap.start, now)} is not covered yet`,
        body: `${[roleWord(gap.role), timeRange(gap.startTime, gap.endTime)].filter(Boolean).join(', ')}. ${
          hoursUntil(gap.start, now) <= 1 ? 'It starts within the hour.' : `It starts in ${Math.round(hoursUntil(gap.start, now))} hours.`
        }`,
        action: 'Open shift',
        icon: <CalendarClock />,
        onPress: () => go(`/admin/shifts/${gap.shiftId}`),
      }),
      timesheets: () => timesheetStep(data.inbox.timesheets, () => go('/workforce-timesheets'), <ClipboardCheck />),
      post: () => ({
        key: 'post',
        title: `Need cover at ${pharmacyName}?`,
        body: 'Post a shift and choose who sees it first.',
        action: 'Post a shift',
        icon: <Plus />,
        onPress: () => go(adminPath('post-shift')),
      }),
      hub: () => ({
        key: 'hub', title: `Your team at ${pharmacyName}`, body: 'Catch up on pharmacy updates and conversations.',
        action: 'Open Pharmacy Hub', icon: <Users />, onPress: () => go('/admin/hub'),
      }),
      chat: () => ({
        key: 'chat', title: 'Your admin workspace', body: 'Keep in touch with your pharmacy team.',
        action: 'Open chat', icon: <MessageSquare />, onPress: () => go('/admin/chat'),
      }),
    };
    return steps[key]?.() ?? null;
  }, [adminPath, canAttendance, canComms, canRoster, data, go, now, open, pharmacyName]);

  if (failed && data) {
    return (
      <HomeScroll refreshing={refreshing} onRefresh={refresh}>
        <ContentState kind="error" title="Home could not load" description="Check your connection, then try again." onAction={refresh} />
      </HomeScroll>
    );
  }

  const loading = !data;
  const summary = data?.dashboard?.shift_summary as (DashboardPayload['shift_summary'] & { upcoming_confirmed_count?: number }) | undefined;

  return (
    <HomeScroll refreshing={refreshing} onRefresh={refresh}>
      <NextStepCard step={step} loading={loading} />

      {canAttendance ? (
        <SectionCard
          title="Today's roster"
          icon={<CalendarDays />}
          flush
          action={<ViewAllLink onPress={() => go('/manager/roster')}>Roster</ViewAllLink>}
        >
          {loading ? (
            <BlockLoading rows={3} />
          ) : data?.roster == null ? (
            <BlockNote text="The roster could not load." action="Try again" onAction={refresh} />
          ) : today.length === 0 ? (
            <BlockNote text={`No one is rostered at ${pharmacyName} today.`} action="Open roster" onAction={() => go('/manager/roster')} />
          ) : (
            <Rows>
              {today.map(({ row }) => (
                <PersonRow
                  key={row.id}
                  name={personName(row.userDetail)}
                  photoUrl={row.userDetail?.profilePhotoUrl ?? row.userDetail?.profilePhoto}
                  tone="cyan"
                  detail={[timeRange(row.slotDetail?.startTime, row.slotDetail?.endTime), roleWord(row.userDetail?.role ?? row.shiftDetail?.roleNeeded)].filter(Boolean).join(' · ')}
                />
              ))}
            </Rows>
          )}
        </SectionCard>
      ) : null}

      {canAttendance || canRoster ? (
        <SectionCard title="Needs you" icon={<Inbox />} flush>
          {loading ? <BlockLoading /> : (
            <Rows>
              {canAttendance && data?.inbox.attendance?.count ? (
                <ItemRow
                  icon={<Users />} tone="cyan" label="Attendance to approve"
                  detail={namesLine(data.inbox.attendance.names)} count={data.inbox.attendance.count}
                  countLabel={plural(data.inbox.attendance.count, 'attendance record')}
                  onPress={() => go('/attendance/reviews')}
                />
              ) : null}
              {canRoster && data?.inbox.timesheets?.count ? (
                <ItemRow
                  icon={<ClipboardCheck />} tone="blue" label="Timesheets to review"
                  detail={namesLine(data.inbox.timesheets.names)} count={data.inbox.timesheets.count}
                  countLabel={plural(data.inbox.timesheets.count, 'timesheet')}
                  onPress={() => go('/workforce-timesheets')}
                />
              ) : null}
              <QueueNote
                failed={Boolean(data?.inbox.failed)}
                empty={!(canAttendance && data?.inbox.attendance?.count) && !(canRoster && data?.inbox.timesheets?.count)}
                onRetry={refresh}
              />
            </Rows>
          )}
        </SectionCard>
      ) : null}

      {canRoster ? (
        <SectionCard
          title="Shift fill"
          icon={<CalendarClock />}
          subtitle={open[0] ? `Next gap ${formatDay(open[0].start, now)}, ${timeRange(open[0].startTime, open[0].endTime)}` : undefined}
          action={<ViewAllLink onPress={() => go('/admin/shifts')}>Shift Centre</ViewAllLink>}
        >
          {!loading && data?.dashboard == null ? (
            <BlockNote text="Shift numbers could not load." action="Try again" onAction={refresh} />
          ) : (
            <StatList
              loading={loading}
              rows={[
                { label: 'Open shifts', value: Number(summary?.open_count ?? 0) },
                { label: 'Confirmed, coming up', value: Number(summary?.upcoming_confirmed_count ?? summary?.confirmed_count ?? 0) },
              ]}
            />
          )}
        </SectionCard>
      ) : null}

      <SectionCard title="Pills" icon={<Pill />} flush>
        {loading ? (
          <BlockLoading rows={1} />
        ) : data?.pills == null ? (
          <BlockNote text="Your pill balance could not load." action="Try again" onAction={refresh} />
        ) : (
          <Rows>
            <ItemRow
              icon={<Pill />}
              tone="magenta"
              label={plural(data.pills.balance, 'pill')}
              detail={`${plural(data.pills.cost, 'pill')} per shift post`}
              onPress={() => go(adminPath('pills'))}
            />
          </Rows>
        )}
      </SectionCard>

      <ChooseAccountTypeCard pharmacyId={pharmacyId} />
    </HomeScroll>
  );
}
