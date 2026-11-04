import React, { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import { Button, Chip, Text } from 'react-native-paper';
import { createMembershipInviteLinkService, fetchPharmaciesService } from '@chemisttasker/shared-core';
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
    role.startsWith('ORG_') || role === 'REGION_ADMIN' ||
    role === 'CHIEF_ADMIN' || role === 'PHARMACY_MANAGER';
  const [pharmacies, setPharmacies] = useState<PharmacyChoice[]>([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [category, setCategory] = useState<Category>('LOCUM_CASUAL');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');

  useEffect(() => {
    let live = true;
    setPharmacies([]);
    setPharmacyId('');
    setInviteUrl('');
    if (!user?.id) return () => { live = false; };
    setLoading(true);
    void fetchPharmaciesService({}).then((response: any) => {
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
  }, [user?.id, selectedPharmacyId, roleMayManage, hasCapability]);

  const createInvite = async () => {
    if (!pharmacyId || sending || !pharmacies.some(row => row.id === pharmacyId)) return;
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
    if (!pharmacyId || sending) return;
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
    <Text variant="titleMedium">Invite this professional to your pharmacy</Text>
    <Text style={styles.muted}>Worker public reference: {referenceCode}. The service does not expose the worker email or create a targeted invitation. Choose the pharmacy and share its application link with the intended person.</Text>
    {loading ? <Text style={styles.muted}>Loading authorised pharmacies…</Text> : null}
    {pharmacies.length ? <>
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
      <Button mode="outlined" disabled={!pharmacyId || loading || sending} loading={sending} onPress={confirm}>
        Generate review-required invitation
      </Button>
      {inviteUrl ? <>
        <Text selectable style={styles.muted}>{inviteUrl}</Text>
        <Button mode="contained" onPress={() => void share()}>Share invitation with intended worker</Button>
        <Text style={styles.muted}>The worker must submit the form. The pharmacy must still review and approve it.</Text>
      </> : null}
    </> : !loading ? <Text style={styles.muted}>No pharmacy with invitation access is currently available in your account.</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  group: { gap: space.sm, marginTop: space.md },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  muted: { color: colors.textSecondary, lineHeight: 21 },
  error: { color: colors.status.red.fg },
});
