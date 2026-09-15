import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, IconButton, Modal, Portal, Snackbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '@/utils/apiClient';

type Membership = {
  id: number;
  role: string;
  employment_type: string;
  job_title?: string;
  is_pharmacy_admin?: boolean;
  admin_level_label?: string | null;
  admin_capabilities?: string[];
  capabilities?: string[];
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'LEFT';
  pharmacy_detail?: {
    name?: string;
    suburb?: string | null;
    state?: string | null;
    postcode?: string | null;
  };
  invited_by_details?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
};

function label(value?: string | null) {
  return value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : 'Not set';
}

function invitedBy(membership: Membership) {
  const user = membership.invited_by_details;
  const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
  return fullName || user?.email || 'Pharmacy admin';
}

function adminCapabilitiesText(membership: Membership) {
  const capabilities = membership.admin_capabilities || membership.capabilities || [];
  if (!capabilities.length) return '';
  return `Capabilities: ${capabilities.map((capability) => capability.replace(/_/g, ' ').toLowerCase()).join(', ')}`;
}

export default function ManageMembershipsScreen() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quitTarget, setQuitTarget] = useState<Membership | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadMemberships = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/client-profile/my-memberships/');
      setMemberships(Array.isArray(data) ? data : data?.results || []);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Unable to load memberships.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadMemberships();
  }, [loadMemberships]);

  const runAction = async (membership: Membership, action: 'accept' | 'reject' | 'quit') => {
    setActingId(membership.id);
    try {
      await apiClient.post(`/client-profile/my-memberships/${membership.id}/${action}/`);
      await loadMemberships();
      setQuitTarget(null);
      setToast(
        action === 'quit'
          ? 'Membership left.'
          : action === 'accept'
            ? 'Invitation accepted.'
            : 'Invitation rejected.'
      );
    } catch (err: any) {
      Alert.alert('Membership update failed', err?.response?.data?.detail || `Unable to ${action} membership.`);
    } finally {
      setActingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadMemberships(); }} tintColor="#6366F1" />}
      >
        <View style={styles.header}>
          <Text variant="headlineSmall" style={styles.title}>Manage Memberships</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>Review pharmacy invitations and manage the pharmacies you belong to.</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <Text style={styles.emptyText}>Loading memberships...</Text> : null}
        {!loading && memberships.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.cardTitle}>No memberships yet</Text>
              <Text style={styles.muted}>Pharmacy invitations will appear here when an owner or admin invites you.</Text>
            </Card.Content>
          </Card>
        ) : null}

        {memberships.map((membership) => {
          const pharmacy = membership.pharmacy_detail;
          const pending = membership.status === 'PENDING';
          const accepted = membership.status === 'ACCEPTED';
          const capabilitiesText = adminCapabilitiesText(membership);
          return (
            <Card key={membership.id} style={styles.card}>
              <Card.Content>
                <View style={styles.cardHeader}>
                  <View style={styles.iconWrap}>
                    <IconButton icon="store-outline" size={22} iconColor="#6366F1" />
                  </View>
                  <View style={styles.cardHeaderText}>
                    <Text variant="titleMedium" style={styles.cardTitle}>{pharmacy?.name || 'Pharmacy'}</Text>
                    <Text style={styles.muted}>
                      {membership.is_pharmacy_admin
                        ? `Admin · ${membership.admin_level_label || 'Admin'}`
                        : `${label(membership.role)} · ${label(membership.employment_type)}`}
                      {membership.job_title ? ` · ${membership.job_title}` : ''}
                    </Text>
                  </View>
                  <Chip compact style={[styles.chip, pending ? styles.pendingChip : accepted ? styles.acceptedChip : styles.neutralChip]}>
                    {label(membership.status)}
                  </Chip>
                </View>
                <Text style={styles.detail}>{[pharmacy?.suburb, pharmacy?.state, pharmacy?.postcode].filter(Boolean).join(', ') || 'Address details not provided'}</Text>
                {membership.is_pharmacy_admin && capabilitiesText ? (
                  <Text style={styles.detail}>{capabilitiesText}</Text>
                ) : null}
                <Text style={styles.detail}>Invited by {invitedBy(membership)}</Text>
                <View style={styles.actions}>
                  {pending ? (
                    <>
                      <Button mode="contained" icon="check-circle-outline" loading={actingId === membership.id} onPress={() => runAction(membership, 'accept')} style={styles.primaryButton}>Accept</Button>
                      <Button mode="outlined" icon="close-circle-outline" disabled={actingId === membership.id} onPress={() => runAction(membership, 'reject')} textColor="#DC2626" style={styles.dangerOutline}>Reject</Button>
                    </>
                  ) : null}
                  {accepted && membership.role !== 'OWNER' ? (
                    <Button mode="outlined" icon="logout" disabled={actingId === membership.id} onPress={() => setQuitTarget(membership)} textColor="#DC2626" style={styles.dangerOutline}>Quit membership</Button>
                  ) : null}
                </View>
              </Card.Content>
            </Card>
          );
        })}
      </ScrollView>
      <Portal>
        <Modal
          visible={Boolean(quitTarget)}
          onDismiss={() => {
            if (!actingId) setQuitTarget(null);
          }}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleLarge" style={styles.modalTitle}>Quit membership?</Text>
          <Text style={styles.modalBody}>
            This action cannot be undone. If you want to join this pharmacy again, the owner or admin will need to invite you all over again.
          </Text>
          <View style={styles.modalActions}>
            <Button mode="outlined" disabled={Boolean(actingId)} onPress={() => setQuitTarget(null)} style={styles.modalButton}>
              Cancel
            </Button>
            <Button
              mode="contained"
              buttonColor="#DC2626"
              loading={actingId === quitTarget?.id}
              disabled={!quitTarget || Boolean(actingId)}
              onPress={() => quitTarget && runAction(quitTarget, 'quit')}
              style={styles.modalButton}
            >
              Quit membership
            </Button>
          </View>
        </Modal>
      </Portal>
      <Snackbar visible={Boolean(toast)} onDismiss={() => setToast(null)} duration={3500}>
        {toast}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 20, paddingBottom: 32 },
  header: { marginBottom: 18 },
  title: { color: '#111827', fontWeight: '900' },
  subtitle: { color: '#6B7280', marginTop: 6 },
  error: { color: '#DC2626', marginBottom: 12, fontWeight: '700' },
  emptyText: { color: '#6B7280', textAlign: 'center', marginTop: 20 },
  emptyCard: { borderRadius: 16, backgroundColor: '#FFFFFF' },
  card: { borderRadius: 16, backgroundColor: '#FFFFFF', marginBottom: 14, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  cardHeaderText: { flex: 1 },
  cardTitle: { color: '#111827', fontWeight: '800' },
  muted: { color: '#6B7280', marginTop: 2 },
  detail: { color: '#6B7280', marginTop: 8, fontSize: 13 },
  chip: { alignSelf: 'flex-start' },
  pendingChip: { backgroundColor: '#FEF3C7' },
  acceptedChip: { backgroundColor: '#D1FAE5' },
  neutralChip: { backgroundColor: '#E5E7EB' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  primaryButton: { borderRadius: 999 },
  dangerOutline: { borderRadius: 999, borderColor: '#FCA5A5' },
  modal: { margin: 20, padding: 20, borderRadius: 16, backgroundColor: '#FFFFFF' },
  modalTitle: { color: '#111827', fontWeight: '900', marginBottom: 8 },
  modalBody: { color: '#6B7280', lineHeight: 20 },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 18 },
  modalButton: { borderRadius: 999 },
});
