import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { CalendarDays, ClipboardCheck, CreditCard, Inbox, MailOpen, Plus, Store, UserCheck, UserRound, Users } from 'lucide-react-native';
import {
  fetchActiveShifts,
  fetchConfirmedShifts,
  fetchPharmaciesService,
  fetchShiftCounterOffersBatchService,
  fetchShiftInterests,
  fetchShiftOffersService,
  getOnboardingDetail,
  getPendingPharmacyAdminInvitations,
} from '@chemisttasker/shared-core';
import { ContentState, SectionCard, ViewAllLink } from '@/components/ui';
import { useScopedDashboard } from '@/roles/shared/dashboard/dashboardScope';
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
import {
  applicantCount,
  ownerStep,
  type StepKey,
  formatDay,
  hoursUntil,
  type Occurrence,
  openSlots,
  pharmacyGaps,
  pharmacyOf,
  plural,
  roleWord,
  type ShiftLike,
  slotStart,
  timeRange,
  weekCover,
} from '@/roles/shared/dashboard/managerHomeLogic';
import { ownerSetupPaths } from '@/utils/ownerSetup';

type Invitation = { id: number; pharmacy_name?: string };
type AwaitingOffer = {
  shift: number;
  offeredSlotDate?: string | null;
  offeredStartTime?: string | null;
  slotDetail?: { date?: string | null; startTime?: string | null } | null;
  shiftDetail?: ShiftLike | null;
};
type Applicants = { at: Occurrence; count: number };
type HomeData = {
  scopeKey: string;
  progress: number | null;
  invitations: Invitation[];
  awaiting: AwaitingOffer[];
  active: ShiftLike[] | null;
  confirmed: ShiftLike[] | null;
  pharmacies: Array<{ id: number; name: string; suburb?: string | null }> | null;
  applicants: Applicants[];
  queuesFailed: boolean;
  inbox: ManagerInbox;
};

const valueOf = <T,>(result: PromiseSettledResult<T>): T | null => (result.status === 'fulfilled' ? result.value : null);
const asList = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? value : Array.isArray((value as any)?.results) ? (value as any).results : [];
const WEEK_ROWS = 5;
/** How many upcoming shifts Home asks about applicants (one request each). */
const APPLICANT_SHIFTS = 5;

export default function OwnerDashboard() {
  const router = useRouter();
  const scope = useScopedDashboard('OWNER');
  const pharmacyId = scope.selectedPharmacyId;
  // Keyed by the ids, so a re-created but equal pharmacy list does not reload Home.
  const idsKey = scope.pharmacies.map((item) => item.id).join(',');
  const pharmacyIds = useMemo(() => (idsKey ? idsKey.split(',').map(Number) : []), [idsKey]);
  const scopeKey = `${scope.workspace}:${pharmacyId}:${idsKey}`;
  const [snapshot, setData] = useState<HomeData | null>(null);
  const data = !scope.isLoading && snapshot?.scopeKey === scopeKey ? snapshot : null;
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // Only the newest load may land, so a scope switch mid-load never shows the old pharmacy.
  const generation = useRef(0);
  const go = useCallback((route: string) => router.push(route as any), [router]);
  const { fetchDashboard, isLoading: scopeLoading } = scope;

  const load = useCallback(async () => {
    if (scopeLoading) return;
    const id = ++generation.current;
    const at = new Date();
    const [onboarding, invitations, awaiting, active, confirmed, pharmacies, inbox] = await Promise.allSettled([
      getOnboardingDetail('owner'),
      getPendingPharmacyAdminInvitations(),
      fetchShiftOffersService({ status: 'ACCEPTED_AWAITING_PAYMENT' }),
      fetchActiveShifts(),
      fetchConfirmedShifts(),
      fetchPharmaciesService({}),
      loadManagerInbox(pharmacyId != null ? [pharmacyId] : pharmacyIds, { attendance: true, timesheets: true }),
      fetchDashboard(),
    ]);
    const activeList = valueOf(active) as ShiftLike[] | null;
    const open = activeList ? openSlots(activeList, at, pharmacyId) : [];
    const soonest = [...new Map(open.map((row) => [row.shiftId, row])).values()].slice(0, APPLICANT_SHIFTS);
    let applicants: Applicants[] = [];
    let applicantsFailed = active.status === 'rejected';
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
    const offers = (valueOf(awaiting) ?? []) as AwaitingOffer[];
    setNow(at);
    setFailed([onboarding, active, confirmed, pharmacies].every((result) => result.status === 'rejected'));
    setData({
      scopeKey,
      progress: (valueOf(onboarding) as any)?.progress_percent ?? null,
      invitations: asList<Invitation>(valueOf(invitations)),
      awaiting: offers.filter((offer) => pharmacyId == null || (offer.shiftDetail != null && pharmacyOf(offer.shiftDetail).id === pharmacyId)),
      active: activeList,
      confirmed: valueOf(confirmed) as ShiftLike[] | null,
      pharmacies: valueOf(pharmacies) == null ? null : asList(valueOf(pharmacies)),
      applicants,
      queuesFailed: applicantsFailed || awaiting.status === 'rejected',
      inbox: valueOf(inbox) ?? FAILED_INBOX,
    });
  }, [fetchDashboard, pharmacyId, pharmacyIds, scopeLoading, scopeKey]);

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

  const open = useMemo(() => (data?.active ? openSlots(data.active, now, pharmacyId) : []), [data?.active, now, pharmacyId]);
  const cover = useMemo(() => (data?.confirmed ? weekCover(data.confirmed, now, 7, pharmacyId) : []), [data?.confirmed, now, pharmacyId]);
  const gaps = useMemo(
    () => (data?.pharmacies ? pharmacyGaps(data.pharmacies, data.active ? openSlots(data.active, now) : []) : []),
    [data?.active, data?.pharmacies, now],
  );

  const step = useMemo<NextStep | null>(() => {
    if (!data) return null;
    const invite = data.invitations[0];
    const offer = data.awaiting[0];
    const offerStart = offer
      ? slotStart(offer.offeredSlotDate ?? offer.slotDetail?.date, offer.offeredStartTime ?? offer.slotDetail?.startTime)
      : null;
    const applied = data.applicants[0];
    const gap = open[0] && hoursUntil(open[0].start, now) < 48 ? open[0] : null;
    const attendance = data.inbox.attendance;
    const key = ownerStep({
      setup: data.progress != null && data.progress < 100,
      invitations: Boolean(invite),
      payment: Boolean(offer),
      applicants: Boolean(applied),
      urgentGap: Boolean(gap),
      attendance: Boolean(attendance?.count),
      timesheets: Boolean(data.inbox.timesheets?.count),
    });
    const steps: Partial<Record<StepKey, () => NextStep | null>> = {
      setup: () => ({
        key: 'setup',
        title: 'Finish your owner profile',
        body: `Your profile is ${data.progress}% complete. A few more details and you are ready to post shifts.`,
        action: 'Finish profile',
        icon: <UserRound />,
        onPress: () => go(ownerSetupPaths.onboarding),
      }),
      invitations: () => ({
        key: 'invitations',
        title: data.invitations.length > 1 ? `${data.invitations.length} admin invitations` : `${invite.pharmacy_name || 'A pharmacy'} invited you`,
        body: data.invitations.length > 1 ? 'Pharmacies want you to help run them. Accept or decline each one.' : 'They want you as an admin. Accept or decline the invitation.',
        action: 'Review invitations',
        icon: <MailOpen />,
        onPress: () => go('/admin-invitations'),
      }),
      payment: () => ({
        key: 'payment',
        title: data.awaiting.length > 1 ? `${data.awaiting.length} bookings waiting for payment` : `Pay to confirm ${offerStart ? formatDay(offerStart, now) : 'your booking'}`,
        body: `A locum accepted${offer.shiftDetail?.pharmacyName ? ` at ${offer.shiftDetail.pharmacyName}` : ''}. The booking is confirmed once payment is verified.`,
        action: 'Review and pay',
        icon: <CreditCard />,
        onPress: () => go('/owner/shifts'),
      }),
      applicants: () => ({
        key: 'applicants',
        title: `${plural(applied.count, 'applicant')} for ${formatDay(applied.at.start, now)}`,
        body: [roleWord(applied.at.role), applied.at.pharmacyName].filter(Boolean).join(' at ') + `, ${timeRange(applied.at.startTime, applied.at.endTime)}.`,
        action: 'Review applicants',
        icon: <UserCheck />,
        onPress: () => go(`/owner/shifts/${applied.at.shiftId}/applications`),
      }),
      gap: () => ({
        key: 'gap',
        title: `${formatDay(gap!.start, now)} is not covered yet`,
        body: `${[roleWord(gap!.role), gap!.pharmacyName].filter(Boolean).join(' at ')}, ${timeRange(gap!.startTime, gap!.endTime)}. ${
          hoursUntil(gap!.start, now) <= 1 ? 'It starts within the hour.' : `It starts in ${Math.round(hoursUntil(gap!.start, now))} hours.`
        }`,
        action: 'Open shift',
        icon: <CalendarDays />,
        onPress: () => go(`/owner/shifts/${gap!.shiftId}`),
      }),
      attendance: () => attendanceStep(attendance, () => go('/attendance/reviews'), <Users />),
      timesheets: () => timesheetStep(data.inbox.timesheets, () => go('/workforce-timesheets'), <ClipboardCheck />),
      post: () => ({
        key: 'post',
        title: 'Need cover? Post a shift',
        body: 'Choose who sees it first: your team, your favourite locums, or the ChemistTasker platform.',
        action: 'Post a shift',
        icon: <Plus />,
        onPress: () => go('/owner/post-shift'),
      }),
    };
    return steps[key]?.() ?? null;
  }, [data, go, now, open]);

  if (failed && data) {
    return (
      <HomeScroll refreshing={refreshing} onRefresh={refresh}>
        <ContentState kind="error" title="Home could not load" description="Check your connection, then try again." onAction={refresh} />
      </HomeScroll>
    );
  }

  const loading = !data;
  const applicantTotal = data?.applicants.reduce((total, row) => total + row.count, 0) ?? 0;
  const inbox = data?.inbox;
  const multiPharmacy = pharmacyId == null && pharmacyIds.length > 1;

  return (
    <HomeScroll refreshing={refreshing} onRefresh={refresh}>
      <NextStepCard step={step} loading={loading} />

      <SectionCard
        title="This week"
        icon={<CalendarDays />}
        flush
        action={<ViewAllLink onPress={() => go('/manager/roster')}>Roster</ViewAllLink>}
      >
        {loading ? (
          <BlockLoading rows={3} />
        ) : data?.confirmed == null ? (
          <BlockNote text="Bookings could not load." action="Try again" onAction={refresh} />
        ) : cover.length === 0 ? (
          <BlockNote text="No one is booked in the next 7 days." action="Post a shift" onAction={() => go('/owner/post-shift')} />
        ) : (
          <Rows>
            {cover.slice(0, WEEK_ROWS).map((row) => (
              <PersonRow
                key={`${row.shiftId}-${row.date}-${row.name}`}
                name={row.name}
                photoUrl={row.photoUrl}
                tone="cyan"
                detail={`Covering ${formatDay(row.start, now)}, ${timeRange(row.startTime, row.endTime)}`}
                meta={multiPharmacy ? row.pharmacyName : undefined}
                onPress={() => go(`/owner/shifts/${row.shiftId}`)}
              />
            ))}
            {cover.length > WEEK_ROWS ? (
              <BlockNote text={`${plural(cover.length - WEEK_ROWS, 'more booking')} this week.`} action="See confirmed shifts" onAction={() => go('/owner/shifts')} />
            ) : null}
          </Rows>
        )}
      </SectionCard>

      <SectionCard title="Needs you" icon={<Inbox />} flush>
        {loading ? (
          <BlockLoading />
        ) : (
          <Rows>
            {applicantTotal > 0 ? (
              <ItemRow
                icon={<UserCheck />}
                tone="violet"
                label="Applicants"
                detail={data!.applicants.length === 1 ? `${formatDay(data!.applicants[0].at.start, now)} at ${data!.applicants[0].at.pharmacyName}` : `Across ${data!.applicants.length} shifts`}
                count={applicantTotal}
                countLabel={plural(applicantTotal, 'applicant')}
                onPress={() => go(data!.applicants.length === 1 ? `/owner/shifts/${data!.applicants[0].at.shiftId}/applications` : '/owner/shifts')}
              />
            ) : null}
            {data!.awaiting.length ? (
              <ItemRow
                icon={<CreditCard />}
                tone="magenta"
                label="Waiting for payment"
                detail="Confirmed once payment is verified"
                count={data!.awaiting.length}
                countLabel={plural(data!.awaiting.length, 'booking')}
                onPress={() => go('/owner/shifts')}
              />
            ) : null}
            {inbox?.attendance?.count ? (
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
            {inbox?.timesheets?.count ? (
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
              empty={!applicantTotal && !data!.awaiting.length && !inbox?.attendance?.count && !inbox?.timesheets?.count}
              onRetry={refresh}
            />
          </Rows>
        )}
      </SectionCard>

      <SectionCard
        title="Your pharmacies"
        icon={<Store />}
        flush
        action={<ViewAllLink onPress={() => go('/owner/pharmacies')}>All</ViewAllLink>}
      >
        {loading ? (
          <BlockLoading />
        ) : data?.pharmacies == null ? (
          <BlockNote text="Pharmacies could not load." action="Try again" onAction={refresh} />
        ) : gaps.length === 0 ? (
          <BlockNote text="Add your pharmacy to start posting shifts." action="Add a pharmacy" onAction={() => go('/owner/pharmacies/add')} />
        ) : (
          <Rows>
            {gaps.map((row) => (
              <ItemRow
                key={row.id}
                icon={<Store />}
                tone="blue"
                label={row.name}
                detail={row.next ? `Next gap ${formatDay(row.next.start, now)}, ${timeRange(row.next.startTime, row.next.endTime)}` : data.pharmacies!.find((item) => item.id === row.id)?.suburb ?? undefined}
                pill={data.active == null ? undefined : row.open ? { label: plural(row.open, 'open shift'), tone: 'amber' } : { label: 'No open shifts', tone: 'neutral' }}
                onPress={() => go(`/owner/pharmacies/${row.id}`)}
              />
            ))}
          </Rows>
        )}
      </SectionCard>
    </HomeScroll>
  );
}
