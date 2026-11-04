import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarCheck, ChevronRight } from 'lucide-react-native';
import { ContentState, IconTile, ScalePressable, tabPanelProps } from '@/components/ui';
import { colors, font, radius, space, type } from '@/constants/tokens';
import ActiveShiftsView from './ActiveShiftsPage';
import CommunityShiftsView from './CommunityShiftsView';
import ConfirmedShiftsView from './ConfirmedShiftsView';
import HistoryShiftsView from './HistoryShiftsView';
import PublicShiftsView from './PublicShiftsView';
import WorkerConfirmedShiftsView from './WorkerConfirmedShiftsView';
import WorkerHistoryShiftsView from './WorkerHistoryShiftsView';
import { ShiftSectionTabs, useShiftSection } from './ShiftSectionTabs';
import { isWorkerPersona, shiftSections, type ShiftSection } from './shiftSurface';
import { incomingBoardTab, shiftSectionSubtitle, shownShiftSection, workerInvoiceRoute, workerRosterRoute } from './shiftsScreenLogic';
import { useShiftSurface } from './useShiftSurface';

const ID_PREFIX = 'shift-centre';

/**
 * The Shifts tab for all six personas, from one policy (useShiftSurface): posters get the Shift Centre
 * (Active, Confirmed, History); pharmacists and other staff get their workspace's board (Community or
 * Public) with Confirmed and History; explorers get Public, Community, Confirmed and History.
 * The section comes from ?section= (links land there); ?tab=accepted opens the board on Offers.
 */
export default function ShiftsScreen() {
  const surface = useShiftSurface();
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const sections = useMemo(() => shiftSections(surface), [surface]);
  const [requested] = useShiftSection(sections);
  const tabParam = typeof tab === 'string' ? tab : null;
  const section = shownShiftSection(requested, sections, surface.workspace, tabParam);
  const worker = isWorkerPersona(surface.persona);
  const rosterRoute = workerRosterRoute(surface);
  const boardTab = incomingBoardTab(tabParam);

  // A tab tap drops the one-time ?tab= so coming back to the board does not reopen Offers.
  const select = (next: ShiftSection) => router.setParams({ section: next, tab: undefined });

  if (!surface.ready) return <ContentState kind="loading" style={styles.state} />;
  if (!section) return <ContentState kind="forbidden" style={styles.state} />;

  const panel = (key: ShiftSection) => {
    switch (key) {
      case 'public':
        return <PublicShiftsView activeTabOverride={boardTab} />;
      case 'community':
        return <CommunityShiftsView activeTabOverride={boardTab} />;
      case 'active':
        return <ActiveShiftsView />;
      case 'confirmed':
        return worker ? <WorkerConfirmedShiftsView /> : <ConfirmedShiftsView />;
      case 'history':
        return worker ? <WorkerHistoryShiftsView invoiceRoute={workerInvoiceRoute(surface.persona)} /> : <HistoryShiftsView />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <ShiftSectionTabs sections={sections} value={section} onChange={select} label="Shift Centre sections" idPrefix={ID_PREFIX} />
        <Text style={styles.subtitle}>{shiftSectionSubtitle(section, surface.persona)}</Text>
        {rosterRoute ? (
          <ScalePressable
            static
            pressBg
            onPress={() => router.push(rosterRoute as any)}
            accessibilityRole="link"
            accessibilityLabel="My roster. Your rostered shifts, cover and swap requests"
            style={styles.rosterLink}
          >
            <IconTile icon={<CalendarCheck />} tone="violet" size={36} />
            <View style={styles.rosterCopy}>
              <Text style={styles.rosterTitle}>My roster</Text>
              <Text style={styles.rosterDetail} numberOfLines={1}>Your rostered shifts, cover and swap requests</Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
          </ScalePressable>
        ) : null}
      </View>
      {/* Keyed by scope: a workspace or pharmacy switch never shows the old scope's list. */}
      <View key={`${surface.scopeKey}:${section}`} style={styles.content} {...tabPanelProps(ID_PREFIX, section)}>
        {panel(section)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  state: { margin: space.lg },
  top: { gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  content: { flex: 1 },
  rosterLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
    borderRadius: radius.nested,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBg,
  },
  rosterCopy: { flex: 1, minWidth: 0 },
  rosterTitle: { color: colors.textPrimary, fontFamily: font.inter.semiBold, fontSize: type.labelLarge.fontSize, lineHeight: type.labelLarge.lineHeight },
  rosterDetail: { color: colors.textSecondary, fontFamily: font.inter.regular, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight },
});
