import { type Dispatch, type SetStateAction } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Chip, SegmentedButtons, Surface, Switch, Text } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { type ShiftEscalationPlan } from '@chemisttasker/shared-core';
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
        {hint ? <Text style={s.muted}>{hint}</Text> : null}
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
          <View accessibilityRole="radiogroup" style={{ gap: 8, marginTop: 12 }}>
            {allowedVis.map((tier, index) => {
              const on = initialAudience === tier;
              return (
                <Pressable key={tier} onPress={() => setInitialAudience(tier)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  accessibilityLabel={AUDIENCE[tier].label} style={[s.card, on && s.cardOn]}>
                  <View style={[s.badge, on && s.badgeOn]}>
                    {on ? <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" /> : <Text style={s.badgeText}>{index + 1}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>{AUDIENCE[tier].label}</Text>
                    <Text style={s.muted}>{AUDIENCE[tier].hint}</Text>
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
          <SegmentedButtons value={mode} onValueChange={value => chooseMode(value as Mode)} style={{ marginTop: 12 }}
            buttons={[{ value: 'auto', label: 'Automatic' }, { value: 'custom', label: 'Choose dates' }, { value: 'off', label: "Don't widen" }]} />
          {mode === 'auto' ? (
            <View style={s.chips}>
              <Text style={s.title}>Next group every</Text>
              {AUTO_STEPS.map(hours => (
                <Chip key={hours} selected={autoHours === hours} mode={autoHours === hours ? 'flat' : 'outlined'} onPress={() => applyAuto(hours)}>
                  {hours < 24 ? `${hours} hours` : hours === 24 ? '1 day' : `${hours / 24} days`}
                </Chip>
              ))}
            </View>
          ) : null}
          {mode !== 'off' ? (
            <View style={{ marginTop: 12 }}>
              {[allowedVis[startIdx], ...later].map((tier, index, all) => {
                const first = index === 0;
                const when = first ? '' : escalationDates[KEY[tier]] || '';
                return (
                  <View key={tier} style={s.stage}>
                    <View style={{ alignItems: 'center' }}>
                      <View style={[s.badge, (first || when) && s.badgeOn]}>
                        <Text style={[s.badgeText, (first || when) ? { color: '#FFFFFF' } : null]}>{index + 1}</Text>
                      </View>
                      {index < all.length - 1 ? <View style={s.line} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 14 }}>
                      <Text style={s.title}>{AUDIENCE[tier].label}</Text>
                      <Text style={s.muted}>{first ? 'As soon as you post' : when ? formatWhen(when) : 'Not scheduled'}</Text>
                      {!first && mode === 'custom' ? (
                        <Button mode="outlined" compact icon="calendar" style={{ alignSelf: 'flex-start', marginTop: 6 }}
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
          <View style={{ gap: 6, marginTop: 8 }}>
            {notify.map(item => switchRow(item.key, item.label, item.checked, item.set))}
            {canPostAnonymously ? switchRow('anon', 'Hide the pharmacy name', hideName, setHideName, 'Only the pharmacy suburb is shown.') : null}
          </View>
        </View>
      ) : null}
    </Surface>
  );
}

const s = StyleSheet.create({
  h2: { fontSize: 16, fontWeight: '700', color: '#06214A' },
  title: { fontSize: 15, fontWeight: '600', color: '#111827' },
  muted: { fontSize: 13, color: '#4B5563', marginTop: 2 },
  section: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  card: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  cardOn: { borderColor: '#3C18A8', backgroundColor: '#EFE9FD' },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF2F8' },
  badgeOn: { backgroundColor: '#5222B8' },
  badgeText: { fontSize: 13, fontWeight: '700', color: '#4B5563' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
  stage: { flexDirection: 'row', gap: 12 },
  line: { flex: 1, width: 2, minHeight: 20, backgroundColor: '#E5E7EB', marginVertical: 4 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 12 },
  rowOn: { backgroundColor: '#EFE9FD' },
});
