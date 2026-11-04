import { type Dispatch, type SetStateAction } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Chip, SegmentedButtons, Surface, Switch, Text } from 'react-native-paper';
import { Check } from 'lucide-react-native';
import { type ShiftEscalationPlan } from '@chemisttasker/shared-core';
import { colors, radius, space, touch, type } from '@/constants/tokens';
import { type VisibilityDates, type VisibilityTier } from './PostShiftScreen.helpers';
import { styles } from './PostShiftScreen.styles';

type Setter<T> = Dispatch<SetStateAction<T>>;

type EscalationPickerState = {
  key: keyof VisibilityDates | null;
  open: boolean;
};

type Props = {
  escalationPlan: ShiftEscalationPlan;
  setEscalationPlan: Setter<ShiftEscalationPlan>;
  isEmbedded: boolean;
  canPostAnonymously: boolean;
  hideName: boolean;
  setHideName: Setter<boolean>;
  allowedVis: VisibilityTier[];
  initialAudience: string;
  setInitialAudience: Setter<string>;
  notifyPharmacyStaff: boolean;
  setNotifyPharmacyStaff: Setter<boolean>;
  notifyFavoriteStaff: boolean;
  setNotifyFavoriteStaff: Setter<boolean>;
  notifyChainMembers: boolean;
  showNotifyChainMembers: boolean;
  setNotifyChainMembers: Setter<boolean>;
  escalationDates: VisibilityDates;
  setEscalationDates: Setter<VisibilityDates>;
  setEscalationPicker: Setter<EscalationPickerState>;
};

/** Same plain names as the web step, widest last. */
const AUDIENCE: Record<VisibilityTier, { label: string; hint: string }> = {
  FULL_PART_TIME: { label: 'Your pharmacy team', hint: 'Full-time and part-time staff at this pharmacy.' },
  LOCUM_CASUAL: { label: 'Your favourite staff', hint: 'Locums and casuals you have marked as favourites.' },
  OWNER_CHAIN: { label: 'Your other pharmacies', hint: 'Staff across the pharmacies you own.' },
  ORG_CHAIN: { label: 'Your organisation', hint: 'Everyone in your organisation.' },
  PLATFORM: { label: 'Everyone on ChemistTasker', hint: 'All matching people on the platform.' },
};
const KEY: Record<string, keyof VisibilityDates> = {
  LOCUM_CASUAL: 'locum_casual', OWNER_CHAIN: 'owner_chain', ORG_CHAIN: 'org_chain', PLATFORM: 'platform',
};
const AUTO_STEPS = [12, 24, 48];
type Mode = 'auto' | 'custom' | 'off';

const formatWhen = (value: string) => {
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: value.length > 10 ? 'numeric' : undefined, minute: value.length > 10 ? '2-digit' : undefined });
};

export default function PostShiftVisibilityStep({
  isEmbedded, canPostAnonymously, hideName, setHideName, allowedVis, initialAudience, setInitialAudience,
  notifyPharmacyStaff, setNotifyPharmacyStaff, notifyFavoriteStaff, setNotifyFavoriteStaff, notifyChainMembers,
  setNotifyChainMembers, showNotifyChainMembers, escalationDates, setEscalationDates, setEscalationPicker,
  escalationPlan, setEscalationPlan,
}: Props) {
  const startIdx = allowedVis.indexOf(initialAudience as VisibilityTier);
  const later = startIdx > -1 ? allowedVis.slice(startIdx + 1) : [];
  const { mode, everyHours: autoHours } = escalationPlan;

  const applyAuto = (hours: number) => {
    setEscalationPlan(current => ({ ...current, everyHours: hours }));
  };
  const chooseMode = (next: Mode) => {
    setEscalationPlan(current => ({ ...current, mode: next }));
    if (next === 'off') setEscalationDates({});
    if (next === 'auto') applyAuto(autoHours);
  };

  const notify = [
    { key: 'pharmacy', visible: initialAudience !== 'FULL_PART_TIME', checked: notifyPharmacyStaff, label: 'Email and notify your pharmacy team', set: setNotifyPharmacyStaff },
    { key: 'favourites', visible: ['LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM'].includes(initialAudience), checked: notifyFavoriteStaff, label: 'Email and notify your favourite staff', set: setNotifyFavoriteStaff },
    { key: 'chain', visible: showNotifyChainMembers, checked: notifyChainMembers, label: 'Email and notify your chain members', set: setNotifyChainMembers },
  ].filter(item => item.visible);

  const switchRow = (key: string, label: string, checked: boolean, set: Setter<boolean>, hint?: string) => (
    <Pressable key={key} onPress={() => set(value => !value)} accessibilityRole="switch" accessibilityState={{ checked }} style={[s.row, checked && s.rowOn]}>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{label}</Text>
        {hint ? <Text style={[s.muted, checked && s.mutedOn]}>{hint}</Text> : null}
      </View>
      <Switch value={checked} onValueChange={value => set(value)} />
    </Pressable>
  );

  return (
    <Surface style={styles.card} elevation={1}>
      {isEmbedded ? (
        <>
          <Text style={s.h2}>Private booking</Text>
          <Text style={s.muted}>Only the person you are booking sees this shift. They can accept or decline it.</Text>
        </>
      ) : (
        <>
          <Text style={s.h2}>Who sees it first?</Text>
          <Text style={s.muted}>Start small if you like; you can open it to more people later.</Text>
          <View accessibilityRole="radiogroup" style={{ gap: space.xs, marginTop: space.sm }}>
            {allowedVis.map((tier, index) => {
              const on = initialAudience === tier;
              return (
                <Pressable key={tier} onPress={() => { if (tier !== initialAudience) setInitialAudience(tier); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  accessibilityLabel={AUDIENCE[tier].label} style={[s.card, on && s.cardOn]}>
                  <View style={[s.badge, on && s.badgeOn]}>
                    {on ? <Check size={16} color={colors.surfaceBg} strokeWidth={2.5} /> : <Text style={s.badgeText}>{index + 1}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>{AUDIENCE[tier].label}</Text>
                    <Text style={[s.muted, on && s.mutedOn]}>{AUDIENCE[tier].hint}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {!isEmbedded && later.length > 0 ? (
        <View style={s.section}>
          <Text style={s.h2}>Still not filled? Open it up later</Text>
          <Text style={s.muted}>The audience widens one group at a time, and only while nobody has shown interest.</Text>
          <SegmentedButtons value={mode} onValueChange={value => { if (value !== mode) chooseMode(value as Mode); }} style={{ marginTop: space.sm, minHeight: touch.min }}
            buttons={[
              {
                value: 'auto',
                label: 'Automatic',
                style: { minHeight: touch.min },
                labelStyle: { minHeight: touch.min, textAlignVertical: 'center', lineHeight: touch.min },
              },
              {
                value: 'custom',
                label: 'Choose dates',
                style: { minHeight: touch.min },
                labelStyle: { minHeight: touch.min, textAlignVertical: 'center', lineHeight: touch.min },
              },
              {
                value: 'off',
                label: "Don't widen",
                style: { minHeight: touch.min },
                labelStyle: { minHeight: touch.min, textAlignVertical: 'center', lineHeight: touch.min },
              },
            ]} />
          {mode === 'auto' ? (
            <View style={s.chips}>
              <Text style={s.title}>Next group every</Text>
              {AUTO_STEPS.map(hours => (
                <Chip key={hours} selected={autoHours === hours} mode={autoHours === hours ? 'flat' : 'outlined'} onPress={() => { if (hours !== autoHours) applyAuto(hours); }}>
                  {hours < 24 ? `${hours} hours` : hours === 24 ? '1 day' : `${hours / 24} days`}
                </Chip>
              ))}
            </View>
          ) : null}
          {mode !== 'off' ? (
            <View style={{ marginTop: space.sm }}>
              {[allowedVis[startIdx], ...later].map((tier, index, all) => {
                const first = index === 0;
                const when = first ? '' : escalationDates[KEY[tier]] || '';
                return (
                  <View key={tier} style={s.stage}>
                    <View style={{ alignItems: 'center' }}>
                      <View style={[s.badge, (first || when) && s.badgeOn]}>
                        <Text style={[s.badgeText, (first || when) ? { color: colors.surfaceBg } : null]}>{index + 1}</Text>
                      </View>
                      {index < all.length - 1 ? <View style={s.line} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: space.md }}>
                      <Text style={s.title}>{AUDIENCE[tier].label}</Text>
                      <Text style={s.muted}>{first ? 'As soon as you post' : when ? formatWhen(when) : 'Not scheduled'}</Text>
                      {!first && mode === 'custom' ? (
                        <Button mode="outlined" compact icon="calendar" style={{ alignSelf: 'flex-start', marginTop: space.xxs }}
                          contentStyle={{ minHeight: touch.min }}
                          onPress={() => setEscalationPicker({ key: KEY[tier], open: true })}>
                          {when ? 'Change date' : 'Pick a date'}
                        </Button>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {!isEmbedded && (notify.length > 0 || canPostAnonymously) ? (
        <View style={s.section}>
          <Text style={s.h2}>When it goes live</Text>
          <View style={{ gap: space.xxs, marginTop: space.xs }}>
            {notify.map(item => switchRow(item.key, item.label, item.checked, item.set))}
            {canPostAnonymously ? switchRow('anon', 'Hide the pharmacy name', hideName, setHideName, 'Only the pharmacy suburb is shown.') : null}
          </View>
        </View>
      ) : null}
    </Surface>
  );
}

const s = StyleSheet.create({
  h2: { fontSize: type.labelLarge.fontSize, fontWeight: '700', color: colors.textPrimary },
  title: { fontSize: type.bodyMedium.fontSize, fontWeight: '600', color: colors.textPrimary },
  muted: { fontSize: type.bodySmall.fontSize, color: colors.textSecondary, marginTop: space.xxs },
  mutedOn: { color: colors.tone.violet.fg },
  section: { marginTop: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border },
  card: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.control, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceBg },
  cardOn: { borderColor: colors.primary, backgroundColor: colors.tone.violet.bg },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.subtleBg },
  badgeOn: { backgroundColor: colors.primary },
  badgeText: { fontSize: type.labelSmall.fontSize, fontWeight: '700', color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs, marginTop: space.sm },
  stage: { flexDirection: 'row', gap: space.md },
  line: { flex: 1, width: 2, minHeight: 20, backgroundColor: colors.border, marginVertical: space.xxs },
  row: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, borderRadius: radius.control },
  rowOn: { backgroundColor: colors.tone.violet.bg },
});
