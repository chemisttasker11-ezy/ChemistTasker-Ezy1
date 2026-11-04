import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, LogIn, Search, UserPlus, X } from 'lucide-react-native';
import { getPublicJobBoard, type Shift } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { BottomSheet, Button, ContentState, Pill, ScalePressable } from '@/components/ui';
import { colors, font, radius, space, type } from '@/constants/tokens';
import { ShiftSummary } from './ShiftSummary';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
  buildReferralAuthParams,
  mapPublicShift,
  resolvePublicShiftHandoffRoute,
} from './publicShiftRoute';

function parseNextPage(nextUrl?: string | null): number | null {
  if (!nextUrl) return null;
  try {
    const parsed = new URL(nextUrl, 'http://localhost');
    const page = parsed.searchParams.get('page');
    if (page) {
      const num = Number(page);
      return Number.isFinite(num) ? num : null;
    }
  } catch {
    const match = /[?&]page=(\d+)/.exec(nextUrl);
    if (match) return Number(match[1]);
  }
  return null;
}

const ROLE_OPTIONS = [
  { key: 'ALL', label: 'All roles' },
  { key: 'PHARMACIST', label: 'Pharmacist' },
  { key: 'INTERN', label: 'Intern' },
  { key: 'ASSISTANT', label: 'Assistant' },
  { key: 'TECHNICIAN', label: 'Technician' },
  { key: 'STUDENT', label: 'Student' },
] as const;

export function AnonymousShiftBoardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 400;
  const { user, hasCapability } = useAuth();
  const { isLoading: workspaceLoading, selectedPharmacyId } = useWorkspace();

  const searchParams = useLocalSearchParams<{ referral_code?: string; referral_event_id?: string; referral_shift_id?: string }>();
  const referralCode = searchParams.referral_code ?? null;
  const referralEventId = searchParams.referral_event_id ?? null;
  const referralShiftId = searchParams.referral_shift_id ?? null;

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const requestGenRef = useRef(0);

  const loadShifts = useCallback(async (isRefresh = false) => {
    const gen = ++requestGenRef.current;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setLoadingMore(false);
    setLoadMoreError(null);
    setError(null);

    try {
      const payload: any = { page: 1 };
      if (search.trim()) payload.search = search.trim();
      if (selectedRole !== 'ALL') payload.roles = [selectedRole];

      const response: any = await getPublicJobBoard(payload);
      if (gen !== requestGenRef.current) return;

      const list = Array.isArray(response?.results) ? response.results : Array.isArray(response) ? response : [];
      const mapped = list.map(mapPublicShift);
      setShifts(mapped);

      const count = typeof response?.count === 'number' ? response.count : null;
      setTotalCount(count);
      const nextNum = parseNextPage(response?.next) ?? (response?.next ? 2 : null);
      setNextPage(nextNum);
    } catch (err: any) {
      if (gen !== requestGenRef.current) return;
      setError(err?.message || 'Failed to load public shifts.');
    } finally {
      if (gen === requestGenRef.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [search, selectedRole]);

  const loadMoreShifts = useCallback(async () => {
    if (!nextPage || loadingMore || loading || refreshing) return;
    const gen = requestGenRef.current;
    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const payload: any = { page: nextPage };
      if (search.trim()) payload.search = search.trim();
      if (selectedRole !== 'ALL') payload.roles = [selectedRole];

      const response: any = await getPublicJobBoard(payload);
      if (gen !== requestGenRef.current) return;

      const list = Array.isArray(response?.results) ? response.results : Array.isArray(response) ? response : [];
      const mapped = list.map(mapPublicShift);
      setShifts((prev) => [...prev, ...mapped]);

      const count = typeof response?.count === 'number' ? response.count : null;
      setTotalCount(count);
      const nextNum = parseNextPage(response?.next) ?? (response?.next ? nextPage + 1 : null);
      setNextPage(nextNum);
    } catch (err: any) {
      if (gen === requestGenRef.current) {
        setLoadMoreError(err?.message || 'Could not load more shifts. Your current results are still available.');
      }
    } finally {
      if (gen === requestGenRef.current) {
        setLoadingMore(false);
      }
    }
  }, [nextPage, loadingMore, loading, refreshing, search, selectedRole]);

  useEffect(() => {
    const handle = setTimeout(() => { void loadShifts(false); }, 250);
    return () => clearTimeout(handle);
  }, [loadShifts]);

  useEffect(() => {
    return () => {
      requestGenRef.current++;
    };
  }, []);

  const handleCardPress = async (item: Shift) => {
    if (user) {
      const route = await resolvePublicShiftHandoffRoute({
        user,
        shiftId: item.id,
        isHydrated: !workspaceLoading,
        selectedPharmacyId,
        hasCapability,
      });
      if (route) {
        router.push(route as any);
      }
    } else {
      setSelectedShift(item);
    }
  };

  const sheetAuthParams = buildReferralAuthParams({
    referral_code: referralCode,
    referral_event_id: referralEventId,
    referral_shift_id: selectedShift?.id ? String(selectedShift.id) : referralShiftId,
  });

  const renderShiftItem = ({ item }: { item: Shift }) => (
    <View style={styles.cardContainer}>
      <ShiftSummary
        footer={
          <View style={styles.cardFooter}>
            <Button haptic="medium" label={user ? 'View shift' : 'Apply for shift'} onPress={() => handleCardPress(item)} variant="primary" />
          </View>
        }
        onPress={() => handleCardPress(item)}
        shift={item}
      />
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <View style={styles.topBar}>
        <ScalePressable accessibilityLabel="Back" accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={colors.accentStrong} size={20} />
        </ScalePressable>
        <View style={styles.titleColumn}>
          <Text numberOfLines={1} style={styles.topBarTitle}>Public Shift Board</Text>
          <Text numberOfLines={1} style={styles.topBarSubtitle}>Open pharmacy shifts across Australia</Text>
        </View>
        {!user ? (
          <ScalePressable accessibilityLabel="Sign in" accessibilityRole="button" onPress={() => router.push({ pathname: '/login', params: sheetAuthParams })} style={styles.signInButton}>
            <Text style={styles.signInButtonText}>Sign in</Text>
          </ScalePressable>
        ) : <View style={styles.backButton} />}
      </View>

      <View style={styles.filterSection}>
        <View style={styles.searchRow}>
          <Search color={colors.textMuted} size={18} style={styles.searchIcon} />
          <TextInput accessibilityLabel="Search shifts" autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" onChangeText={setSearch} placeholder="Search suburb, city, or pharmacy..." placeholderTextColor={colors.textMuted} style={styles.searchInput} value={search} />
          {search ? (
            <ScalePressable accessibilityLabel="Clear search" accessibilityRole="button" onPress={() => setSearch('')} style={styles.clearSearchButton}>
              <X color={colors.textMuted} size={16} />
            </ScalePressable>
          ) : null}
        </View>
        <ScrollView contentContainerStyle={styles.rolePillsTrack} horizontal showsHorizontalScrollIndicator={false}>
          {ROLE_OPTIONS.map((opt) => (
            <Pill key={opt.key} label={opt.label} onPress={() => setSelectedRole(opt.key)} selected={selectedRole === opt.key} tone={selectedRole === opt.key ? 'violet' : 'neutral'} />
          ))}
        </ScrollView>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Searching available shifts...</Text>
        </View>
      ) : error ? (
        <View style={styles.contentWrap}>
          <ContentState actionLabel="Try again" description={error} kind="error" onAction={() => void loadShifts(false)} title="Could not load shifts" />
        </View>
      ) : shifts.length === 0 ? (
        <View style={styles.contentWrap}>
          <ContentState actionLabel={search || selectedRole !== 'ALL' ? 'Clear filters' : undefined} description="No open shifts match your search criteria. Try removing filters or checking back soon." kind="empty" onAction={() => { setSearch(''); setSelectedRole('ALL'); }} title="No shifts found" />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[styles.listContainer, compact ? styles.listContainerCompact : null, { paddingBottom: insets.bottom + space['2xl'] }]}
          data={shifts}
          keyExtractor={(item) => String(item.id)}
          onRefresh={() => void loadShifts(true)}
          refreshing={refreshing}
          renderItem={renderShiftItem}
          onEndReached={() => { if (!loadMoreError) void loadMoreShifts(); }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={styles.footerLoadingText}>Loading more shifts...</Text>
              </View>
            ) : nextPage ? (
              <View style={styles.loadMoreWrap}>
                {loadMoreError ? (
                  <Text accessibilityRole="alert" style={styles.footerLoadingText}>{loadMoreError}</Text>
                ) : null}
                <Button label={loadMoreError ? 'Retry loading shifts' : 'Load more shifts'} onPress={() => void loadMoreShifts()} variant="outlined" />
              </View>
            ) : undefined
          }
        />
      )}

      <BottomSheet
        onClose={() => setSelectedShift(null)}
        open={selectedShift !== null}
        subtitle={selectedShift ? [selectedShift.roleNeeded || selectedShift.roleLabel, selectedShift.uiLocationCity].filter(Boolean).join(' · ') : undefined}
        title="Apply for this shift"
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetMessage}>Create an account or sign in to submit your availability, counter-offer on rates, and connect directly with the pharmacy.</Text>
          <View style={styles.sheetButtonStack}>
            <Button haptic="medium" icon={<UserPlus />} label="Create account" onPress={() => { setSelectedShift(null); router.push({ pathname: '/register', params: sheetAuthParams }); }} variant="primary" />
            <Button icon={<LogIn />} label="Sign in" onPress={() => { setSelectedShift(null); router.push({ pathname: '/login', params: sheetAuthParams }); }} variant="outlined" />
          </View>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },
  topBar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surfaceBg },
  titleColumn: { flex: 1, paddingHorizontal: space.sm },
  topBarTitle: { fontFamily: font.outfit.semiBold, fontSize: type.titleMedium.fontSize, lineHeight: type.titleMedium.lineHeight, color: colors.textPrimary },
  topBarSubtitle: { fontFamily: font.inter.regular, fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: radius.pill },
  signInButton: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceBg, minHeight: 36, justifyContent: 'center', alignItems: 'center' },
  signInButtonText: { fontFamily: font.inter.semiBold, fontSize: type.labelMedium.fontSize, color: colors.primary },
  filterSection: { backgroundColor: colors.surfaceBg, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: space.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.subtleBg, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, height: 44 },
  searchIcon: { marginRight: space.sm },
  searchInput: { flex: 1, fontFamily: font.inter.regular, fontSize: type.bodyMedium.fontSize, color: colors.textPrimary, height: 44 },
  clearSearchButton: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  rolePillsTrack: { flexDirection: 'row', gap: space.xs, paddingVertical: space.xs },
  listContainer: { padding: space.lg, gap: space.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  listContainerCompact: { padding: space.md, gap: space.md },
  cardContainer: { backgroundColor: colors.surfaceBg, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.md, borderCurve: 'continuous' },
  cardFooter: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.md },
  loadingText: { fontFamily: font.inter.regular, fontSize: type.bodyMedium.fontSize, color: colors.textSecondary },
  contentWrap: { flex: 1, padding: space.xl, justifyContent: 'center' },
  sheetContent: { padding: space.lg, gap: space.lg },
  sheetMessage: { fontFamily: font.inter.regular, fontSize: type.bodyMedium.fontSize, lineHeight: type.bodyMedium.lineHeight, color: colors.textSecondary },
  sheetButtonStack: { gap: space.md, marginTop: space.sm },
  footerLoading: { paddingVertical: space.md, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  footerLoadingText: { fontFamily: font.inter.regular, fontSize: type.bodySmall.fontSize, color: colors.textSecondary },
  loadMoreWrap: { paddingVertical: space.md, alignItems: 'center' },
});
