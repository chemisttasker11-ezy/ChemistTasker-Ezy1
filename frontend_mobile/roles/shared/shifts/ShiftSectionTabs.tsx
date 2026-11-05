import React, { useCallback, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarCheck, CircleCheck, Globe, History, Play, Users } from 'lucide-react-native';
import { SegmentTabs, type SegmentTab } from '@/components/ui';
import { pickShiftSection, SHIFT_SECTION_LABELS, type ShiftSection } from './shiftSurface';

const ICONS: Record<ShiftSection, ReactNode> = {
  public: <Globe />,
  community: <Users />,
  active: <Play />,
  confirmed: <CircleCheck />,
  history: <History />,
  roster: <CalendarCheck />,
};

/** The section on show, read from ?section= (notification and activity links land there) and kept valid. */
export function useShiftSection(sections: readonly ShiftSection[]) {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const value = pickShiftSection(sections, typeof section === 'string' ? section : null);
  // The route param is the one source: a later link to another section wins over the last tap, and back keeps it.
  const select = useCallback((next: ShiftSection) => router.setParams({ section: next }), [router]);
  return [value, select] as const;
}

export type ShiftSectionTabsProps = {
  sections: readonly ShiftSection[];
  value: ShiftSection;
  onChange: (section: ShiftSection) => void;
  /** Spoken name of the tab group. */
  label?: string;
  idPrefix?: string;
  style?: StyleProp<ViewStyle>;
};

/** Shift Centre / board section tabs (sections from shiftSections(surface)); pair with useShiftSection. */
export function ShiftSectionTabs({ sections, value, onChange, label = 'Shift sections', idPrefix = 'shift-sections', style }: ShiftSectionTabsProps) {
  const tabs: SegmentTab<ShiftSection>[] = sections.map((section) => ({
    value: section,
    label: SHIFT_SECTION_LABELS[section],
    icon: ICONS[section],
  }));
  if (tabs.length < 2) return null;
  return <SegmentTabs tabs={tabs} value={value} onChange={onChange} label={label} idPrefix={idPrefix} style={style} />;
}
