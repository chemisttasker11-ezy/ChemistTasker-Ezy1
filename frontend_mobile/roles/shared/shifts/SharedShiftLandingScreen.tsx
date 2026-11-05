import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Compass, LogIn, Search, UserPlus } from 'lucide-react-native';
import { getViewSharedShift, type Shift } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { Button, ContentState, ScalePressable } from '@/components/ui';
import { colors, font, radius, space, type } from '@/constants/tokens';
import { ShiftSummary } from './ShiftSummary';
import {
  type RouteDecision,
  type RouteDecisionInput,
  PUBLIC_AUTH_ROUTES,
  PUBLIC_SHIFT_ALLOWLIST,
  isPublicShiftRoute,
  getPersonaDashboard,
  evaluateRouteDecision,
  resolvePostAuthShiftRoute,
  resolveActiveShiftPersona,
  resolvePublicShiftHandoffRoute,
  type ResolveShiftHandoffOptions,
  buildReferralAuthParams,
  mapPublicShift,
} from './publicShiftRoute';

export {
  type RouteDecision,
  type RouteDecisionInput,
  PUBLIC_AUTH_ROUTES,
  PUBLIC_SHIFT_ALLOWLIST,
  isPublicShiftRoute,
  getPersonaDashboard,
  evaluateRouteDecision,
  resolvePostAuthShiftRoute,
  resolveActiveShiftPersona,
  resolvePublicShiftHandoffRoute,
  type ResolveShiftHandoffOptions,
  buildReferralAuthParams,
  mapPublicShift,
};

export function SharedShiftLandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 400;
  const { user, isLoading: authLoading, hasCapability } = useAuth();
  const { isLoading: workspaceLoading, selectedPharmacyId } = useWorkspace();

  const searchParams = useLocalSearchParams<{ token?: string; referral_code?: string; referral_event_id?: string; referral_shift_id?: string }>();
  const token = typeof searchParams.token === 'string' ? searchParams.token.trim() : '';
  const referralCode = searchParams.referral_code ?? null;
  const referralEventId = searchParams.referral_event_id ?? null;
  const referralShiftId = searchParams.referral_shift_id ?? null;

  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestGenRef = useRef(0);


  const loadShift = useCallback(async () => {
    const gen = ++requestGenRef.current;
    setShift(null);
    if (!token) {
      setError('No shift token provided in link.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response: any = await getViewSharedShift({ token });
      if (gen !== requestGenRef.current) return;
      const raw = response?.data ?? response;
      if (!raw || (!raw.id && !raw.role_needed && !raw.roleNeeded)) throw new Error('Shift details could not be retrieved.');
      setShift(mapPublicShift(raw));
    } catch (err: any) {
      if (gen !== requestGenRef.current) return;
      setError(err?.response?.data?.detail || err?.message || 'This shift link is invalid or has expired.');
    } finally {
      if (gen === requestGenRef.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadShift(); }, [loadShift]);

  useEffect(() => {
    return () => {
      requestGenRef.current++;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!authLoading && !workspaceLoading && user && shift?.id) {
      void resolvePublicShiftHandoffRoute({
        user,
        shiftId: shift.id,
        isHydrated: !workspaceLoading,
        selectedPharmacyId,
        hasCapability,
      }).then((route) => {
        if (!active || !route) return;
        router.replace(route as any);
      });
    }
    return () => {
      active = false;
    };
  }, [authLoading, hasCapability, router, selectedPharmacyId, shift?.id, user, workspaceLoading]);

  const authParams = buildReferralAuthParams({
    referral_code: referralCode,
    referral_event_id: referralEventId,
    referral_shift_id: shift?.id ? String(shift.id) : referralShiftId,
  });

  if (loading || (authLoading && !error) || (user && workspaceLoading && !error)) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading shift details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !shift) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
        <View style={styles.topBar}>
          <ScalePressable accessibilityLabel="Back to welcome" accessibilityRole="button" onPress={() => router.replace('/welcome')} style={styles.backButton}>
            <ArrowLeft color={colors.accentStrong} size={20} />
          </ScalePressable>
          <Text style={styles.topBarTitle}>Shared Shift</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.contentWrap}>
          <ContentState actionLabel="Try again" description={error || 'This shift link is invalid or has expired.'} kind="error" onAction={loadShift} title="Shift Link Unavailable" />
          <View style={styles.errorActions}>
            <Button icon={<Search />} label="Browse available shifts" onPress={() => router.push({ pathname: '/shifts/public-board', params: authParams })} variant="outlined" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const roleName = shift.roleNeeded || shift.roleLabel || 'Pharmacy Shift';
  const locationLabel = [shift.uiLocationCity, shift.uiLocationState].filter(Boolean).join(', ');

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <View style={styles.topBar}>
        <ScalePressable accessibilityLabel="Back to welcome" accessibilityRole="button" onPress={() => router.replace('/welcome')} style={styles.backButton}>
          <ArrowLeft color={colors.accentStrong} size={20} />
        </ScalePressable>
        <Text numberOfLines={1} style={styles.topBarTitle}>ChemistTasker</Text>
        <ScalePressable accessibilityLabel="Browse public shifts" accessibilityRole="button" onPress={() => router.push({ pathname: '/shifts/public-board', params: authParams })} style={styles.backButton}>
          <Compass color={colors.primary} size={20} />
        </ScalePressable>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollBody, compact ? styles.scrollBodyCompact : null, { paddingBottom: insets.bottom + space['2xl'] }]} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.heroBanner}>
          <Text style={styles.heroEyebrow}>OPEN SHIFT OPPORTUNITY</Text>
          <Text style={styles.heroTitle}>{roleName}</Text>
          {locationLabel ? <Text style={styles.heroLocation}>{locationLabel}</Text> : null}
        </View>

        <View style={styles.cardWrapper}>
          <ShiftSummary shift={shift} />
        </View>

        {shift.description ? (
          <View style={styles.descriptionCard}>
            <Text style={styles.sectionHeading}>About this shift</Text>
            <Text style={styles.descriptionBody}>{shift.description}</Text>
          </View>
        ) : null}

        <View style={styles.actionCard}>
          <Text style={styles.actionHeading}>Ready to apply?</Text>
          <Text style={styles.actionBody}>Sign in or create a ChemistTasker account to apply, submit counter-offers, and access verified roster details.</Text>
          <View style={styles.buttonStack}>
            <Button haptic="medium" icon={<UserPlus />} label="Create account" onPress={() => router.push({ pathname: '/register', params: authParams })} variant="primary" />
            <Button icon={<LogIn />} label="Sign in" onPress={() => router.push({ pathname: '/login', params: authParams })} variant="outlined" />
            <Button icon={<Search />} label="Browse more shifts" onPress={() => router.push({ pathname: '/shifts/public-board', params: authParams })} variant="outlined" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surfaceBg },
  topBarTitle: { fontFamily: font.outfit.semiBold, fontSize: type.titleMedium.fontSize, lineHeight: type.titleMedium.lineHeight, color: colors.textPrimary },
  backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: radius.pill },
  scrollBody: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg, maxWidth: 600, width: '100%', alignSelf: 'center' },
  scrollBodyCompact: { paddingHorizontal: space.md },
  heroBanner: { paddingVertical: space.md, gap: 4 },
  heroEyebrow: { fontFamily: font.inter.semiBold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, color: colors.primary, textTransform: 'uppercase' },
  heroTitle: { fontFamily: font.outfit.semiBold, fontSize: type.headlineMedium.fontSize, lineHeight: type.headlineMedium.lineHeight, color: colors.textPrimary },
  heroLocation: { fontFamily: font.inter.medium, fontSize: type.bodyMedium.fontSize, lineHeight: type.bodyMedium.lineHeight, color: colors.textSecondary, marginTop: 2 },
  cardWrapper: { backgroundColor: colors.surfaceBg, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.md, borderCurve: 'continuous' },
  descriptionCard: { backgroundColor: colors.surfaceBg, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.lg, borderCurve: 'continuous', gap: space.sm },
  sectionHeading: { fontFamily: font.inter.semiBold, fontSize: type.labelLarge.fontSize, lineHeight: type.labelLarge.lineHeight, color: colors.textPrimary },
  descriptionBody: { fontFamily: font.inter.regular, fontSize: type.bodyMedium.fontSize, lineHeight: type.bodyMedium.lineHeight, color: colors.textSecondary },
  actionCard: { backgroundColor: colors.surfaceBg, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.lg, borderCurve: 'continuous', gap: space.md, marginTop: space.sm },
  actionHeading: { fontFamily: font.outfit.semiBold, fontSize: type.titleMedium.fontSize, lineHeight: type.titleMedium.lineHeight, color: colors.textPrimary },
  actionBody: { fontFamily: font.inter.regular, fontSize: type.bodyMedium.fontSize, lineHeight: type.bodyMedium.lineHeight, color: colors.textSecondary },
  buttonStack: { gap: space.md, marginTop: space.xs },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.md },
  loadingText: { fontFamily: font.inter.regular, fontSize: type.bodyMedium.fontSize, color: colors.textSecondary },
  contentWrap: { flex: 1, padding: space.xl, justifyContent: 'center', gap: space.lg },
  errorActions: { alignSelf: 'center', width: '100%', maxWidth: 320 },
});
