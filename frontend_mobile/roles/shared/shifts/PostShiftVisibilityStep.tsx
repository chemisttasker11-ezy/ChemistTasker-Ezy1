import type { Dispatch, SetStateAction } from 'react';
import { TouchableOpacity, View } from 'react-native';
import {
  Checkbox,
  Chip,
  IconButton,
  Menu,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';
import {
  VISIBILITY_LABELS,
  VISIBILITY_META,
  formatDateLabel,
  type VisibilityDates,
  type VisibilityTier,
} from './PostShiftScreen.helpers';
import { styles } from './PostShiftScreen.styles';

type Setter<T> = Dispatch<SetStateAction<T>>;

type EscalationPickerState = {
  key: keyof VisibilityDates | null;
  open: boolean;
};

type Props = {
  isEmbedded: boolean;
  canPostAnonymously: boolean;
  hideName: boolean;
  setHideName: Setter<boolean>;
  allowedVis: VisibilityTier[];
  initialAudience: VisibilityTier;
  setInitialAudience: Setter<VisibilityTier>;
  audienceMenuVisible: boolean;
  setAudienceMenuVisible: Setter<boolean>;
  notifyPharmacyStaff: boolean;
  setNotifyPharmacyStaff: Setter<boolean>;
  notifyFavoriteStaff: boolean;
  setNotifyFavoriteStaff: Setter<boolean>;
  notifyChainMembers: boolean;
  setNotifyChainMembers: Setter<boolean>;
  escalationDates: VisibilityDates;
  setEscalationPicker: Setter<EscalationPickerState>;
};

export default function PostShiftVisibilityStep({
  isEmbedded,
  canPostAnonymously,
  hideName,
  setHideName,
  allowedVis,
  initialAudience,
  setInitialAudience,
  audienceMenuVisible,
  setAudienceMenuVisible,
  notifyPharmacyStaff,
  setNotifyPharmacyStaff,
  notifyFavoriteStaff,
  setNotifyFavoriteStaff,
  notifyChainMembers,
  setNotifyChainMembers,
  escalationDates,
  setEscalationPicker,
}: Props) {
  const startIdx = allowedVis.indexOf(initialAudience);
  const upcomingTiers = startIdx > -1 ? allowedVis.slice(startIdx + 1) : allowedVis;
  const notificationItems = [
    {
      key: 'pharmacy',
      visible: initialAudience !== 'FULL_PART_TIME',
      checked: notifyPharmacyStaff,
      label: 'Notify pharmacy staff',
      onPress: () => setNotifyPharmacyStaff((value) => !value),
    },
    {
      key: 'favourites',
      visible: ['LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM'].includes(initialAudience),
      checked: notifyFavoriteStaff,
      label: 'Notify favorite staff',
      onPress: () => setNotifyFavoriteStaff((value) => !value),
    },
    {
      key: 'chain',
      visible: ['OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM'].includes(initialAudience),
      checked: notifyChainMembers,
      label: 'Notify chain members',
      onPress: () => setNotifyChainMembers((value) => !value),
    },
  ].filter((item) => item.visible);

  return (
    <Surface style={styles.card} elevation={1}>
      <Surface style={styles.visibilityHero} elevation={0}>
        <Text style={styles.visibilityHeroEyebrow}>AUDIENCE PLAN</Text>
        <Text style={styles.visibilityHeroTitle}>
          {isEmbedded ? 'Private direct booking' : 'Control who sees this shift first'}
        </Text>
        <Text style={styles.helper}>
          {isEmbedded
            ? 'This booking stays private and is only visible to the selected team member.'
            : 'Choose the first audience, then optionally schedule when the shift should expand to broader groups.'}
        </Text>
        {!isEmbedded && initialAudience ? (
          <Chip style={styles.visibilitySummaryChip} textStyle={styles.visibilitySummaryChipText}>
            {`Starting with ${VISIBILITY_LABELS[initialAudience]}`}
          </Chip>
        ) : null}
      </Surface>

      {canPostAnonymously ? (
        <TouchableOpacity
          style={[styles.visibilityToggleCard, hideName && styles.visibilityToggleCardActive]}
          onPress={() => setHideName((value) => !value)}
        >
          <Checkbox status={hideName ? 'checked' : 'unchecked'} />
          <View style={styles.visibilityToggleContent}>
            <Text style={styles.visibilityToggleTitle}>Post as anonymous</Text>
            <Text style={styles.visibilityToggleText}>
              Only the pharmacy suburb will be shown.
            </Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {!isEmbedded && (
        <>
          <Text style={styles.label}>Initial Audience</Text>
          <Menu
            visible={audienceMenuVisible}
            onDismiss={() => setAudienceMenuVisible(false)}
            anchor={
              <TouchableOpacity
                style={styles.selector}
                onPress={() => setAudienceMenuVisible(true)}
              >
                <Text style={styles.selectorText}>
                  {VISIBILITY_LABELS[initialAudience] || 'Select audience'}
                </Text>
                <IconButton icon="chevron-down" size={18} />
              </TouchableOpacity>
            }
          >
            {allowedVis.map((value) => (
              <Menu.Item
                key={value}
                onPress={() => {
                  setInitialAudience(value);
                  setAudienceMenuVisible(false);
                }}
                title={VISIBILITY_LABELS[value]}
              />
            ))}
          </Menu>

          <View style={styles.visibilityCardGrid}>
            {allowedVis.map((value, index) => {
              const selected = initialAudience === value;
              const currentOrPast = startIdx > -1 && index <= startIdx;
              const meta = VISIBILITY_META[value];
              return (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.visibilityAudienceCard,
                    { backgroundColor: meta.tint, borderColor: meta.border },
                    selected && styles.visibilityAudienceCardActive,
                  ]}
                  onPress={() => setInitialAudience(value)}
                >
                  <View style={styles.visibilityAudienceHeader}>
                    <View style={styles.visibilityAudienceTextWrap}>
                      <Text style={styles.visibilityAudienceEyebrow}>{meta.eyebrow}</Text>
                      <Text style={styles.visibilityAudienceTitle}>{VISIBILITY_LABELS[value]}</Text>
                    </View>
                    <Chip
                      compact
                      style={selected ? styles.visibilityStageChipActive : styles.visibilityStageChip}
                      textStyle={selected ? styles.visibilityStageChipTextActive : styles.visibilityStageChipText}
                    >
                      {selected ? 'Selected' : currentOrPast ? 'In flow' : `Stage ${index + 1}`}
                    </Chip>
                  </View>
                  <Text style={styles.visibilityAudienceDescription}>{meta.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {notificationItems.length > 0 ? (
            <Surface style={styles.visibilityPanel} elevation={0}>
              <Text style={styles.visibilityPanelTitle}>Notification Boost</Text>
              <Text style={styles.helper}>
                Choose which groups should get an immediate nudge when this shift goes live.
              </Text>
              <View style={styles.visibilityPanelStack}>
                {notificationItems.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.visibilityOptionCard, item.checked && styles.visibilityOptionCardActive]}
                    onPress={item.onPress}
                  >
                    <Checkbox status={item.checked ? 'checked' : 'unchecked'} />
                    <Text style={styles.rowText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Surface>
          ) : null}

          {upcomingTiers.length > 0 ? (
            <Surface style={styles.visibilityPanel} elevation={0}>
              <Text style={styles.visibilityPanelTitle}>Escalation Schedule</Text>
              <Text style={styles.helper}>
                If the shift is still unfilled, these dates will widen the audience in order.
              </Text>
              <View style={styles.visibilityPanelStack}>
                {upcomingTiers.map((tier, index) => {
                  const pickerKey: keyof VisibilityDates =
                    tier === 'ORG_CHAIN'
                      ? 'org_chain'
                      : tier === 'OWNER_CHAIN'
                        ? 'owner_chain'
                        : tier === 'LOCUM_CASUAL'
                          ? 'locum_casual'
                          : 'platform';
                  const value = escalationDates[pickerKey] || '';
                  return (
                    <Surface
                      key={tier}
                      style={[styles.escalationCard, value ? styles.escalationCardActive : null]}
                      elevation={0}
                    >
                      <View style={styles.visibilityAudienceHeader}>
                        <Text style={styles.escalationTitle}>
                          {`${index + 2}. ${VISIBILITY_LABELS[tier]}`}
                        </Text>
                        <Chip
                          compact
                          style={value ? styles.visibilityStageChipActive : styles.visibilityStageChip}
                          textStyle={value ? styles.visibilityStageChipTextActive : styles.visibilityStageChipText}
                        >
                          {value ? 'Scheduled' : 'Optional'}
                        </Chip>
                      </View>
                      <Text style={styles.escalationPreview}>{formatDateLabel(value)}</Text>
                      <TextInput
                        mode="outlined"
                        value={value}
                        placeholder="YYYY-MM-DD"
                        style={styles.input}
                        right={
                          <TextInput.Icon
                            icon="calendar"
                            onPress={() => setEscalationPicker({ key: pickerKey, open: true })}
                          />
                        }
                        editable={false}
                      />
                    </Surface>
                  );
                })}
              </View>
            </Surface>
          ) : null}
        </>
      )}
    </Surface>
  );
}
