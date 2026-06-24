import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import {
  Avatar,
  Button,
  Card,
  Dialog,
  Divider,
  IconButton,
  List,
  Portal,
  Surface,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { deleteAccount } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import apiClient from '@/utils/apiClient';

const webBaseUrl = 'https://www.chemisttasker.com.au';

const getOrganizationName = (user: any) => {
  const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
  const orgMembership = memberships.find((membership: any) => membership?.organization_name || membership?.organizationName);
  return (
    orgMembership?.organization_name ||
    orgMembership?.organizationName ||
    user?.organization_name ||
    user?.organizationName ||
    user?.username ||
    'Organization'
  );
};

export default function OrganizationProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [referralLoading, setReferralLoading] = useState(false);
  const [pillSummary, setPillSummary] = useState({ balance: 0, shift_post_cost: 0 });

  const appVersion = typeof Constants?.expoConfig?.version === 'string' ? Constants.expoConfig.version : '';
  const organizationName = useMemo(() => getOrganizationName(user), [user]);
  const profilePhoto =
    (user as any)?.profile_photo ||
    (user as any)?.profile_photo_url ||
    (user as any)?.profilePhoto ||
    null;
  const displayEmail = user?.email || '';
  const initials = organizationName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0])
    .join('')
    .toUpperCase() || 'O';

  useEffect(() => {
    let mounted = true;
    apiClient.get('/client-profile/pill-rewards/balance/')
      .then(({ data }) => {
        if (!mounted) return;
        setPillSummary({
          balance: Number(data?.balance ?? 0),
          shift_post_cost: Number(data?.shift_post_cost ?? 0),
        });
      })
      .catch(() => {
        if (mounted) setPillSummary({ balance: 0, shift_post_cost: 0 });
      });
    return () => {
      mounted = false;
    };
  }, []);

  const shareFriendReferral = async () => {
    setReferralLoading(true);
    try {
      const { data } = await apiClient.post('/client-profile/pill-rewards/refer-friend/', {});
      const code = data?.referral_code;
      if (!code) throw new Error('Referral code was not returned.');
      const baseUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim() || webBaseUrl;
      const url = `${baseUrl.replace(/\/+$/, '')}/register?referral_code=${encodeURIComponent(code)}`;
      await Share.share({ message: url, url });
    } catch (err: any) {
      Alert.alert('Referral failed', err?.response?.data?.detail || err?.message || 'Failed to create referral link.');
    } finally {
      setReferralLoading(false);
    }
  };

  const menuItems = [
    {
      title: 'Invite Staff',
      description: 'Manage organization members, roles, and pharmacy access',
      icon: 'account-plus-outline',
      route: '/organization/invite',
    },
    {
      title: 'Manage Pharmacies',
      description: 'Open organization pharmacies and store-level teams',
      icon: 'store-outline',
      route: '/organization/pharmacies',
    },
    {
      title: 'Pill Rewards',
      description: `${pillSummary.balance} pills available`,
      icon: 'pill',
      route: '/organization/pills',
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView style={styles.scrollView}>
        <Card style={styles.heroCard} mode="contained">
          <LinearGradient
            colors={['#D7E8FF', '#E9D5FF', '#F9C2DE']}
            locations={[0, 0.58, 1]}
            start={{ x: 0, y: 0.1 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientHeader}
          >
            <View style={styles.heroContent}>
              {profilePhoto ? (
                <Avatar.Image size={76} source={{ uri: profilePhoto as string }} style={styles.avatar} />
              ) : (
                <Avatar.Text size={76} label={initials} style={styles.avatar} labelStyle={styles.avatarLabel} />
              )}
              <Text variant="headlineSmall" style={styles.name}>
                {organizationName}
              </Text>
              {displayEmail ? (
                <Text variant="bodyMedium" style={styles.email}>
                  {displayEmail}
                </Text>
              ) : null}
              <View style={styles.roleBadge}>
                <Text variant="labelSmall" style={styles.roleText}>
                  ORGANIZATION
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Card>

        <View style={styles.menuContainer}>
          {menuItems.map((item) => (
            <Card key={item.route} style={styles.menuCard} onPress={() => router.push(item.route as any)}>
              <Card.Content style={styles.menuContent}>
                <View style={styles.menuIcon}>
                  <IconButton icon={item.icon} size={24} iconColor="#6366F1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium" style={styles.menuTitle}>{item.title}</Text>
                  <Text variant="bodySmall" style={styles.menuDesc}>{item.description}</Text>
                </View>
                <IconButton icon="chevron-right" size={24} iconColor="#9CA3AF" />
              </Card.Content>
            </Card>
          ))}
        </View>

        <View style={styles.section}>
          <Text variant="titleSmall" style={styles.sectionTitle}>Preferences</Text>
          <Surface style={styles.listSurface} elevation={0}>
            <List.Item
              title="Notifications"
              left={(props) => <List.Icon {...props} icon="bell" />}
              right={() => (
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  color="#6366F1"
                />
              )}
            />
            <Divider />
            <List.Item
              title="App Settings"
              left={(props) => <List.Icon {...props} icon="cog" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
            />
          </Surface>
        </View>

        <View style={styles.section}>
          <Text variant="titleSmall" style={styles.sectionTitle}>Support</Text>
          <Surface style={styles.listSurface} elevation={0}>
            <List.Item
              title="Contact Us"
              left={(props) => <List.Icon {...props} icon="message-text-outline" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/contact' as any)}
            />
            <Divider />
            <List.Item
              title="Terms of Service"
              left={(props) => <List.Icon {...props} icon="file-document" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => Linking.openURL(`${webBaseUrl}/terms-of-service`)}
            />
            <Divider />
            <List.Item
              title="Privacy Policy"
              left={(props) => <List.Icon {...props} icon="shield-check" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => Linking.openURL(`${webBaseUrl}/privacy-policy`)}
            />
          </Surface>
        </View>

        <View style={styles.section}>
          <Text variant="titleSmall" style={styles.sectionTitle}>Rewards</Text>
          <Card style={styles.menuCard} onPress={shareFriendReferral}>
            <Card.Content style={styles.menuContent}>
              <View style={styles.menuIcon}>
                <IconButton icon="account-plus-outline" size={24} iconColor="#6366F1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={styles.menuTitle}>Refer a colleague </Text>
                <Text variant="bodySmall" style={styles.menuDesc}>
                  Share a referral link and earn pills when they register.
                </Text>
              </View>
              <IconButton icon={referralLoading ? 'progress-clock' : 'share-variant'} size={24} iconColor="#9CA3AF" />
            </Card.Content>
          </Card>
        </View>

        <View style={styles.section}>
          <Text variant="titleSmall" style={styles.sectionTitle}>Billing</Text>
          <Card style={styles.menuCard} onPress={() => router.push('/organization/pills' as any)}>
            <Card.Content style={styles.menuContent}>
              <View style={styles.menuIcon}>
                <IconButton icon="credit-card-outline" size={24} iconColor="#6366F1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={styles.menuTitle}>Organization pills</Text>
                <Text variant="bodySmall" style={styles.menuDesc}>
                  {pillSummary.shift_post_cost} pills per shift post.
                </Text>
              </View>
              <IconButton icon="chevron-right" size={24} iconColor="#9CA3AF" />
            </Card.Content>
          </Card>
        </View>

        <View style={styles.logoutContainer}>
          <Text variant="bodySmall" style={styles.deleteDescription}>
            Deleting your account is permanent. You will be signed out immediately, and verification
            documents are removed within 7 days.
          </Text>
          <Button
            mode="outlined"
            textColor="#EF4444"
            style={styles.logoutButton}
            icon="delete"
            onPress={() => setDeleteDialogOpen(true)}
          >
            Delete My Account
          </Button>
          <Text variant="bodySmall" style={styles.versionText}>
            Version {appVersion || 'N/A'}
          </Text>
        </View>
      </ScrollView>

      <Portal>
        <Dialog
          visible={deleteDialogOpen}
          onDismiss={() => {
            if (deleting) return;
            setDeleteDialogOpen(false);
            setDeleteText('');
          }}
        >
          <Dialog.Title>Delete account</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ marginBottom: 12 }}>
              This action cannot be undone. Type DELETE to confirm.
            </Text>
            <TextInput
              label="Type DELETE to confirm"
              value={deleteText}
              onChangeText={setDeleteText}
              autoCapitalize="characters"
              disabled={deleting}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                if (deleting) return;
                setDeleteDialogOpen(false);
                setDeleteText('');
              }}
            >
              Cancel
            </Button>
            <Button
              textColor="#DC2626"
              onPress={async () => {
                if (deleteText.trim().toUpperCase() !== 'DELETE' || deleting) return;
                setDeleting(true);
                try {
                  await deleteAccount();
                  await logout();
                  setDeleteDialogOpen(false);
                  setDeleteText('');
                  Alert.alert('Account deletion requested/completed.');
                  router.replace('/login' as any);
                } catch (err: any) {
                  Alert.alert('Error', err?.message || 'Failed to delete account.');
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleteText.trim().toUpperCase() !== 'DELETE' || deleting}
            >
              {deleting ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollView: { flex: 1 },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D6DCEF',
    elevation: 0,
  },
  gradientHeader: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  heroContent: { alignItems: 'center', gap: 4 },
  avatar: {
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.96)',
  },
  avatarLabel: {
    color: '#4338CA',
    fontWeight: '800',
  },
  name: {
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
    marginTop: 2,
    textAlign: 'center',
  },
  email: {
    color: '#475569',
    marginBottom: 6,
    textAlign: 'center',
  },
  roleBadge: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(109, 40, 217, 0.22)',
  },
  roleText: {
    color: '#5B21B6',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  menuContainer: {
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#6B7280',
    marginBottom: 8,
    marginLeft: 4,
    fontWeight: '600',
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    elevation: 0,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTitle: {
    fontWeight: '600',
    color: '#111827',
  },
  menuDesc: {
    color: '#6B7280',
    marginTop: 2,
  },
  listSurface: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  logoutContainer: {
    padding: 16,
    paddingBottom: 40,
    alignItems: 'center',
  },
  logoutButton: {
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
    width: '100%',
    marginBottom: 16,
  },
  deleteDescription: {
    color: '#9CA3AF',
    marginBottom: 12,
    textAlign: 'center',
  },
  versionText: {
    color: '#9CA3AF',
  },
});
