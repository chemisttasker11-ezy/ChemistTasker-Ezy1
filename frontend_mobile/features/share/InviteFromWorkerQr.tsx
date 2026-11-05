import React, { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import { Button, Chip, Text } from 'react-native-paper';
import { createMembershipInviteLinkService, fetchPharmaciesService, getPublicTalentFeed } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { colors, space } from '@/constants/tokens';

type PharmacyChoice = { id: string; name: string };
type Category = 'FULL_PART_TIME' | 'LOCUM_CASUAL';

/** Scanning a public talent listing never identifies a private invitation recipient.
 * This generates an explicitly approved, reusable pharmacy invite link using the existing
 * permission-checked server path. The intended worker must separately apply and be approved.
 */
export default function InviteFromWorkerQr({ referenceCode }: { referenceCode: string }) {
  const { user, hasCapability } = useAuth();
  const { selectedPharmacyId } = useWorkspace();
  const role = String(user?.role || '').toUpperCase();
  const roleMayManage = role === 'OWNER' || role === 'ORGANIZATION' ||
    ['ORG_OWNER', 'ORG_ADMIN'].includes(role) || role === 'REGION_ADMIN' ||
    role === 'CHIEF_ADMIN' || role === 'PHARMACY_MANAGER';
  const [pharmacies, setPharmacies] = useState<PharmacyChoice[]>([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [category, setCategory] = useState<Category>('LOCUM_CASUAL');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [verified, setVerified] = useState(false);
  const [workerLabel, setWorkerLabel] = useState('');

  useEffect(() => {
    let live = true;
    setPharmacies([]);
    setPharmacyId('');
    setInviteUrl('');
    setVerified(false);
    setWorkerLabel('');
    if (!user?.id) return () => { live = false; };
    setLoading(true);
    // A forged/unpublished QR can never open invitation creation without a fresh public lookup.
    void Promise.all([
      getPublicTalentFeed({ reference_code: referenceCode, page_size: 2 }),
      fetchPharmaciesService({}),
    ]).then(([publicResult, response]: [any, any]) => {
      if (!live) return;
      const publicRows: any[] = Array.isArray(publicResult?.results) ? publicResult.results :
        Array.isArray(publicResult) ? publicResult : [];
      const published = publicRows.find(row => row?.reference_code === referenceCode);
      if (!published) {
        setError('This worker listing is no longer public. No invitation can be generated.');
        return;
      }
      setVerified(true);
      setWorkerLabel(String(published.headline || 'Public worker listing').slice(0, 120));
      if (!live) return;
      const rows: any[] = Array.isArray(response?.results) ? response.results :
        Array.isArray(response) ? response : [];
      // Client-side capability filtering is convenience only; the backend rechecks on create.
      const allowed = rows.filter(row => {
        const id = Number(row?.id ?? row?.pharmacy_id);
        return Number.isSafeInteger(id) && id > 0 &&
          (roleMayManage || hasCapability('MANAGE_STAFF', id));
      }).map(row => ({
        id: String(row.id ?? row.pharmacy_id),
        name: String(row.name || row.pharmacy_name || 'Pharmacy').slice(0, 120),
      }));
      setPharmacies(allowed);
      const current = allowed.find(row => row.id === String(selectedPharmacyId));
      setPharmacyId(current?.id || (allowed.length === 1 ? allowed[0].id : ''));
      setError('');
    }).catch(() => {
      if (live) setError('Pharmacy choices could not be loaded. Reopen the scanner to retry.');
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [user?.id, selectedPharmacyId, roleMayManage, hasCapability, referenceCode]);

  const createInvite = async () => {
    if (!verified || !pharmacyId || sending || !pharmacies.some(row => row.id === pharmacyId)) return;
    setSending(true);
    setInviteUrl('');
    setError('');
    try {
      const response = await createMembershipInviteLinkService({
        pharmacy: pharmacyId,
        category,
        expires_in_days: 14,
      });
      const token = String(response?.token || '');
      if (!/^[0-9a-fA-F-]{36}$/.test(token)) throw new Error('The invitation response was invalid.');
      setInviteUrl('https://chemisttasker.com.au/membership/apply/' + token);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'The pharmacy could not create this invitation. Verify that you have permission to manage its staff.');
    } finally {
      setSending(false);
    }
  };

  const confirm = () => {
    if (!verified || !pharmacyId || sending) return;
    Alert.alert('Generate pharmacy invitation?', 'This creates a reusable 14-day link for the selected pharmacy. It is NOT addressed to the scanned worker, and sharing it does not add a member or grant favourite access.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Generate link', onPress: () => void createInvite() },
    ]);
  };

  const share = async () => {
    if (!inviteUrl) return;
    try {
      await Share.share({
        message: 'ChemistTasker pharmacy membership invitation. Please review the application and submit it for pharmacy approval: ' + inviteUrl,
      });
    } catch { setError('Could not open the device sharing options.'); }
  };

  if (!user || (!roleMayManage && !pharmacies.length && !loading)) return null;
  return <View style={styles.group}>
    <Text variant="titleMedium">Create a pharmacy invitation link</Text>
    <Text style={styles.muted}>Public worker reference: {referenceCode}. {verified ? workerLabel : 'Checking listing visibility…'} The QR identifies a public listing only. The invitation is not addressed to that worker, and does not reveal private contact information.</Text>
    {loading ? <Text style={styles.muted}>Loading authorised pharmacies…</Text> : null}
    {pharmacies.length && verified ? <>
      <Text style={styles.muted}>Select pharmacy</Text>
      <View style={styles.options}>{pharmacies.map(row =>
        <Chip key={row.id} selected={pharmacyId === row.id} onPress={() => {setPharmacyId(row.id);setInviteUrl('');}}>
          {row.name}
        </Chip>
      )}</View>
      <Text style={styles.muted}>Choose application category</Text>
      <View style={styles.options}>
        <Chip selected={category === 'FULL_PART_TIME'} onPress={() => {setCategory('FULL_PART_TIME');setInviteUrl('');}}>Staff employment</Chip>
        <Chip selected={category === 'LOCUM_CASUAL'} onPress={() => {setCategory('LOCUM_CASUAL');setInviteUrl('');}}>Favourite / locum</Chip>
      </View>
      <Button mode="outlined" disabled={!verified || !pharmacyId || loading || sending} loading={sending} onPress={confirm}>
        Create reusable application link
      </Button>
      {inviteUrl ? <>
        <Text selectable style={styles.muted}>{inviteUrl}</Text>
        <Button mode="contained" onPress={() => void share()}>Share link with a worker</Button>
        <Text style={styles.muted}>This link is reusable for 14 days. Anyone who receives it can apply, but each application requires pharmacy approval. Scanning a profile never adds a member or favourite automatically.</Text>
      </> : null}
    </> : !loading && verified && !pharmacies.length ? <Text style={styles.muted}>No pharmacy with invitation access is currently available in your account.</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  group: { gap: space.sm, marginTop: space.md },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  muted: { color: colors.textSecondary, lineHeight: 21 },
  error: { color: colors.status.red.fg },
});
