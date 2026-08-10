import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Button, Modal, Portal, Text, TextInput, IconButton, HelperText, Chip, Checkbox } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import {
  fetchPharmacyGroupMembers,
  fetchOrganizationMembers,
  fetchHubGroupMembers,
  createHubPost,
  updateHubPost,
} from './api';
import type { HubPost, HubPostPayload } from './types';
import { SubmissionNotice, useSubmissionGuard } from './submissionGuard';
import { useAuth } from '@/context/AuthContext';

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  const responseDetail = (
    error as { response?: { data?: { detail?: string } } } | null
  )?.response?.data?.detail;
  if (typeof responseDetail === 'string' && responseDetail.trim()) {
    return responseDetail.trim();
  }
  const detail = (error as { detail?: string } | null)?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }
  return fallback;
};

const STAFF_EMPLOYMENT_TYPES = new Set(['FULL_TIME', 'PART_TIME', 'CASUAL']);
const filterPharmacyStaffMembers = (members: any[]) =>
  members.filter((member) => STAFF_EMPLOYMENT_TYPES.has(member?.employmentType || member?.employment_type || ''));

const isEmailLike = (value?: string | null) => Boolean(value && value.includes('@'));
const getMemberDisplayName = (member: any, fallback = 'Member') => {
  const firstLast = `${member?.firstName ?? member?.first_name ?? ''} ${member?.lastName ?? member?.last_name ?? ''}`.trim();
  const candidates = [
    member?.fullName,
    member?.full_name,
    firstLast,
    member?.invitedName,
    member?.invited_name,
    member?.username,
  ];
  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate.trim() : '';
    if (value && !isEmailLike(value)) {
      return value;
    }
  }
  const id = member?.membershipId ?? member?.membership_id ?? member?.id;
  return id ? `${fallback} ${id}` : fallback;
};

type Scope =
  | { type: 'pharmacy'; id: number }
  | { type: 'organization'; id: number }
  | { type: 'group'; id: number }
  | { type: 'orgGroup'; id: number }
  | { type: 'platform'; id: string }
  | null;

type Props = {
  visible: boolean;
  onDismiss: () => void;
  scope: Scope;
  onSaved: (post: HubPost, mode: 'create' | 'edit') => void | Promise<void>;
  editing?: HubPost | null;
};

export function PostComposer({ visible, onDismiss, scope, onSaved, editing }: Props) {
  const { user } = useAuth();
  const [body, setBody] = useState(editing?.body || '');
  const [attachments, setAttachments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [taggedMemberIds, setTaggedMemberIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const submission = useSubmissionGuard();

  const stableScope = useMemo(() => {
    if (!scope || scope.id == null) return null;
    if (scope.type === 'platform') {
      return { type: 'platform' as const, id: String(scope.id) };
    }
    const idNum = typeof scope.id === 'string' ? Number(scope.id) : scope.id;
    if (!Number.isFinite(idNum)) return null;
    const normalizedType = scope.type === 'orgGroup' ? 'group' : scope.type;
    return { type: normalizedType as 'pharmacy' | 'organization' | 'group', id: idNum };
  }, [scope]);

  const loadMembers = async () => {
    if (!stableScope) {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    setMemberError(null);
    try {
      let resp: any = [];
      if (stableScope.type === 'pharmacy') {
        resp = await fetchPharmacyGroupMembers(stableScope.id as any);
      } else if (stableScope.type === 'organization') {
        resp = await fetchOrganizationMembers(stableScope.id as any);
      } else if (stableScope.type === 'group') {
        resp = await fetchHubGroupMembers(stableScope.id as any);
      } else {
        resp = [];
      }
      const normalized = Array.isArray(resp?.results) ? resp.results : Array.isArray(resp) ? resp : [];
      setMembers(
        filterPharmacyStaffMembers(normalized).filter((member: any) => user?.id == null || member?.userId !== user.id),
      );
    } catch (err: any) {
      setMemberError(err?.message || 'Failed to load members');
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadMembers();
    } else {
      setMembers([]);
      setTaggedMemberIds([]);
      setMemberError(null);
      setAttachments([]);
      setBody(editing?.body || '');
    }
  }, [visible, stableScope, editing]);

  const pickFiles = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      setAttachments((prev) => [...prev, ...res.assets]);
    } catch (err: any) {
      setError(err?.message || 'File pick failed');
    }
  };

  const normalizeAttachments = async () => {
    const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || null;
    return Promise.all(
      attachments.map(async (file, idx) => {
        const name = file.name || `attachment-${idx}`;
        const type = file.mimeType || 'application/octet-stream';
        let uri = file.uri;

        if (Platform.OS === 'web') {
          // On web, fetch the blob and build a File so FormData sends bytes.
          const resp = await fetch(uri);
          const blob = await resp.blob();
          return new File([blob], name, { type: blob.type || type }) as any;
        }

        if (uri && Platform.OS === 'android' && uri.startsWith('content://') && cacheDir) {
          try {
            const ext = (file.name && file.name.split('.').pop()) || 'bin';
            const target = `${cacheDir}hub-attach-${Date.now()}-${idx}.${ext}`;
            await FileSystem.copyAsync({ from: uri, to: target });
            uri = target;
          } catch {
            // fallback to original URI
          }
        }

        return {
          uri,
          name,
          type,
        };
      }),
    );
  };

  const handleSave = async () => {
    if (!stableScope) {
      setError('Select a space first.');
      return;
    }
    if (!body.trim()) {
      setError('Add some text before posting.');
      return;
    }
    if (!submission.start()) {
      return;
    }
    setError(null);
    try {
      const files = await normalizeAttachments();

      const payload: HubPostPayload = {
        body: body.trim(),
        visibility: 'NORMAL' as any,
        allowComments: true,
      };
      if (taggedMemberIds.length) {
        payload.taggedMemberIds = Array.from(new Set(taggedMemberIds));
      }
      if (files.length) {
        payload.attachments = files as any;
      }
      let savedPost: HubPost;
      if (editing?.id) {
        savedPost = await updateHubPost(editing.id, payload as any);
      } else {
        savedPost = await createHubPost(stableScope as any, payload as any);
      }
      await onSaved(savedPost, editing?.id ? 'edit' : 'create');
      onDismiss();
      setBody('');
      setAttachments([]);
      setTaggedMemberIds([]);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Save failed'));
    } finally {
      submission.finish();
    }
  };

  const handleDismiss = () => {
    if (submission.submitting) {
      return;
    }
    onDismiss();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleDismiss}
        dismissable={!submission.submitting}
        dismissableBackButton={!submission.submitting}
        contentContainerStyle={styles.modal}
      >
        <View style={styles.header}>
          <Text variant="titleMedium">{editing ? 'Edit post' : 'New post'}</Text>
          <IconButton icon="close" onPress={handleDismiss} disabled={submission.submitting} />
        </View>
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}
        {submission.submitting ? (
          <SubmissionNotice message="Posting your update. Please wait and keep this screen open." />
        ) : null}
        <TextInput
          label="Share an update"
          value={body}
          onChangeText={(value) => {
            setBody(value);
            if (error) {
              setError(null);
            }
          }}
          multiline
          mode="outlined"
          numberOfLines={4}
          disabled={submission.submitting}
          style={{ marginBottom: 8 }}
        />
        <View style={styles.attachmentRow}>
          <Button compact mode="text" icon="paperclip" onPress={pickFiles} disabled={submission.submitting}>
            Attach
          </Button>
          <Text style={styles.muted}>{attachments.length ? `${attachments.length} file(s)` : 'No attachments'}</Text>
        </View>
        {attachments.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 8 }}>
            {attachments.map((file, index) => (
              <Chip
                key={`${file.name}-${index}`}
                icon="file"
                onClose={submission.submitting ? undefined : () => setAttachments((prev) => prev.filter((_, i) => i !== index))}
              >
                {file.name}
              </Chip>
            ))}
          </View>
        )}
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontWeight: '600', marginBottom: 4 }}>Tag members</Text>
          {membersLoading ? (
            <Text style={styles.muted}>Loading members...</Text>
          ) : memberError ? (
            <HelperText type="error">{memberError}</HelperText>
          ) : members.length ? (
            <View style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 8, maxHeight: 180 }}>
              {members.map((m) => {
                const id = m.membershipId || m.membership_id || m.id;
                const name = getMemberDisplayName(m);
                const checked = taggedMemberIds.includes(id);
                return (
                  <View key={id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8 }}>
                    <Checkbox
                      status={checked ? 'checked' : 'unchecked'}
                      disabled={submission.submitting}
                      onPress={() =>
                        setTaggedMemberIds((prev) =>
                          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                        )
                      }
                    />
                    <View style={{ flex: 1 }}>
                      <Text>{name}</Text>
                      {m.role || m.pharmacyName ? (
                        <Text style={styles.muted}>
                          {[m.role, m.pharmacyName || m.pharmacy_name].filter(Boolean).join(' | ')}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.muted}>No members available to tag.</Text>
          )}
          {taggedMemberIds.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {taggedMemberIds.map((id) => {
                const member = members.find((m) => (m.membershipId || m.membership_id || m.id) === id);
                const label = member
                  ? `${getMemberDisplayName(member)}${
                      member.pharmacyName || member.pharmacy_name ? ' @ ' + (member.pharmacyName || member.pharmacy_name) : ''
                    }`
                  : `Member #${id}`;
                return (
                  <Chip
                    key={id}
                    onClose={submission.submitting ? undefined : () => setTaggedMemberIds((prev) => prev.filter((x) => x !== id))}
                    compact
                  >
                    {label}
                  </Chip>
                );
              })}
            </View>
          ) : null}
        </View>
        <Button
          mode="contained"
          onPress={handleSave}
          disabled={submission.submitting || !stableScope}
          loading={submission.submitting}
          style={{ marginTop: 8 }}
        >
          {submission.submitting ? (editing ? 'Saving...' : 'Posting...') : editing ? 'Save changes' : 'Post'}
        </Button>
      </Modal>
    </Portal>
  );
}

export default PostComposer;

const styles = StyleSheet.create({
  modal: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  muted: { color: '#6B7280' },
  attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorBannerText: {
    color: '#B91C1C',
    fontWeight: '600',
  },
});
