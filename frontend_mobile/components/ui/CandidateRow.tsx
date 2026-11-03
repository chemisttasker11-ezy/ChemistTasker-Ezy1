import React, { memo } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { AlertCircle, Star } from 'lucide-react-native';
import { colors, font, radius, space, type } from '@/constants/tokens';
import { Button } from './Button';
import { InitialsAvatar } from './InitialsAvatar';
import { Pill } from './Pill';
import { ScalePressable } from './ScalePressable';
import type { StatusTone } from './tone';

export type CandidateSource = 'platform' | 'network';
export type CandidateBusyAction = 'reveal' | 'review' | 'assign' | 'profile' | null;

export type CandidateRowProps = {
  name?: string | null;
  roleLabel?: string | null;
  /** Shown as "via {audience}"; platform rows default to "ChemistTasker platform". */
  audience?: string | null;
  source?: CandidateSource;
  /** Platform candidates stay anonymous until revealed; `anonymous` overrides the default. */
  revealed?: boolean;
  anonymous?: boolean;
  photoUrl?: string | null;
  avatarTone?: StatusTone;
  rating?: number | string | null;
  reviewCount?: number | null;
  /** e.g. "$68/hr counter offer". */
  counterOfferSummary?: string | null;
  statusLabel?: string | null;
  statusTone?: StatusTone;
  /** Which action is in flight; the whole row locks while one runs. */
  busyAction?: CandidateBusyAction;
  error?: string | null;
  onRetry?: () => void;
  /** Whole-row press, used only when the row has no action buttons. */
  onPress?: () => void;
  onRevealProfile?: () => void;
  onReviewOffer?: () => void;
  onAssign?: () => void;
  onViewProfile?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Shift Centre candidate: avatar (EyeOff until revealed), name or "Platform candidate", role pill,
 * "via {audience}", offer / rating / status pills, then actions. Never shows contact details.
 */
export const CandidateRow = memo(function CandidateRow({
  name,
  roleLabel,
  audience,
  source = 'network',
  revealed = false,
  anonymous,
  photoUrl,
  avatarTone = 'violet',
  rating,
  reviewCount,
  counterOfferSummary,
  statusLabel,
  statusTone = 'violet',
  busyAction = null,
  error = null,
  onRetry,
  onPress,
  onRevealProfile,
  onReviewOffer,
  onAssign,
  onViewProfile,
  style,
}: CandidateRowProps) {
  const hidden = anonymous ?? (source === 'platform' && !revealed);
  const displayName = hidden ? 'Platform candidate' : name?.trim() || 'Candidate';
  const via = audience ?? (source === 'platform' ? 'ChemistTasker platform' : null);
  const locked = Boolean(busyAction);
  const hasRating = rating !== null && rating !== undefined && rating !== '';
  const ratingText = hasRating ? (reviewCount ? `${rating} (${reviewCount})` : String(rating)) : null;
  const hasActions = Boolean(onRevealProfile || onReviewOffer || onAssign || onViewProfile);

  const summary = [
    displayName,
    roleLabel,
    via ? `via ${via}` : null,
    counterOfferSummary,
    hasRating ? `rated ${rating}${reviewCount ? ` from ${reviewCount} reviews` : ''}` : null,
    statusLabel,
  ]
    .filter(Boolean)
    .join(', ');

  const info = (
    <View style={styles.top}>
      <InitialsAvatar name={displayName} tone={avatarTone} anonymous={hidden} photoUrl={photoUrl} size={40} />
      <View style={styles.middle}>
        <Text numberOfLines={1} style={styles.name}>
          {displayName}
        </Text>
        {roleLabel || via ? (
          <View style={styles.wrapRow}>
            {roleLabel ? <Pill label={roleLabel} tone="navy" /> : null}
            {via ? (
              <Text numberOfLines={1} style={styles.via}>
                via {via}
              </Text>
            ) : null}
          </View>
        ) : null}
        {counterOfferSummary || ratingText || statusLabel ? (
          <View style={styles.wrapRow}>
            {counterOfferSummary ? <Pill label={counterOfferSummary} tone="amber" /> : null}
            {ratingText ? <Pill label={ratingText} outlined icon={<Star />} /> : null}
            {statusLabel ? <Pill label={statusLabel} tone={statusTone} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );

  const errorBanner = error ? (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
      <AlertCircle size={16} color={colors.status.red.fg} strokeWidth={2} />
      <Text style={styles.errorText}>{error}</Text>
      {onRetry ? <Button variant="outlined" label="Try again" onPress={onRetry} disabled={locked} /> : null}
    </View>
  ) : null;

  // The error banner sits beside the pressable, not in it, so Retry stays its own screen-reader element.
  if (onPress && !hasActions) {
    return (
      <View style={[styles.card, styles.pressCard, style]}>
        <ScalePressable
          static
          pressBg
          onPress={onPress}
          disabled={locked}
          accessibilityLabel={summary}
          accessibilityState={{ disabled: locked, busy: locked }}
          style={styles.pressArea}
        >
          {info}
        </ScalePressable>
        {errorBanner ? <View style={styles.pressError}>{errorBanner}</View> : null}
      </View>
    );
  }

  // Secondary actions first, primary last: on wrap the primary keeps the full-width bottom line.
  return (
    <View style={[styles.card, style]}>
      <View accessible accessibilityLabel={summary}>
        {info}
      </View>
      {errorBanner}
      {hasActions ? (
        <View style={styles.actions}>
          {onViewProfile ? (
            <Button
              variant="outlined"
              label="View profile"
              accessibilityLabel={`View profile of ${displayName}`}
              busy={busyAction === 'profile'}
              disabled={locked}
              onPress={onViewProfile}
              style={styles.action}
            />
          ) : null}
          {onReviewOffer ? (
            <Button
              variant="outlined"
              label="Review offer"
              accessibilityLabel={`Review offer from ${displayName}`}
              busy={busyAction === 'review'}
              disabled={locked}
              onPress={onReviewOffer}
              style={styles.action}
            />
          ) : null}
          {onRevealProfile ? (
            <Button
              label="Reveal profile"
              accessibilityLabel={`Reveal profile of ${displayName}`}
              busy={busyAction === 'reveal'}
              busyLabel="Revealing…"
              disabled={locked}
              haptic="medium"
              onPress={onRevealProfile}
              style={styles.action}
            />
          ) : null}
          {onAssign ? (
            <Button
              label="Assign to this date"
              accessibilityLabel={`Assign ${displayName} to this date`}
              busy={busyAction === 'assign'}
              busyLabel="Assigning…"
              disabled={locked}
              haptic="medium"
              onPress={onAssign}
              style={styles.action}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.md,
    minWidth: 0,
    borderRadius: radius.nested,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBg,
  },
  pressCard: { gap: 0, padding: 0, overflow: 'hidden' },
  pressArea: { padding: space.md },
  pressError: { paddingHorizontal: space.md, paddingBottom: space.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  middle: { flex: 1, minWidth: 0, gap: 6 },
  name: {
    color: colors.textPrimary,
    fontFamily: font.inter.semiBold,
    fontSize: type.labelLarge.fontSize,
    lineHeight: type.labelLarge.lineHeight,
  },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  via: { flexShrink: 1, color: colors.textMuted, fontFamily: font.inter.regular, fontSize: 12, lineHeight: 16 },
  error: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.tileSm,
    backgroundColor: colors.status.red.bg,
  },
  errorText: {
    flex: 1,
    minWidth: 160,
    color: colors.status.red.fg,
    fontFamily: font.inter.medium,
    fontSize: 12.5,
    lineHeight: 17,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: { flexGrow: 1 },
});
