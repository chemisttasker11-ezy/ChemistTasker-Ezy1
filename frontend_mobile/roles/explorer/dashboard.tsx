import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Briefcase, CalendarCheck, Heart, Megaphone, Search, ShieldCheck, Sparkles, Store, UserRound } from 'lucide-react-native';
import { fetchCommunityShifts, fetchPublicShifts, getExplorerDashboard, getExplorerPosts, getOnboardingDetail } from '@chemisttasker/shared-core';
import { ContentState, SectionCard, ViewAllLink } from '@/components/ui';
import getShiftPharmacyName from '@/roles/shared/shifts/utils/getShiftPharmacyName';
import { BlockLoading, BlockNote, HomeScroll, ItemRow, type NextStep, NextStepCard, Rows } from '@/roles/shared/dashboard/ManagerHome';
import { formatDay, roleWord, slotStart, timeRange } from '@/roles/shared/dashboard/managerHomeLogic';
import { explorerStep, type ExplorerStepKey } from '@/roles/shared/dashboard/workerHomeLogic';
import { explorerDashboardFacts, explorerShiftDisplay, type ExplorerDashboardFacts } from './explorerHomeModel';

type ShiftRow = {
  id: number;
  roleNeeded?: string | null;
  slots?: Array<{ date?: string | null; startTime?: string | null; endTime?: string | null }> | null;
};
type Post = { id: number; headline?: string | null; roleTitle?: string | null; role_title?: string | null };
type HomeData = {
  dashboard: ExplorerDashboardFacts | null;
  progress: number | null;
  interests: number | null;
  /** Public and community shifts, null when both boards failed. */
  shifts: ShiftRow[] | null;
  shiftsPartial: boolean;
  posts: Post[] | null;
};

const valueOf = <T,>(result: PromiseSettledResult<T>): T | null => (result.status === 'fulfilled' ? result.value : null);
const asList = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? value : Array.isArray((value as any)?.results) ? (value as any).results : [];
const ROWS = 4;

/** The shift's next slot that has not started, so a board row says when, not just where. */
function nextSlot(shift: ShiftRow, now: Date) {
  return (shift.slots ?? [])
    .map((slot) => ({ slot, start: slotStart(slot.date, slot.startTime) }))
    .filter((row): row is { slot: NonNullable<ShiftRow['slots']>[number]; start: Date } => row.start != null && row.start > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null;
}

/** Explorer Home: finish the profile and pick interests, then shifts open to explorers and their Talent Board posts. */
export default function ExplorerOverviewScreen() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const generation = useRef(0);
  const go = useCallback((route: string) => router.push(route as any), [router]);

  const load = useCallback(async () => {
    const id = ++generation.current;
    const [onboarding, publicShifts, communityShifts, posts, dashboard] = await Promise.allSettled([
      getOnboardingDetail('explorer'),
      fetchPublicShifts({}),
      fetchCommunityShifts({}),
      getExplorerPosts({ mine: true }),
      getExplorerDashboard(),
    ]);
    if (id !== generation.current) return;
    const profile = valueOf(onboarding) as any;
    const boards = [publicShifts, communityShifts].filter((result) => result.status === 'fulfilled');
    setNow(new Date());
    setFailed([onboarding, publicShifts, communityShifts, posts, dashboard].every((result) => result.status === 'rejected'));
    setData({
      dashboard: dashboard.status === 'fulfilled' ? explorerDashboardFacts(dashboard.value) : null,
      progress: profile?.progress_percent ?? null,
      interests: profile ? (Array.isArray(profile.interests) ? profile.interests.length : 0) : null,
      // A shift on both boards shows once.
      shifts: boards.length
        ? [...new Map(boards.flatMap((result) => asList<ShiftRow>((valueOf(result) as any)?.results)).map((shift) => [shift.id, shift])).values()]
        : null,
      shiftsPartial: boards.length === 1,
      posts: posts.status === 'fulfilled' ? asList<Post>(posts.value) : null,
    });
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const upcoming = useMemo(
    () =>
      (data?.shifts ?? [])
        .map((shift) => ({ shift, next: nextSlot(shift, now) }))
        .filter((row) => row.next != null)
        .sort((a, b) => a.next!.start.getTime() - b.next!.start.getTime()),
    [data?.shifts, now],
  );

  const step = useMemo<NextStep | null>(() => {
    if (!data) return null;
    const key = explorerStep({
      onboardingFailed: data.progress == null || data.interests == null,
      postsFailed: data.posts == null,
      profile: data.progress != null && data.progress < 100,
      interests: data.interests === 0,
      noPost: data.posts != null && data.posts.length === 0,
    });
    const steps: Record<ExplorerStepKey, () => NextStep> = {
      retry: () => ({
        key: 'retry',
        title: 'Your next step could not load',
        body: 'Check your connection, then try again.',
        action: 'Try again',
        icon: <UserRound />,
        onPress: refresh,
      }),
      profile: () => ({
        key: 'profile',
        title: 'Finish your profile',
        body: `It is ${data.progress}% complete. Pharmacies look at your profile before they reply.`,
        action: 'Finish profile',
        icon: <UserRound />,
        onPress: () => go('/explorer/profile'),
      }),
      interests: () => ({
        key: 'interests',
        title: 'What are you looking for?',
        body: 'Pick shadowing, placements, volunteering or junior roles, so pharmacies know what to offer you.',
        action: 'Pick interests',
        icon: <Heart />,
        onPress: () => go('/explorer/profile-interests'),
      }),
      talent: () => ({
        key: 'talent',
        title: 'Get seen by pharmacies',
        body: 'Pharmacies browse the Talent Board for new people. Post what you are looking for.',
        action: 'Post on the Talent Board',
        icon: <Megaphone />,
        onPress: () => go('/explorer/talent-board?compose=1'),
      }),
      shifts: () => ({
        key: 'shifts',
        title: 'Find your next shift',
        body: 'Shifts open to explorers from pharmacies on ChemistTasker and your community.',
        action: 'Browse shifts',
        icon: <Search />,
        onPress: () => go('/explorer/shifts'),
      }),
    };
    return steps[key]();
  }, [data, go, refresh]);

  if (failed && data) {
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

      <SectionCard title="Quick actions" icon={<Heart />} flush>
        <Rows>
          <ItemRow icon={<UserRound />} tone="violet" label="My pharmacy profile" detail="Keep your contact details and experience up to date" onPress={() => go('/explorer/profile')} />
          <ItemRow icon={<CalendarCheck />} tone="blue" label="My availability" detail="Choose when you can take part in opportunities" onPress={() => go('/explorer/availability')} />
          <ItemRow icon={<Megaphone />} tone="violet" label="Create or edit my Talent Board post" detail="Let pharmacies know what you are looking for" onPress={() => go('/explorer/talent-board?compose=1')} />
          <ItemRow icon={<Sparkles />} tone="blue" label="Learning resources" detail="Discover pharmacy learning and guidance" onPress={() => go('/explorer/learning')} />
        </Rows>
      </SectionCard>

      <SectionCard title="Recommended for you" icon={<Sparkles />} flush action={<ViewAllLink onPress={() => go('/explorer/shifts')}>Find more</ViewAllLink>}>
        {loading ? <BlockLoading rows={2} /> : data?.dashboard == null
          ? <BlockNote text="Personalized matches could not load. You can still browse open opportunities." action="Try again" onAction={refresh} />
          : data.dashboard.recommended.length === 0
            ? <BlockNote text="No availability-matched opportunities yet. Add your availability and travel preferences to improve matching." action="Set availability" onAction={() => go('/explorer/availability')} />
            : <Rows>{data.dashboard.recommended.slice(0, ROWS).map(shift => {
                const display = explorerShiftDisplay(shift);
                return <ItemRow key={shift.id} icon={<Store />} tone="violet" label={display.label} detail={display.detail} onPress={() => go(`/explorer/shifts/${shift.id}`)} />;
              })}</Rows>}
      </SectionCard>

      <SectionCard title="Your shift activity" icon={<Briefcase />} flush action={<ViewAllLink onPress={() => go('/explorer/shifts')}>View shifts</ViewAllLink>}>
        {loading ? <BlockLoading rows={2} /> : data?.dashboard == null
          ? <BlockNote text="Your shift activity could not load. Nothing has been assumed about your bookings." action="Try again" onAction={refresh} />
          : <>
              <Rows>
                <ItemRow icon={<CalendarCheck />} tone="blue" label="Upcoming this week" detail="Shift commitments from your dashboard" count={data.dashboard.upcomingWeek} onPress={() => go('/explorer/shifts')} />
                <ItemRow icon={<ShieldCheck />} tone="violet" label="Confirmed shifts" detail="Booked work" count={data.dashboard.committedCount} onPress={() => go('/explorer/shifts')} />
              </Rows>
              {data.dashboard.commitments.length > 0 ? <Rows>{data.dashboard.commitments.slice(0, ROWS).map(shift => {
                const display = explorerShiftDisplay(shift);
                return <ItemRow key={shift.id} icon={<Store />} tone="blue" label={display.label} detail={display.detail} onPress={() => go(`/explorer/shifts/${shift.id}`)} />;
              })}</Rows> : <BlockNote text="No personal shift activity yet. Browse opportunities to get started." action="Browse shifts" onAction={() => go('/explorer/shifts')} />}
            </>}
      </SectionCard>

      <SectionCard title="Open opportunities" icon={<Search />} flush action={<ViewAllLink onPress={() => go('/explorer/shifts')}>All shifts</ViewAllLink>}>
        {loading ? (
          <BlockLoading rows={3} />
        ) : data?.shifts == null ? (
          <BlockNote text="Shifts could not load." action="Try again" onAction={refresh} />
        ) : upcoming.length === 0 && !data.shiftsPartial ? (
          <BlockNote text="No open opportunities on the loaded boards right now." action="Set availability" onAction={() => go('/explorer/availability')} />
        ) : (
          <Rows>
            {data.shiftsPartial ? <BlockNote text="Some shifts could not load. Showing shifts from the board that loaded." action="Try again" onAction={refresh} /> : null}
            {upcoming.slice(0, ROWS).map(({ shift, next }) => (
              <ItemRow
                key={shift.id}
                icon={<Store />}
                tone="blue"
                label={getShiftPharmacyName(shift)}
                detail={[roleWord(shift.roleNeeded), `${formatDay(next!.start, now)} ${timeRange(next!.slot.startTime, next!.slot.endTime)}`.trim()].filter(Boolean).join(', ')}
                onPress={() => go(`/explorer/shifts/${shift.id}`)}
              />
            ))}
          </Rows>
        )}
      </SectionCard>

      <SectionCard title="Your Talent Board posts" icon={<Sparkles />} flush action={<ViewAllLink onPress={() => go('/explorer/talent-board')}>Talent Board</ViewAllLink>}>
        {loading ? (
          <BlockLoading rows={1} />
        ) : data?.posts == null ? (
          <BlockNote text="Your posts could not load." action="Try again" onAction={refresh} />
        ) : data.posts.length === 0 ? (
          <BlockNote text="You have not posted yet. A short post tells pharmacies what you want to learn." action="Write a post" onAction={() => go('/explorer/talent-board?compose=1')} />
        ) : (
          <Rows>
            {data.posts.slice(0, ROWS).map((post) => (
              <ItemRow
                key={post.id}
                icon={<Megaphone />}
                tone="violet"
                label={post.headline || 'Talent Board post'}
                detail={post.roleTitle || post.role_title || undefined}
                onPress={() => go('/explorer/talent-board')}
              />
            ))}
          </Rows>
        )}
      </SectionCard>
    </HomeScroll>
  );
}
