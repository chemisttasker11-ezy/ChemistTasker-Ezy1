import type { Dispatch, SetStateAction } from 'react';
import { Linking, TouchableOpacity, View } from 'react-native';
import {
  Button,
  Checkbox,
  Chip,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';
import {
  GOVERNMENT_AWARD_GUIDE_URL,
  RATE_TYPE_DESCRIPTIONS,
  formatClockTime,
  formatLongSlotDate,
  getSlotDurationHours,
  type RateType,
} from './PostShiftScreen.helpers';
import { styles } from './PostShiftScreen.styles';

type Setter<T> = Dispatch<SetStateAction<T>>;

type ExpandedSlot = {
  date: string;
  startTime: string;
  endTime: string;
};

type SlotRateRow = {
  rate: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  error?: string;
  dirty?: boolean;
};

type Props = {
  isLocumLike: boolean;
  roleNeeded: string;
  ftptPayMode: 'HOURLY' | 'ANNUAL';
  setFtptPayMode: Setter<'HOURLY' | 'ANNUAL'>;
  minHourly: string;
  setMinHourly: Setter<string>;
  maxHourly: string;
  setMaxHourly: Setter<string>;
  minAnnual: string;
  setMinAnnual: Setter<string>;
  maxAnnual: string;
  setMaxAnnual: Setter<string>;
  superPercent: string;
  setSuperPercent: Setter<string>;

  rateType: RateType;
  setRateType: Setter<RateType>;
  paymentPreference: 'ABN' | 'TFN';
  setPaymentPreference: Setter<'ABN' | 'TFN'>;
  locumSuperIncluded: boolean;
  setLocumSuperIncluded: Setter<boolean>;

  hasOutsidePharmacyMemberAudience: boolean;
  rateWeekday: string;
  setRateWeekday: Setter<string>;
  rateSaturday: string;
  setRateSaturday: Setter<string>;
  rateSunday: string;
  setRateSunday: Setter<string>;
  ratePublicHoliday: string;
  setRatePublicHoliday: Setter<string>;
  rateEarlyMorning: string;
  setRateEarlyMorning: Setter<string>;
  rateLateNight: string;
  setRateLateNight: Setter<string>;
  handleSavePharmacyRateDefaults: () => void | Promise<void>;
  savingPharmacyRates: boolean;
  pharmacyId: number | '';

  expandedSlots: ExpandedSlot[];
  slotRateRows: SlotRateRow[];
  ownerBonus: string;
  setOwnerBonus: Setter<string>;
  handleSlotRateChange: (index: number, value: string) => void;
};

const chipStyle = (selected: boolean) => [
  styles.chip,
  selected ? styles.chipSelected : styles.chipUnselected,
];

const chipTextStyle = (selected: boolean) =>
  selected ? styles.chipTextSelected : styles.chipText;

export default function PostShiftPayRateStep({
  isLocumLike,
  roleNeeded,
  ftptPayMode,
  setFtptPayMode,
  minHourly,
  setMinHourly,
  maxHourly,
  setMaxHourly,
  minAnnual,
  setMinAnnual,
  maxAnnual,
  setMaxAnnual,
  superPercent,
  setSuperPercent,
  rateType,
  setRateType,
  paymentPreference,
  setPaymentPreference,
  locumSuperIncluded,
  setLocumSuperIncluded,
  hasOutsidePharmacyMemberAudience,
  rateWeekday,
  setRateWeekday,
  rateSaturday,
  setRateSaturday,
  rateSunday,
  setRateSunday,
  ratePublicHoliday,
  setRatePublicHoliday,
  rateEarlyMorning,
  setRateEarlyMorning,
  rateLateNight,
  setRateLateNight,
  handleSavePharmacyRateDefaults,
  savingPharmacyRates,
  pharmacyId,
  expandedSlots,
  slotRateRows,
  ownerBonus,
  setOwnerBonus,
  handleSlotRateChange,
}: Props) {
  const showSlotPreview =
    isLocumLike &&
    !(roleNeeded === 'PHARMACIST' && rateType === 'PHARMACIST_PROVIDED');

  const renderSlotPreviewList = () => {
    if (!showSlotPreview || expandedSlots.length === 0) return null;

    return (
      <View style={styles.slotRatePreviewPanel}>
        <Text style={styles.label}>Slot rate preview</Text>
        {expandedSlots.map((slot, index) => {
          const row = slotRateRows[index] ?? {
            rate: '',
            status: 'idle' as const,
          };
          const baseNumber = Number(row.rate);
          const rateValid = Number.isFinite(baseNumber);
          const bonusNumber = Number(ownerBonus);
          const bonusValid = Number.isFinite(bonusNumber);
          const finalNumber =
            roleNeeded === 'PHARMACIST'
              ? rateValid
                ? baseNumber
                : null
              : (rateValid ? baseNumber : 0) + (bonusValid ? bonusNumber : 0);
          const durationHours = getSlotDurationHours(
            slot.startTime,
            slot.endTime,
          );
          const totalNumber =
            finalNumber != null &&
            Number.isFinite(finalNumber) &&
            durationHours > 0
              ? finalNumber * durationHours
              : null;
          const totalLabel =
            totalNumber != null && Number.isFinite(totalNumber)
              ? `$${totalNumber.toFixed(2)}`
              : '$0.00';

          return (
            <View
              key={`${slot.date}-${slot.startTime}-${index}`}
              style={styles.slotRatePreviewCard}
            >
              <View style={styles.slotRatePreviewInfo}>
                <Text style={styles.slotText}>
                  {formatLongSlotDate(slot.date)}
                </Text>
                <Text style={styles.helper}>
                  {`${formatClockTime(slot.startTime)} - ${formatClockTime(slot.endTime)}`}
                </Text>
              </View>
              <View style={styles.slotRatePreviewControls}>
                <TextInput
                  mode="outlined"
                  label="Rate"
                  value={row.rate}
                  onChangeText={(value) => handleSlotRateChange(index, value)}
                  keyboardType="numeric"
                  left={<TextInput.Affix text="$" />}
                  right={<TextInput.Affix text="/hr" />}
                  style={styles.slotRateInput}
                  dense
                />
                <Text style={styles.slotRateBadge}>
                  {row.status === 'loading'
                    ? '...'
                    : totalLabel.replace('.00', '')}
                </Text>
              </View>
              {row.status === 'error' && row.error ? (
                <Text style={{ color: '#B91C1C', fontSize: 12 }}>
                  {row.error}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <Surface style={styles.card} elevation={1}>
      <Text style={styles.label}>Pay Rate</Text>

      {!isLocumLike ? (
        <>
          <Text style={[styles.label, { marginTop: 16 }]}>Salary Range</Text>
          <View style={styles.pills}>
            {(['HOURLY', 'ANNUAL'] as const).map((mode) => {
              const selected = ftptPayMode === mode;
              return (
                <Chip
                  key={mode}
                  selected={selected}
                  onPress={() => setFtptPayMode(mode)}
                  style={chipStyle(selected)}
                  textStyle={chipTextStyle(selected)}
                >
                  {mode === 'HOURLY' ? 'Hourly' : 'Annual Package'}
                </Chip>
              );
            })}
          </View>
          {ftptPayMode === 'HOURLY' ? (
            <>
              <TextInput
                mode="outlined"
                label="Min Hourly Rate ($/hr)"
                value={minHourly}
                onChangeText={setMinHourly}
                keyboardType="numeric"
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Max Hourly Rate ($/hr)"
                value={maxHourly}
                onChangeText={setMaxHourly}
                keyboardType="numeric"
                style={styles.input}
              />
            </>
          ) : (
            <>
              <TextInput
                mode="outlined"
                label="Min Annual Package ($)"
                value={minAnnual}
                onChangeText={setMinAnnual}
                keyboardType="numeric"
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Max Annual Package ($)"
                value={maxAnnual}
                onChangeText={setMaxAnnual}
                keyboardType="numeric"
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Super (%)"
                value={superPercent}
                onChangeText={setSuperPercent}
                keyboardType="numeric"
                style={styles.input}
              />
            </>
          )}
        </>
      ) : roleNeeded === 'PHARMACIST' ? (
        <>
          <View style={styles.pills}>
            {(['FLEXIBLE', 'FIXED', 'PHARMACIST_PROVIDED'] as RateType[]).map(
              (mode) => {
                const selected = rateType === mode;
                return (
                  <Chip
                    key={mode}
                    selected={selected}
                    onPress={() => setRateType(mode)}
                    style={chipStyle(selected)}
                    textStyle={chipTextStyle(selected)}
                  >
                    {mode === 'FLEXIBLE'
                      ? 'Flexible Rate'
                      : mode === 'FIXED'
                        ? 'Fixed Rate'
                        : 'Pharmacist Provided'}
                  </Chip>
                );
              },
            )}
          </View>
          <Text style={styles.helper}>{RATE_TYPE_DESCRIPTIONS[rateType]}</Text>

          <Text style={[styles.label, { marginTop: 16 }]}>Payment Type</Text>
          <View style={styles.pills}>
            {(['ABN', 'TFN'] as const).map((preference) => {
              const selected = paymentPreference === preference;
              return (
                <Chip
                  key={preference}
                  selected={selected}
                  onPress={() => setPaymentPreference(preference)}
                  style={chipStyle(selected)}
                  textStyle={chipTextStyle(selected)}
                >
                  {preference}
                </Chip>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setLocumSuperIncluded((value) => !value)}
          >
            <Checkbox
              status={locumSuperIncluded ? 'checked' : 'unchecked'}
            />
            <Text style={styles.rowText}>+ superannuation </Text>
          </TouchableOpacity>

          {rateType !== 'PHARMACIST_PROVIDED' ? (
            <>
              <Text style={[styles.label, { marginTop: 16 }]}>
                Base rates ($/hr)
                {hasOutsidePharmacyMemberAudience ? '' : ' (optional)'}
              </Text>
              {!hasOutsidePharmacyMemberAudience ? (
                <Text style={styles.helper}>
                  These pay rates will be displayed whenever the shift is
                  visible outside Pharmacy Members.
                </Text>
              ) : null}
              <TextInput
                mode="outlined"
                label="Weekday"
                value={rateWeekday}
                onChangeText={setRateWeekday}
                keyboardType="numeric"
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Saturday"
                value={rateSaturday}
                onChangeText={setRateSaturday}
                keyboardType="numeric"
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Sunday"
                value={rateSunday}
                onChangeText={setRateSunday}
                keyboardType="numeric"
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Public Holiday"
                value={ratePublicHoliday}
                onChangeText={setRatePublicHoliday}
                keyboardType="numeric"
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Early Morning"
                value={rateEarlyMorning}
                onChangeText={setRateEarlyMorning}
                keyboardType="numeric"
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Late Night"
                value={rateLateNight}
                onChangeText={setRateLateNight}
                keyboardType="numeric"
                style={styles.input}
              />
              <Button
                mode="outlined"
                onPress={handleSavePharmacyRateDefaults}
                loading={savingPharmacyRates}
                disabled={savingPharmacyRates || !pharmacyId}
                style={styles.defaultRatesButton}
              >
                Update Pharmacy Default Rates
              </Button>
            </>
          ) : null}

          {renderSlotPreviewList()}
        </>
      ) : (
        <>
          <TouchableOpacity
            onPress={() => Linking.openURL(GOVERNMENT_AWARD_GUIDE_URL)}
          >
            <Text style={styles.helper}>Rate is set by government award</Text>
            <Text style={styles.helper}>published 6 February 2026</Text>
          </TouchableOpacity>

          <Text style={[styles.label, { marginTop: 16 }]}>Payment Type</Text>
          <View style={styles.pills}>
            {(['ABN', 'TFN'] as const).map((preference) => {
              const selected = paymentPreference === preference;
              return (
                <Chip
                  key={preference}
                  selected={selected}
                  onPress={() => setPaymentPreference(preference)}
                  style={chipStyle(selected)}
                  textStyle={chipTextStyle(selected)}
                >
                  {preference}
                </Chip>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setLocumSuperIncluded((value) => !value)}
          >
            <Checkbox
              status={locumSuperIncluded ? 'checked' : 'unchecked'}
            />
            <Text style={styles.rowText}>+ superannuation </Text>
          </TouchableOpacity>

          <TextInput
            mode="outlined"
            label="Owner Bonus ($/hr, optional)"
            value={ownerBonus}
            onChangeText={setOwnerBonus}
            keyboardType="numeric"
            style={styles.input}
          />
          {renderSlotPreviewList()}
        </>
      )}
    </Surface>
  );
}
