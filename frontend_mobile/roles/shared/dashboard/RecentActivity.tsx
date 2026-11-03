import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { History } from 'lucide-react-native';
import { ActivityList, type ActivityEntry, BottomSheet, SectionCard, ViewAllLink } from '@/components/ui';
import { space } from '@/constants/tokens';
import { useShell } from '@/components/shell';
import { activityRoute, type DashboardPayload } from './dashboardScope';
import { BlockLoading, BlockNote } from './ManagerHome';
import { canOpenManagerActivity, formatDay } from './managerHomeLogic';

const PREVIEW = 4;

function when(value: string | undefined, now: Date) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? formatDay(date, now) : value ?? null;
}

/**
 * The dashboard activity feed, moved from Home to More: the newest few rows, the rest in a sheet.
 * `load` is the persona's dashboard read; snapshots belong to one scope. Nothing renders without activity.
 */
export function RecentActivity({
  load,
  ready = true,
  scopeKey,
  persona,
  canRoster = true,
  canComms = true,
}: {
  load: () => Promise<DashboardPayload | null>;
  ready?: boolean;
  scopeKey: string;
  persona: 'owner' | 'organization' | 'admin';
  canRoster?: boolean;
  canComms?: boolean;
}) {
  // The layout's navigate keeps the guarded push and the admin pharmacy paths.
  const { navigate } = useShell();
  const [snapshot, setSnapshot] = useState<{ scopeKey: string; activity: NonNullable<DashboardPayload['activity']> } | null>(null);
  const activity = ready && snapshot?.scopeKey === scopeKey ? snapshot.activity : null;
  const [failedScope, setFailedScope] = useState<string | null>(null);
  const failed = ready && failedScope === scopeKey;
  const [sheetOpen, setSheetOpen] = useState(false);
  const generation = useRef(0);

  const fetchActivity = useCallback(async () => {
    if (!ready) return;
    const id = ++generation.current;
    setFailedScope(null);
    try {
      const payload = await load();
      if (id !== generation.current) return;
      setSnapshot({ scopeKey, activity: payload?.activity ?? [] });
    } catch {
      if (id === generation.current) setFailedScope(scopeKey);
    }
  }, [load, ready, scopeKey]);

  useEffect(() => {
    void fetchActivity();
    setSheetOpen(false);
    return () => { generation.current += 1; };
  }, [fetchActivity]);

  // Resolve actions at render time so loaded rows use the current permissions and navigator.
  const entries: ActivityEntry[] | null = activity?.map((item) => {
    const route = activityRoute(item, persona);
    return {
      title: item.title || item.message || 'Activity',
      description: item.description ?? null,
      time: when(item.created_at || item.timestamp || item.time, new Date()),
      onOpen: route && canOpenManagerActivity(route, { roster: canRoster, comms: canComms })
        ? () => { setSheetOpen(false); navigate(route); } : null,
    };
  }) ?? null;

  if (entries?.length === 0 && !failed) return null;

  return (
    <SectionCard
      title="Recent activity"
      icon={<History />}
      flush
      dense
      action={entries && entries.length > PREVIEW ? <ViewAllLink onPress={() => setSheetOpen(true)}>View all</ViewAllLink> : undefined}
    >
      {failed ? (
        <BlockNote dense text="Activity could not load." action="Try again" onAction={() => void fetchActivity()} />
      ) : entries == null ? (
        <BlockLoading dense rows={2} />
      ) : (
        <View style={styles.list}>
          <ActivityList entries={entries.slice(0, PREVIEW)} />
        </View>
      )}
      <BottomSheet open={sheetOpen && entries != null} onClose={() => setSheetOpen(false)} title="Recent activity">
        <ActivityList entries={entries ?? []} />
      </BottomSheet>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.sm },
});
