import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Chip, Text, TextInput } from 'react-native-paper';
import { BrandActivityIndicator as ActivityIndicator } from '@/components/ui/BrandActivityIndicator';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  filterTalentCandidates, getPublicTalentFeed, loadAllTalentPages,
  projectPublicTalentCandidate, skillLabel,
  type TalentFilters, type PublicTalentCandidate,
} from '@chemisttasker/shared-core';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { useAuth } from '@/context/AuthContext';
import { colors, radius, space, touch } from '@/constants/tokens';

const clear: TalentFilters = {
  search: '', roles: [], states: [], workTypes: [], skills: [],
  willingToTravel: false, placementSeeker: false,
  availabilityStart: null, availabilityEnd: null,
};

export default function PublicTalentBoard() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reference_code?: string }>();
  const { user } = useAuth();
  const account = String(user?.id ?? 'anonymous');
  const referenceCode = String(params.reference_code ?? '').trim();
  const scopeRef = useRef(account + ':' + referenceCode);
  scopeRef.current = account + ':' + referenceCode;
  const role = String(user?.role || '').toUpperCase();
  const workspace = role === 'OWNER' ? '/owner/talent-board'
    : ['ORGANIZATION','ORG_OWNER','ORG_ADMIN','ORG_STAFF','CHIEF_ADMIN','REGION_ADMIN'].includes(role)
      ? '/organization/talent-board' : role === 'PHARMACIST'
        ? '/pharmacist/talent-board' : role === 'OTHER_STAFF'
          ? '/otherstaff/talent-board' : '/explorer/talent-board';
  const generation = useRef(0);
  const pending = useRef(false);
  const [rows, setRows] = useState<PublicTalentCandidate[]>([]);
  const [filters, setFilters] = useState<TalentFilters>(clear);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const load = useCallback(async () => {
    if (pending.current) return;
    const request = ++generation.current;
    const scope = account + ':' + referenceCode;
    pending.current = true;
    setLoading(true);
    setError('');
    setComplete(false);
    try {
      // Server has no role/skill/date query support. Fetch the entire public
      // collection BEFORE filtering, as both web Talent Boards already do.
      const publish = (raw: readonly any[], isComplete: boolean) => {
        if (request !== generation.current || scopeRef.current !== scope) return;
        const projected = raw.map(post => projectPublicTalentCandidate(
          post as Record<string, unknown>, registry as any));
        const unique = new Map(projected.filter(item =>
          Number.isSafeInteger(item.id) && item.id > 0).map(item => [item.id, item]));
        const visible = Array.from(unique.values());
        setRows(referenceCode
          ? visible.filter(item => item.referenceCode === referenceCode ||
            item.refId === referenceCode) : visible);
        if (isComplete) setComplete(true);
      };
      // Preserve confirmed page-one rows when a later page fails. The
      // complete flag prevents presenting a partial filter as "no results".
      const raw = await loadAllTalentPages((page: number) =>
        getPublicTalentFeed({ page, page_size: 200 }), 1,
        partial => publish(partial, false));
      publish(raw, true);
    } catch (failure: any) {
      if (request === generation.current && scopeRef.current === scope) {
        setError(failure?.message || 'Public talent could not load completely. Retry to search all pages.');
      }
    } finally {
      if (request === generation.current && scopeRef.current === scope) {
        pending.current = false;
        setLoading(false);
      }
    }
  }, [account, referenceCode]);
  useEffect(() => {
    // Change of account/reference invalidates all pending fetches immediately.
    generation.current += 1;
    pending.current = false;
    setRows([]);
    setComplete(false);
    void load();
    return () => { generation.current += 1; pending.current = false; };
  }, [load]);
  const filtered = useMemo(() => filterTalentCandidates(
    registry as any, rows, filters), [rows, filters]);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filters, referenceCode]);
  const shown = filtered.filtered.slice((page - 1) * 10, page * 10);
  const options = (key: 'roles'|'states'|'workTypes'|'skills', values: string[]) => {
    const current = filters[key];
    const label = {roles:'Role',states:'State',workTypes:'Work type',skills:'Skill'}[key];
    return values.map(value => <Chip key={key + value}
      accessibilityLabel={label + ' ' + value}
      selected={current.includes(value)}
      onPress={() => setFilters(previous => ({
        ...previous, [key]: previous[key].includes(value)
          ? previous[key].filter(item => item !== value) : [...previous[key], value],
      }))}>{key === 'skills' ? skillLabel(registry as any, value) : value}</Chip>);
  };
  const workTypes = [...new Set(rows.flatMap(row => row.workTypes))].sort();
  const skillOptions = [...new Set(rows.flatMap(row => [
    ...(row.skills ?? []), ...row.dispenseSoftware,
  ]))].sort();
  const landing = referenceCode
    ? '/explore/talent-board?reference_code=' + encodeURIComponent(referenceCode)
    : '/explore/talent-board';
  const setDate = (key: 'availabilityStart'|'availabilityEnd', value: string) =>
    setFilters(previous => ({ ...previous, [key]: value || null }));

  return <SafeAreaView style={styles.page} edges={['top','left','right','bottom']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button mode="text" icon="arrow-left"
        onPress={() => router.canGoBack() ? router.back() : router.replace('/explore' as any)}>Explore</Button>
      <Text variant="headlineMedium" style={styles.title}>Discover pharmacy talent</Text>
      <Text style={styles.muted}>Only publicly shared skills and availability. Private contact details are not displayed.</Text>
      <TextInput mode="outlined" label="Search" accessibilityLabel="Search talent"
        value={filters.search}
        onChangeText={search => setFilters(previous => ({ ...previous, search }))} />
      <Text accessibilityRole="header" style={styles.title}>Role</Text>
      <View style={styles.filters} accessibilityLabel="Role filters">{options('roles', filtered.roleOptions)}</View>
      <Text accessibilityRole="header" style={styles.title}>State</Text>
      <View style={styles.filters} accessibilityLabel="State filters">{options('states', filtered.stateOptions)}</View>
      <Text accessibilityRole="header" style={styles.title}>Work type</Text>
      <View style={styles.filters} accessibilityLabel="Work type filters">{options('workTypes', workTypes)}</View>
      <Text accessibilityRole="header" style={styles.title}>Skill</Text>
      <View style={styles.filters} accessibilityLabel="Skill filters">
        {skillOptions.length ? options('skills', skillOptions)
          : <Chip accessibilityLabel="Skill filters unavailable" disabled>No skills to filter</Chip>}
      </View>
      <View style={styles.filters}>
        <Chip selected={filters.willingToTravel} onPress={() =>
          setFilters(previous => ({ ...previous, willingToTravel: !previous.willingToTravel }))}>Travel</Chip>
        <Chip selected={filters.placementSeeker} onPress={() =>
          setFilters(previous => ({ ...previous, placementSeeker: !previous.placementSeeker }))}>Placement</Chip>
      </View>
      <Text accessibilityRole="header" style={styles.title}>Availability</Text>
      <View style={styles.filters} accessibilityLabel="Availability filters">
        <TextInput mode="outlined" label="Availability start (YYYY-MM-DD)"
          accessibilityLabel="Availability start"
          value={filters.availabilityStart ?? ''}
          onChangeText={value => setDate('availabilityStart',value)} />
        <TextInput mode="outlined" label="Availability end (YYYY-MM-DD)"
          accessibilityLabel="Availability end"
          value={filters.availabilityEnd ?? ''}
          onChangeText={value => setDate('availabilityEnd',value)} />
      </View>
      <Button mode="outlined" onPress={() => {setFilters(clear);setPage(1);}}>Clear filters</Button>
      {loading && !rows.length ? <ActivityIndicator /> : null}
      {error ? <View style={styles.status}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        <Button onPress={() => void load()}>Retry</Button></View> : null}
      {complete ? <Text style={styles.muted}>{filtered.filtered.length} public candidates</Text> : null}
      {shown.map(item => <Card key={item.id} mode="outlined" style={styles.card}>
        <Card.Content style={styles.cardBody}>
          <Text variant="titleMedium" style={styles.title}>{item.role}</Text>
          {item.city || item.state ? <Text style={styles.muted}>{[item.city,item.state].filter(Boolean).join(', ')}</Text> : null}
          {item.availabilitySummary ? <Text style={styles.muted}>{item.availabilitySummary}</Text> : null}
          {item.workTypes.length ? <Text style={styles.muted}>{item.workTypes.join(' · ')}</Text> : null}
          <Button mode="outlined" contentStyle={styles.button} onPress={() =>
            router.push(user ? workspace as any : { pathname: '/login', params: { returnTo: landing } } as any)}>
            {user ? 'Open talent workspace' : 'Sign in to contact talent'}
          </Button>
        </Card.Content>
      </Card>)}
      {complete && !shown.length ? <Text>No public candidates match these filters.</Text> : null}
      {complete && page > 1 ? <Button onPress={() => setPage(value => value - 1)}>Previous results</Button> : null}
      {complete && page * 10 < filtered.filtered.length ?
        <Button onPress={() => setPage(value => value + 1)}>Next results</Button> : null}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, paddingBottom: space['3xl'], gap: space.md },
  title: { color: colors.textPrimary, fontWeight: '700' },
  muted: { color: colors.textSecondary, lineHeight: 22 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: { borderColor: colors.border, backgroundColor: colors.surfaceBg, borderRadius: radius.card },
  cardBody: { gap: space.sm },
  button: { minHeight: touch.min },
  status: { gap: space.md },
  error: { color: colors.status.red.fg },
});
