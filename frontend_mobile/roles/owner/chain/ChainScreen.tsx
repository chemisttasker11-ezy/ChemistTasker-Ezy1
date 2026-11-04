import React, { useCallback, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Building2 } from 'lucide-react-native';
import {
  addPharmacyToChain, createChainService, deleteChainService, fetchChainPharmaciesService,
  fetchChainsService, fetchMembershipsByPharmacy, fetchPharmaciesService,
  removePharmacyFromChain, updateChainService,
  type Chain, type MembershipSummary, type PharmacySummary,
} from '@chemisttasker/shared-core';
import { ActivityIndicator, Button, Chip, Divider, Snackbar, Surface, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContentState } from '@/components/ui';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';
import { resolveApiBaseUrl } from '@/utils/apiUrl';

type MemberRows = Record<number, MembershipSummary[] | 'error'>;
type Editor = 'create' | 'edit' | null;

const memberName = (row: MembershipSummary) =>
  [row.userDetails?.firstName, row.userDetails?.lastName].filter(Boolean).join(' ').trim()
  || row.invitedName || row.userDetails?.email || 'Team member';

export default function ChainScreen() {
  const router = useRouter();
  const generation = useRef(0);
  const selectedChainRef = useRef<number | null>(null);
  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [allPharmacies, setAllPharmacies] = useState<PharmacySummary[]>([]);
  const [members, setMembers] = useState<MemberRows>({});
  const [chainPharmacies, setChainPharmacies] = useState<PharmacySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Editor>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [logoFile, setLogoFile] = useState<{uri: string; name: string; type: string} | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const chain = chains.find((item) => item.id === chainId) ?? null;
  const logoUrl = (() => {
    if (!chain?.logo) return null;
    try {
      const base = resolveApiBaseUrl();
      const resolved = new URL(chain.logo, base ? new URL(base).origin : undefined);
      return resolved.protocol === 'https:' || resolved.protocol === 'http:' ? resolved.toString() : null;
    } catch {
      return null;
    }
  })();

  const load = useCallback(async (preferredId?: number | null) => {
    const request = ++generation.current;
    setLoading(true);
    setLoadError(false);
    try {
      const [nextChains, pharmacies] = await Promise.all([fetchChainsService(), fetchPharmaciesService({})]);
      if (generation.current !== request) return;
      const selected = nextChains.find((item) => item.id === (preferredId ?? selectedChainRef.current)) ?? nextChains[0] ?? null;
      selectedChainRef.current = selected?.id ?? null;
      setChains(nextChains);
      setChainId(selected?.id ?? null);
      setAllPharmacies(pharmacies as PharmacySummary[]);
      setMembers({});
      if (selected) {
        const linked = await fetchChainPharmaciesService(selected.id);
        if (generation.current !== request) return;
        setChainPharmacies(linked as PharmacySummary[]);
        // Independent failure for one pharmacy must not hide the other locations.
        await Promise.all((linked as PharmacySummary[]).map(async (pharmacy) => {
          try {
            const rows = await fetchMembershipsByPharmacy(pharmacy.id);
            if (generation.current === request) setMembers((prev) => ({ ...prev, [pharmacy.id]: rows }));
          } catch {
            if (generation.current === request) setMembers((prev) => ({ ...prev, [pharmacy.id]: 'error' }));
          }
        }));
      } else {
        setChainPharmacies([]);
      }
    } catch {
      if (generation.current === request) setLoadError(true);
    } finally {
      if (generation.current === request) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]));

  const beginEditor = (mode: 'create' | 'edit') => {
    setName(mode === 'edit' ? chain?.name ?? '' : '');
    setEmail(mode === 'edit' ? chain?.primaryContactEmail ?? '' : '');
    setLogoFile(null);
    setEditor(mode);
  };

  const chooseLogo = async () => {
    if (busy) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], quality: 0.85, allowsEditing: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const image = result.assets[0];
      if (image.fileSize && image.fileSize > 5 * 1024 * 1024) {
        setNotice('Choose a chain logo smaller than 5 MB');
        return;
      }
      setLogoFile({
        uri: image.uri,
        name: image.fileName || 'chain-logo.jpg',
        type: image.mimeType || 'image/jpeg',
      });
    } catch {
      setNotice('Could not open the photo library');
    }
  };

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const data = new FormData();
      data.append('name', name.trim());
      data.append('primary_contact_email', email.trim());
      if (logoFile) data.append('logo', logoFile as any);
      const saved = editor === 'edit' && chain
        ? await updateChainService(chain.id, data)
        : await createChainService(data);
      setEditor(null);
      setNotice(editor === 'edit' ? 'Chain updated' : 'Chain created');
      await load(saved.id);
    } catch {
      setNotice('Could not save chain. Check your details and try again.');
    } finally { setBusy(false); }
  };

  const deleteCurrentChain = () => {
    if (!chain || busy) return;
    const selectedId = chain.id;
    Alert.alert('Delete chain?', 'The chain record will be deleted. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete chain', style: 'destructive', onPress: () => {
        setBusy(true);
        void deleteChainService(selectedId)
          .then(async () => { setNotice('Chain deleted'); await load(null); })
          .catch(() => setNotice('Could not delete the chain'))
          .finally(() => setBusy(false));
      } },
    ]);
  };

  const editPharmacy = async (pharmacyId: number, add: boolean) => {
    if (!chain || busy) return;
    setBusy(true);
    try {
      if (add) await addPharmacyToChain(chain.id, pharmacyId);
      else await removePharmacyFromChain(chain.id, pharmacyId);
      setNotice(add ? 'Pharmacy added to chain' : 'Pharmacy removed from chain');
      setShowAdd(false);
      await load(chain.id);
    } catch {
      setNotice('Could not update this chain pharmacy. Your other pharmacies are unchanged.');
      await load(chain.id);
    } finally { setBusy(false); }
  };

  const requestRemove = (pharmacy: PharmacySummary) => {
    Alert.alert('Remove from chain?', 'Remove ' + pharmacy.name + ' from this chain? The pharmacy record is not deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { void editPharmacy(pharmacy.id, false); } },
    ]);
  };
  const linkedIds = new Set(chainPharmacies.map((p) => p.id));
  const available = allPharmacies.filter((p) => !linkedIds.has(p.id));

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.page}>
      {loading ? (
        <ContentState kind="loading" title="Loading your pharmacy chain" />
      ) : loadError ? (
        <ContentState kind="error" title="Unable to load your chain" description="Your current selection is unchanged. Check the connection and retry." actionLabel="Try again" onAction={() => void load(chainId)} />
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Building2 size={28} color={colors.primary} strokeWidth={1.8} />
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>My chain</Text>
              <Text style={styles.subtext}>Manage pharmacies and view staff in one place.</Text>
            </View>
          </View>
          {chains.length > 1 ? (
            <View style={styles.stack}>
              <Text style={styles.section}>Choose chain</Text>
              <View style={styles.pills}>
                {chains.map((item) => <Chip key={item.id} selected={item.id === chainId} onPress={() => {
                  selectedChainRef.current = item.id; setChainId(item.id); void load(item.id);
                }}>{item.name}</Chip>)}
              </View>
            </View>
          ) : null}
          {editor ? (
            <Surface style={styles.card} elevation={0}>
              <Text style={styles.section}>{editor === 'edit' ? 'Edit chain' : 'Create a chain'}</Text>
              <TextInput mode="outlined" label="Chain name" value={name} onChangeText={setName} maxLength={120} />
              <TextInput mode="outlined" label="Contact email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              {logoFile ? <Image source={{ uri: logoFile.uri }} style={styles.logo} contentFit="contain" accessibilityLabel="Selected chain logo" /> : null}
              <Button mode="outlined" icon="image-outline" onPress={() => void chooseLogo()} disabled={busy}>
                {logoFile ? 'Change selected logo' : 'Choose chain logo'}
              </Button>
              <View style={styles.actions}>
                <Button mode="outlined" onPress={() => setEditor(null)} disabled={busy}>Cancel</Button>
                <Button mode="contained" onPress={() => void save()} loading={busy} disabled={busy || !name.trim()}>Save chain</Button>
              </View>
            </Surface>
          ) : !chain ? (
            <Surface style={styles.card} elevation={0}>
              <Text style={styles.section}>Create your first chain</Text>
              <Text style={styles.subtext}>Group pharmacies you manage. The server verifies which pharmacies you can link.</Text>
              <Button mode="contained" onPress={() => beginEditor('create')}>Create chain</Button>
            </Surface>
          ) : (
            <>
              <Surface style={styles.card} elevation={0}>
                {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.logo} contentFit="contain" accessibilityLabel="Chain logo" /> : null}
                <Text style={styles.section}>{chain.name}</Text>
                <Text style={styles.subtext}>{chain.primaryContactEmail || 'No contact email'}</Text>
                <View style={styles.actions}>
                  <Button mode="outlined" onPress={() => beginEditor('edit')} disabled={busy}>Edit</Button>
                  <Button mode="text" textColor={colors.status.red.fg} onPress={deleteCurrentChain} disabled={busy}>Delete</Button>
                </View>
              </Surface>
              <View style={styles.header}>
                <Text style={[styles.section, { flex: 1 }]}>Pharmacies & staff</Text>
                <Button mode="outlined" onPress={() => setShowAdd((v) => !v)} disabled={busy} icon={showAdd ? 'close' : 'plus'}>
                  {showAdd ? 'Close' : 'Add'}
                </Button>
              </View>
              {showAdd ? (
                <Surface style={styles.card} elevation={0}>
                  <Text style={styles.section}>Add a pharmacy</Text>
                  {available.length === 0 ? <Text style={styles.subtext}>All available pharmacies are linked.</Text> : available.map((p) =>
                    <View key={p.id} style={styles.pharmacyRow}>
                      <Text style={[styles.body, { flex: 1 }]}>{p.name}</Text>
                      <Button compact mode="text" disabled={busy} onPress={() => void editPharmacy(p.id, true)}>Add</Button>
                    </View>
                  )}
                </Surface>
              ) : null}
              {chainPharmacies.length === 0 ? (
                <ContentState kind="empty" title="No pharmacies linked" description="Add a pharmacy above to organise staff by location." />
              ) : chainPharmacies.map((pharmacy) => (
                <Surface key={pharmacy.id} style={styles.card} elevation={0}>
                  <View style={styles.pharmacyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.section}>{pharmacy.name}</Text>
                      <Text style={styles.subtext}>{Array.isArray(members[pharmacy.id]) ? members[pharmacy.id].length + ' team members' : members[pharmacy.id] === 'error' ? 'Staff unavailable' : 'Loading staff...'}</Text>
                    </View>
                    <Button compact mode="text" icon="chevron-right" onPress={() => router.push(('/owner/pharmacies/' + pharmacy.id + '/staff') as any)} accessibilityLabel={'View staff for ' + pharmacy.name}>View staff</Button>
                  </View>
                  <Divider />
                  {members[pharmacy.id] === 'error' ? (
                    <Button mode="text" onPress={() => void load(chain.id)}>Retry staff load</Button>
                  ) : (Array.isArray(members[pharmacy.id]) ? members[pharmacy.id] : []).slice(0, 5).map((member) => (
                    <Text key={member.id} style={styles.memberText}>{memberName(member)}{member.role ? ' · ' + member.role.replaceAll('_', ' ').toLowerCase() : ''}</Text>
                  ))}
                  <Button mode="text" textColor={colors.status.red.fg} disabled={busy} onPress={() => requestRemove(pharmacy)}>
                    Remove from chain
                  </Button>
                </Surface>
              ))}
            </>
          )}
        </ScrollView>
      )}
      {busy ? <ActivityIndicator style={styles.busy} color={colors.primary} /> : null}
      <Snackbar visible={Boolean(notice)} onDismiss={() => setNotice('')} duration={4000}>{notice}</Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.xl, paddingBottom: space['3xl'], gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  heading: { fontFamily: font.outfit.medium, fontSize: type.headlineMedium.fontSize, color: colors.textPrimary },
  section: { fontFamily: font.outfit.medium, fontSize: type.titleLarge.fontSize, color: colors.textPrimary },
  body: { fontFamily: font.inter.regular, fontSize: type.bodyMedium.fontSize, color: colors.textPrimary },
  subtext: { fontFamily: font.inter.regular, fontSize: type.bodyMedium.fontSize, color: colors.textSecondary },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surfaceBg, padding: space.lg, gap: space.md },
  stack: { gap: space.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  pharmacyRow: { flexDirection: 'row', alignItems: 'center', minHeight: touch.min, gap: space.sm },
  logo: { width: 68, height: 68, borderRadius: radius.control },
  memberText: { fontFamily: font.inter.regular, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight, color: colors.textSecondary },
  busy: { position: 'absolute', bottom: space.xl, alignSelf: 'center' },
});
