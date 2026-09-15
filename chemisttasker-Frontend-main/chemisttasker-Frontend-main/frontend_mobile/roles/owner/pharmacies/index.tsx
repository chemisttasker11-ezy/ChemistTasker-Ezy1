import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { fetchPharmaciesService, deletePharmacy, PharmacyDTO, getPharmacyClaims, updatePharmacyClaim } from '@chemisttasker/shared-core';
import { fetchMembershipsForPharmacy } from '@/roles/shared/pharmacies/membershipApi';
import PharmaciesListView from '@/roles/shared/pharmacies/PharmaciesListView';
import { Button, Dialog, Portal, Snackbar, Text, TextInput } from 'react-native-paper';

type ClaimStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

type OwnerClaimRequest = {
  id: number;
  status: ClaimStatus;
  status_display?: string;
  message?: string | null;
  response_message?: string | null;
  pharmacy: {
    id: number;
    name: string;
    email: string | null;
  };
  organization: {
    id: number;
    name?: string | null;
  } | null;
  created_at: string;
  responded_at: string | null;
};

type OwnerClaimDialogState = {
  open: boolean;
  claim: OwnerClaimRequest | null;
  action: ClaimStatus | null;
  note: string;
};

type ClaimAwarePharmacy = PharmacyDTO & {
  claimed?: boolean;
  claim_status?: string | null;
  claimStatus?: string | null;
  organization?: number | { id: number; name?: string | null } | null;
  organization_id?: number | null;
  organizationId?: number | null;
};

const initialOwnerClaimDialog: OwnerClaimDialogState = {
  open: false,
  claim: null,
  action: null,
  note: '',
};

export default function PharmaciesListScreen() {
  const router = useRouter();
  const [pharmacies, setPharmacies] = useState<PharmacyDTO[]>([]);
  const [staffCounts, setStaffCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState('');
  const [ownerClaims, setOwnerClaims] = useState<OwnerClaimRequest[]>([]);
  const [ownerClaimsLoading, setOwnerClaimsLoading] = useState(false);
  const [ownerClaimError, setOwnerClaimError] = useState<string | null>(null);
  const [ownerClaimsExpanded, setOwnerClaimsExpanded] = useState(false);
  const [ownerClaimDialog, setOwnerClaimDialog] = useState<OwnerClaimDialogState>(initialOwnerClaimDialog);
  const [respondingToClaim, setRespondingToClaim] = useState(false);

  const loadPharmacies = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await fetchPharmaciesService({});
      // Normalize data
      const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      const normalized: PharmacyDTO[] = list.map((item: any) => ({ ...item, id: String(item.id ?? item.pharmacy_id ?? '') }));

      setPharmacies(normalized);

      // Load counts
      const counts: Record<string, number> = {};
      await Promise.all(
        normalized.map(async (p) => {
          try {
            const memberships: any = await fetchMembershipsForPharmacy(p.id);
            counts[p.id] = Array.isArray(memberships) ? memberships.length : 0;
          } catch {
            counts[p.id] = 0;
          }
        })
      );
      setStaffCounts(counts);
    } catch (err: any) {
      console.error(err);
      setSnackbar('Failed to load pharmacies');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOwnerClaims = useCallback(async () => {
    setOwnerClaimsLoading(true);
    try {
      const res = await getPharmacyClaims({ owned_by_me: true });
      const data = Array.isArray((res as any)?.results)
        ? (res as any).results
        : Array.isArray(res as any)
          ? (res as any)
          : [];
      setOwnerClaims(data);
      setOwnerClaimError(null);
    } catch (err: any) {
      setOwnerClaimError(err?.response?.data?.detail || err?.message || 'Failed to load claim requests.');
    } finally {
      setOwnerClaimsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPharmacies();
      loadOwnerClaims();
    }, [loadPharmacies, loadOwnerClaims])
  );

  const claimedPharmacyCount = pharmacies.filter((pharmacy) => {
    const candidate = pharmacy as ClaimAwarePharmacy;
    const status = String(candidate.claim_status ?? candidate.claimStatus ?? '').toUpperCase();
    return Boolean(
      candidate.claimed ||
      candidate.organization ||
      candidate.organization_id ||
      candidate.organizationId ||
      status === 'ACCEPTED'
    );
  }).length;

  const ownerClaimCounts = {
    pending: ownerClaims.filter((item) => item.status === 'PENDING').length,
    accepted: ownerClaims.filter((item) => item.status === 'ACCEPTED').length,
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePharmacy(id);
      setSnackbar('Pharmacy deleted');
      loadPharmacies();
    } catch (e) {
      setSnackbar('Failed to delete pharmacy');
    }
  };

  const handleOpenOwnerClaimDialog = (claim: OwnerClaimRequest, action: ClaimStatus) => {
    setOwnerClaimDialog({ open: true, claim, action, note: '' });
  };

  const handleCloseOwnerClaimDialog = () => {
    if (respondingToClaim) return;
    setOwnerClaimDialog(initialOwnerClaimDialog);
  };

  const handleRespondToOwnerClaim = async () => {
    if (!ownerClaimDialog.claim || !ownerClaimDialog.action) return;
    setRespondingToClaim(true);
    try {
      await updatePharmacyClaim(ownerClaimDialog.claim.id, {
        status: ownerClaimDialog.action,
        response_message: ownerClaimDialog.note.trim() || undefined,
      });
      setSnackbar(ownerClaimDialog.action === 'ACCEPTED' ? 'Claim accepted.' : 'Claim rejected.');
      setOwnerClaimDialog(initialOwnerClaimDialog);
      await loadOwnerClaims();
    } catch (err: any) {
      setOwnerClaimError(err?.response?.data?.detail || err?.message || 'Failed to update the claim.');
    } finally {
      setRespondingToClaim(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <PharmaciesListView
        pharmacies={pharmacies}
        staffCounts={staffCounts}
        loading={loading}
        showOwnerClaimsSection={claimedPharmacyCount > 0}
        ownerClaims={ownerClaims}
        ownerClaimsLoading={ownerClaimsLoading}
        ownerClaimError={ownerClaimError}
        ownerClaimCounts={ownerClaimCounts}
        ownerClaimsExpanded={ownerClaimsExpanded}
        onToggleOwnerClaims={() => setOwnerClaimsExpanded((prev) => !prev)}
        onRespondToClaim={handleOpenOwnerClaimDialog}
        onOpenPharmacy={(id) => router.push(`/owner/pharmacies/${id}`)}
        onEditPharmacy={(p) => router.push(`/owner/pharmacies/${p.id}/edit`)}
        onDeletePharmacy={handleDelete}
        onAddPharmacy={() => router.push('/owner/pharmacies/add')}
      />
      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar('')}
        duration={3000}
      >
        {snackbar}
      </Snackbar>
      <Portal>
        <Dialog visible={ownerClaimDialog.open} onDismiss={handleCloseOwnerClaimDialog}>
          <Dialog.Title>
            {ownerClaimDialog.action === 'ACCEPTED' ? 'Approve claim request' : 'Reject claim request'}
          </Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              {ownerClaimDialog.claim?.organization?.name || 'This organization'} requested access to{' '}
              {ownerClaimDialog.claim?.pharmacy?.name || 'this pharmacy'}.
            </Text>
            <TextInput
              mode="outlined"
              label="Optional note"
              value={ownerClaimDialog.note}
              onChangeText={(value) => setOwnerClaimDialog((prev) => ({ ...prev, note: value }))}
              multiline
              numberOfLines={4}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={handleCloseOwnerClaimDialog} disabled={respondingToClaim}>Cancel</Button>
            <Button mode="contained" onPress={handleRespondToOwnerClaim} loading={respondingToClaim} disabled={respondingToClaim}>
              Confirm
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  dialogText: {
    marginBottom: 12,
  },
});
