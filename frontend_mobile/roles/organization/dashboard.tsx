import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { CalendarDays, ClipboardCheck, Inbox, MailOpen, MessageSquare, Plus, Store, UserCheck, UserPlus, UserRound, Users } from 'lucide-react-native';
import {
  fetchShiftCounterOffersBatchService,
  fetchShiftInterests,
  getOrganizationMembership,
  getOrganizationMemberships,
  getPendingPharmacyAdminInvitations,
  shiftsDomain,
} from '@chemisttasker/shared-core';
import { ContentState, SectionCard, ViewAllLink } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useScopedDashboard } from '@/roles/shared/dashboard/dashboardScope';
import {
  BlockLoading,
  BlockNote,
  attendanceStep,
  FAILED_INBOX,
  HomeScroll,
  INBOX_PHARMACY_LIMIT,
  ItemRow,
  loadManagerInbox,
  type ManagerInbox,
  namesLine,
  type NextStep,
  NextStepCard,
  orgCapabilities,
  PersonRow,
  QueueNote,
  Rows,
  timesheetStep,
} from '@/roles/shared/dashboard/ManagerHome';
import {
  applicantCount,
  organizationStep,
  type StepKey,
  formatDay,
  type Occurrence,
  openSlots,
  pharmacyGaps,
  personName,
  plural,
  roleWord,
  type ShiftLike,
  timeRange,
} from '@/roles/shared/dashboard/managerHomeLogic';

type Invitation = { id: number; pharmacy_name?: string };
type Member = { id: number; role?: string; user?: { first_name?: string; last_name?: string; email?: string; profile_photo_url?: string | null; profile_photo?: string | null } };
type HomeData = {
  scopeKey: string;
  invitations: Invitation[];
  shifts: ShiftLike[] | null;
  applicants: Array<{ at: Occurrence; count: number }>;
  queuesFailed: boolean;
  inbox: ManagerInbox;
  members: Member[] | null;
  memberCount: number;
};

const valueOf = <T,>(result: PromiseSettledResult<T>): T | null => (result.status === 'fulfilled' ? result.value : null);
const asList = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? value : Array.isArray((value as any)?.results) ? (value as any).results : [];
const GAP_ROWS = 5;
const TEAM_ROWS = 4;
const APPLICANT_SHIFTS = 5;

export default function OrganizationDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const scope = useScopedDashboard('ORGANIZATION');
  const can = useMemo(() => orgCapabilities(user), [user]);
  const orgId = getOrganizationMembership(user)?.organization_id ?? null;
  const pharmacyId = scope.selectedPharmacyId;
  // Keyed by the ids: the org pharmacy list arrives after the user's own, and only a real change reloads Home.
  const idsKey = scope.pharmacies.map((item) => item.id).join(',');
  const pharmacyIds = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey]);
  const scopeKey = `${orgId}:${pharmacyId}:${idsKey}:${can.roster}:${can.attendance}`;
  const [snapshot, setData] = useState<HomeData | null>(null);
  const data = !scope.isLoading && snapshot?.scopeKey === scopeKey ? snapshot : null;
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const generation = useRef(0);
  const go = useCallback((route: string) => router.push(route as any), [router]);
  const { fetchDashboard, isLoading: scopeLoading } = scope;

  const load = useCallback(async () => {
    if (scopeLoading) return;
    const id = ++generation.current;
    const at = new Date();
    const [invitations, dashboard, inbox, members] = await Promise.allSettled([
      getPendingPharmacyAdminInvitations(),
      fetchDashboard(),
      loadManagerInbox(pharmacyId != null ? [pharmacyId] : pharmacyIds, { attendance: can.attendance, timesheets: can.roster }),
      orgId != null ? getOrganizationMemberships({ organization: orgId, limit: TEAM_ROWS + 1 }) : Promise.resolve(null),
    ]);
    const payload = valueOf(dashboard) as { shifts?: unknown[] } | null;
    const shifts = payload ? asList<any>(payload.shifts).map((shift) => shiftsDomain.mapShift(shift) as ShiftLike) : null;
    const soonest = shifts && can.roster
      ? [...new Map(openSlots(shifts, at).map((row) => [row.shiftId, row])).values()].slice(0, APPLICANT_SHIFTS)
      : [];
    let applicants: HomeData['applicants'] = [];
    let applicantsFailed = can.roster && dashboard.status === 'rejected';
    if (soonest.length) {
      const ids = soonest.map((row) => row.shiftId);
      const [interests, counters] = await Promise.allSettled([
        Promise.allSettled(ids.map((shiftId) => fetchShiftInterests({ shiftId }))),
        fetchShiftCounterOffersBatchService(ids),
      ]);
      const interestLists = valueOf(interests) ?? [];
      applicantsFailed = counters.status === 'rejected' || interests.status === 'rejected' || interestLists.some((result) => result.status === 'rejected');
      const counterMap = (valueOf(counters) ?? {}) as Record<number, Array<{ status?: string | null }>>;
      applicants = soonest
        .map((row, index) => ({ at: row, count: applicantCount(interestLists[index]?.status === 'fulfilled' ? interestLists[index].value : [], counterMap[row.shiftId] ?? []) }))
        .filter((row) => row.count > 0);
    }
    if (id !== generation.current) return;
    const memberRows = valueOf(members);
    setNow(at);
    setFailed(dashboard.status === 'rejected' && invitations.status === 'rejected');
    setData({
      scopeKey,
      invitations: asList<Invitation>(valueOf(invitations)),
      shifts,
      applicants,
      queuesFailed: applicantsFailed,
      inbox: valueOf(inbox) ?? FAILED_INBOX,
      members: memberRows == null ? null : asList<Member>(memberRows),
      memberCount: Number((memberRows as any)?.count ?? asList(memberRows).length),
    });
  }, [can.attendance, can.roster, fetchDashboard, orgId, pharmacyId, pharmacyIds, scopeLoading, scopeKey]);

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

  const open = useMemo(() => (data?.shifts ? openSlots(data.shifts, now) : []), [data?.shifts, now]);
  const gaps = useMemo(() => {
    const places = pharmacyId != null ? scope.pharmacies.filter((item) => item.id === pharmacyId) : scope.pharmacies;
    return pharmacyGaps(places, open);
  }, [open, pharmacyId, scope.pharmacies]);
  const short = gaps.filter((row) => row.open > 0);
  const shiftRoute = useCallback(
    (shiftId: number) => (can.roster ? `/organization/shifts/${shiftId}` : '/organization/pharmacies'),
    [can.roster],
  );

  const step = useMemo<NextStep | null>(() => {
    if (!data) return null;
    const invite = data.invitations[0];
    const gap = can.roster ? open[0] : null;
    const applied = data.applicants[0];
    const key = organizationStep({
      invitations: Boolean(invite), applicants: Boolean(applied), gap: Boolean(gap),
      attendance: Boolean(data.inbox.attendance?.count), timesheets: Boolean(data.inbox.timesheets?.count), can,
    });
    const steps: Partial<Record<StepKey, () => NextStep | null>> = {
      invitations: () => ({
        key: 'invitations',
        title: data.invitations.length > 1 ? `${data.invitations.length} admin invitations` : `${invite.pharmacy_name || 'A pharmacy'} invited you`,
        body: data.invitations.length > 1 ? 'Pharmacies want you to help run them. Accept or decline each one.' : 'They want you as an admin. Accept or decline the invitation.',
        action: 'Review invitations',
        icon: <MailOpen />,
        onPress: () => go('/admin-invitations'),
      }),
      applicants: () => ({
        key: 'applicants',
        title: `${plural(applied.count, 'applicant')} for ${formatDay(applied.at.start, now)}`,
        body: `${applied.at.pharmacyName}, ${timeRange(applied.at.startTime, applied.at.endTime)}.`,
        action: 'Review applicants',
        icon: <UserCheck />,
        onPress: () => go(`/organization/shifts/${applied.at.shiftId}`),
      }),
      gap: () => ({
        key: 'gap',
        title: `${gap!.pharmacyName} needs cover ${formatDay(gap!.start, now)}`,
        body: `${[roleWord(gap!.role), timeRange(gap!.startTime, gap!.endTime)].filter(Boolean).join(', ')}. ${plural(open.length, 'open shift')} across your pharmacies.`,
        action: 'Open shift',
        icon: <CalendarDays />,
        onPress: () => go(shiftRoute(gap!.shiftId)),
      }),
      attendance: () => attendanceStep(data.inbox.attendance, () => go('/attendance/reviews'), <Users />),
      timesheets: () => timesheetStep(data.inbox.timesheets, () => go('/workforce-timesheets'), <ClipboardCheck />),
      post: () => ({
        key: 'post',
        title: 'Post a shift for a pharmacy',
        body: 'Pick the pharmacy, then choose who sees the shift first.',
        action: 'Post a shift',
        icon: <Plus />,
        onPress: () => go('/organization/post-shift'),
      }),
      pharmacies: () => ({
        key: 'pharmacies', title: 'Your pharmacies', body: 'Open a pharmacy to see its details and team.',
        action: 'Open pharmacies', icon: <Store />, onPress: () => go('/organization/pharmacies'),
      }),
      invite: () => ({
        key: 'invite', title: 'Bring your team together', body: 'Invite staff to your organization.',
        action: 'Invite staff', icon: <UserPlus />, onPress: () => go('/organization/invite'),
      }),
      chat: () => ({
        key: 'chat', title: 'Keep in touch with your team', body: 'Open your pharmacy conversations.',
        action: 'Open chat', icon: <MessageSquare />, onPress: () => go('/organization/chat'),
      }),
      profile: () => ({
        key: 'profile', title: 'Your organization workspace', body: 'Keep your contact details up to date.',
        action: 'View profile', icon: <UserRound />, onPress: () => go('/organization/profile'),
      }),
    };
    return steps[key]?.() ?? null;
  }, [can, data, go, now, open, shiftRoute]);

  if (failed && data) {
    return (
      <HomeScroll refreshing={refreshing} onRefresh={refresh}>
        <ContentState kind="error" title="Home could not load" description="Check your connection, then try again." onAction={refresh} />
      </HomeScroll>
    );
  }

  const loading = !data;
  const inbox = data?.inbox;
  const applicantTotal = data?.applicants.reduce((total, row) => total + row.count, 0) ?? 0;
  const truncated = pharmacyId == null && pharmacyIds.length > INBOX_PHARMACY_LIMIT;
  const showInbox = can.roster || can.attendance;

  return (
    <HomeScroll refreshing={refreshing} onRefresh={refresh}>
      <NextStepCard step={step} loading={loading} />

      {can.pharmacies || can.roster ? <SectionCard
        title="Pharmacies needing cover"
        icon={<Store />}
        flush
        action={can.pharmacies ? <ViewAllLink onPress={() => go('/organization/pharmacies')}>All</ViewAllLink> : undefined}
      >
        {loading ? (
          <BlockLoading />
        ) : data?.shifts == null ? (
          <BlockNote text="Shifts could not load." action="Try again" onAction={refresh} />
        ) : short.length === 0 ? (
          <BlockNote
            text={gaps.length ? 'Every pharmacy is covered for its posted shifts.' : 'No pharmacies in your scope yet.'}
            action={can.roster ? 'Post a shift' : undefined}
            onAction={() => go('/organization/post-shift')}
          />
        ) : (
          <Rows>
            {short.slice(0, GAP_ROWS).map((row) => (
              <ItemRow
                key={row.id}
                icon={<Store />}
                tone="blue"
                label={row.name}
                detail={row.next ? `Next gap ${formatDay(row.next.start, now)}, ${timeRange(row.next.startTime, row.next.endTime)}` : undefined}
                pill={{ label: plural(row.open, 'open shift'), tone: 'amber' }}
                onPress={() => go(can.pharmacies ? `/organization/pharmacies/${row.id}` : shiftRoute(row.next?.shiftId ?? 0))}
              />
            ))}
            {gaps.length > short.length ? (
              <BlockNote text={`${plural(gaps.length - short.length, 'other pharmacy', 'other pharmacies')} have no open shifts.`} />
            ) : null}
          </Rows>
        )}
      </SectionCard> : null}

      {showInbox ? (
        <SectionCard title="Needs you" icon={<Inbox />} flush>
          {loading ? (
            <BlockLoading />
          ) : (
            <Rows>
              {can.roster && applicantTotal > 0 ? (
                <ItemRow
                  icon={<UserCheck />}
                  tone="violet"
                  label="Applicants"
                  detail={data!.applicants.length === 1 ? `${formatDay(data!.applicants[0].at.start, now)} at ${data!.applicants[0].at.pharmacyName}` : `Across ${data!.applicants.length} shifts`}
                  count={applicantTotal}
                  countLabel={plural(applicantTotal, 'applicant')}
                  onPress={() => go(data!.applicants.length === 1 ? shiftRoute(data!.applicants[0].at.shiftId) : '/organization/shifts')}
                />
              ) : null}
              {can.attendance && inbox?.attendance?.count ? (
                <ItemRow
                  icon={<Users />}
                  tone="cyan"
                  label="Attendance to approve"
                  detail={namesLine(inbox.attendance.names)}
                  count={inbox.attendance.count}
                  countLabel={plural(inbox.attendance.count, 'attendance record')}
                  onPress={() => go('/attendance/reviews')}
                />
              ) : null}
              {can.roster && inbox?.timesheets?.count ? (
                <ItemRow
                  icon={<ClipboardCheck />}
                  tone="blue"
                  label="Timesheets to review"
                  detail={namesLine(inbox.timesheets.names)}
                  count={inbox.timesheets.count}
                  countLabel={plural(inbox.timesheets.count, 'timesheet')}
                  onPress={() => go('/workforce-timesheets')}
                />
              ) : null}
              <QueueNote
                failed={Boolean(data?.queuesFailed || inbox?.failed)}
                empty={!(can.roster && applicantTotal) && !(can.attendance && inbox?.attendance?.count) && !(can.roster && inbox?.timesheets?.count)}
                onRetry={refresh}
              />
              {truncated ? (
                <BlockNote text={`Counts cover your first ${INBOX_PHARMACY_LIMIT} of ${pharmacyIds.length} pharmacies. Pick one pharmacy at the top to see its own.`} />
              ) : null}
            </Rows>
          )}
        </SectionCard>
      ) : null}

      <SectionCard
        title="Team"
        icon={<Users />}
        flush
        action={can.invite ? <ViewAllLink onPress={() => go('/organization/invite')}>Invite staff</ViewAllLink> : undefined}
      >
        {loading ? (
          <BlockLoading />
        ) : data?.members == null ? (
          <BlockNote text="Your team could not load." action="Try again" onAction={refresh} />
        ) : data.members.length === 0 ? (
          <BlockNote text="No one has joined your organization yet." action={can.invite ? 'Invite staff' : undefined} onAction={() => go('/organization/invite')} />
        ) : (
          <Rows>
            {data.members.slice(0, TEAM_ROWS).map((member) => (
              <PersonRow
                key={member.id}
                photoUrl={member.user?.profile_photo_url ?? member.user?.profile_photo}
                name={personName({ firstName: member.user?.first_name, lastName: member.user?.last_name, name: member.user?.email })}
                detail={roleWord(member.role) || 'Member'}
                onPress={can.invite ? () => go('/organization/invite') : undefined}
              />
            ))}
            {data.memberCount > TEAM_ROWS ? <BlockNote text={`${plural(data.memberCount - TEAM_ROWS, 'more person', 'more people')} in your organization.`} /> : null}
          </Rows>
        )}
      </SectionCard>
    </HomeScroll>
  );
}
