import React, { memo, type ReactNode } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Bell, CalendarDays, MessageSquareText, ReceiptText, ShieldCheck, Users } from 'lucide-react-native';
import { colors, font, radius, space, touch } from '@/constants/tokens';
import { IconTile } from './IconTile';
import { ScalePressable } from './ScalePressable';
import type { Tone } from './tone';

export type ActivityEntry = {
  title: string;
  description?: string | null;
  time?: string | null;
  kind?: string | null;
  onOpen?: (() => void) | null;
};

export type ActivityListProps = { entries: ActivityEntry[]; style?: StyleProp<ViewStyle> };

// Activity kinds from the dashboard read model, mapped to tile tones (same table as web).
const kindStyle: Record<string, { icon: ReactNode; tone: Tone }> = {
  shift: { icon: <CalendarDays />, tone: 'violet' },
  assignment: { icon: <ShieldCheck />, tone: 'cyan' },
  confirmed: { icon: <ShieldCheck />, tone: 'cyan' },
  hub: { icon: <MessageSquareText />, tone: 'blue' },
  invoice: { icon: <ReceiptText />, tone: 'magenta' },
  membership: { icon: <Users />, tone: 'blue' },
};
const fallback = { icon: <Bell />, tone: 'violet' as Tone };

function styleFor(kind?: string | null) {
  const key = String(kind ?? '').toLowerCase();
  const match = Object.keys(kindStyle).find((name) => key.includes(name));
  return match ? kindStyle[match] : fallback;
}

/** Recent activity rows: 32pt tone tile, Inter 600 title, muted detail, time on the right. */
export const ActivityList = memo(function ActivityList({ entries, style }: ActivityListProps) {
  return (
    <View style={style}>
      {entries.map((entry, index) => {
        const { icon, tone } = styleFor(entry.kind ?? entry.title);
        const spoken = [entry.title, entry.description, entry.time].filter(Boolean).join(', ');
        const body = (
          <>
            <IconTile icon={icon} tone={tone} size={32} />
            <View style={styles.text}>
              <Text style={styles.title}>{entry.title}</Text>
              {entry.description ? <Text style={styles.description}>{entry.description}</Text> : null}
            </View>
            {entry.time ? (
              <Text numberOfLines={1} style={styles.time}>
                {entry.time}
              </Text>
            ) : null}
          </>
        );
        return (
          <View key={`${index}-${entry.title}`} style={index > 0 ? styles.divider : null}>
            {entry.onOpen ? (
              <ScalePressable
                static
                pressBg
                onPress={entry.onOpen}
                accessibilityLabel={spoken}
                style={[styles.row, styles.pressable]}
              >
                {body}
              </ScalePressable>
            ) : (
              <View accessible accessibilityLabel={spoken} style={styles.row}>
                {body}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    minHeight: touch.min,
    paddingVertical: space.md,
  },
  // The press tint bleeds 8pt past the text so it never touches the glyphs; content stays on the card grid.
  pressable: { marginHorizontal: -space.sm, paddingHorizontal: space.sm, borderRadius: radius.tileSm },
  text: { flex: 1, minWidth: 0 },
  title: { color: colors.textPrimary, fontFamily: font.inter.semiBold, fontSize: 13, lineHeight: 18 },
  description: {
    marginTop: space.xxs,
    color: colors.textMuted,
    fontFamily: font.inter.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  time: { flexShrink: 0, color: colors.textMuted, fontFamily: font.inter.medium, fontSize: 11, lineHeight: 18 },
});
