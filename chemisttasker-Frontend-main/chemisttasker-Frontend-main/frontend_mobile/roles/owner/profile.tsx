import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Linking, Share } from 'react-native';
import { Text, Avatar, List, Button, Surface, Divider, Switch, IconButton, Card, Portal, Dialog, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useAuth } from '../../context/AuthContext';
import { getOnboarding, deleteAccount, updateOnboardingForm } from '@chemisttasker/shared-core';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import apiClient from '../../utils/apiClient';

interface UserProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  profile_photo?: string;
  role: string;
}

export default function OwnerProfileScreen() {
  const router = useRouter();
  const { logout, refreshUser, updateUserProfilePhoto } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [referralLoading, setReferralLoading] = useState(false);
  const [subscriptionSummary, setSubscriptionSummary] = useState<{
    active: boolean;
    status: string;
    staffCount: number;
    extraSeatCount: number;
  } | null>(null);
  const appVersion = typeof Constants?.expoConfig?.version === 'string' ? Constants.expoConfig.version : '';
  const webBaseUrl = 'https://www.chemisttasker.com.au';
  const imageMediaTypes = (ImagePicker as any).MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images;
  const menuItems = [
    {
      title: 'Profile Detail',
      description: 'Open owner onboarding profile fields',
      icon: 'account-edit-outline',
      route: '/owner/profile-detail',
    }
  ];

  useEffect(() => {
    fetchProfile();
  }, []);

  useEffect(() => {
    apiClient
      .get('/billing/subscription/')
      .then(({ data }) => {
        setSubscriptionSummary({
          active: !!data?.active,
          status: data?.status || 'inactive',
          staffCount: data?.staffCount ?? 5,
          extraSeatCount: data?.extraSeatCount ?? 0,
        });
      })
      .catch(() => setSubscriptionSummary(null));
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await getOnboarding('owner');
      setProfile(response as UserProfile);
      const photo = (response as any)?.profile_photo_url || (response as any)?.profile_photo || null;
      if (photo) setProfilePhoto(photo);
    } catch (error) {
      console.error('Error fetching profile:', error);
      Alert.alert('Error', 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const uploadProfilePhoto = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset?.uri) return;
    const filename = asset.fileName || `profile-photo-${Date.now()}.jpg`;
    const type = asset.mimeType || 'image/jpeg';
    const formData = new FormData();
    formData.append('profile_photo', {
      uri: asset.uri,
      name: filename,
      type,
    } as any);

    setUploading(true);
    try {
      const updated: any = await updateOnboardingForm('owner', formData);
      const newUrl = updated?.profile_photo_url || updated?.profile_photo || null;
      if (newUrl) {
        setProfilePhoto(newUrl);
        await updateUserProfilePhoto(newUrl);
      }
      await refreshUser();
      await fetchProfile();
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || 'Failed to upload profile photo.');
    } finally {
      setUploading(false);
    }
  };

  const pickImage = async () => {
    Alert.alert('Update Profile Photo', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Camera access is required');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: imageMediaTypes,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            setProfilePhoto(result.assets[0].uri);
            await uploadProfilePhoto(result.assets[0]);
          }
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Photo library access is required');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: imageMediaTypes,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            setProfilePhoto(result.assets[0].uri);
            await uploadProfilePhoto(result.assets[0]);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

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

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.centerContent}>
          <Text>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView style={styles.scrollView}>
        {/* Header Profile Section */}
        <Card style={styles.heroCard} mode="contained">
          <LinearGradient
            colors={['#D7E8FF', '#E9D5FF', '#F9C2DE']}
            locations={[0, 0.58, 1]}
            start={{ x: 0, y: 0.1 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientHeader}
          >
            <View style={styles.heroContent}>
              <View style={styles.avatarWrapper}>
                {profilePhoto ? (
                  <Avatar.Image size={76} source={{ uri: profilePhoto }} style={styles.avatar} />
                ) : (
                  <Avatar.Text
                    size={76}
                    label={`${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`}
                    style={styles.avatar}
                    color="#4338CA"
                  />
                )}
                <IconButton
                  icon="camera"
                  size={18}
                  style={styles.cameraButton}
                  iconColor="#4338CA"
                  containerColor="#FFFFFF"
                  onPress={pickImage}
                />
              </View>
              <Text variant="headlineSmall" style={styles.name}>
                {profile?.first_name} {profile?.last_name}
              </Text>
              <Text variant="bodyMedium" style={styles.email}>
                {profile?.email}
              </Text>
              <View style={styles.roleBadge}>
                <Text variant="labelSmall" style={styles.roleText}>
                  {profile?.role?.replace('_', ' ')}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Card>

        <View style={styles.menuContainer}>
          {menuItems.map((item, index) => (
            <Card key={index} style={styles.menuCard} onPress={() => router.push(item.route as any)}>
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
              left={props => <List.Icon {...props} icon="bell" />}
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
              left={props => <List.Icon {...props} icon="cog" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
            />
          </Surface>
        </View>

        <View style={styles.section}>
          <Text variant="titleSmall" style={styles.sectionTitle}>Support</Text>
          <Surface style={styles.listSurface} elevation={0}>
            <List.Item
              title="Contact Us"
              left={props => <List.Icon {...props} icon="message-text-outline" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/contact' as any)}
            />
            <Divider />
            <List.Item
              title="Terms of Service"
              left={props => <List.Icon {...props} icon="file-document" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => {
                Linking.openURL(`${webBaseUrl}/terms-of-service`);
              }}
            />
            <Divider />
            <List.Item
              title="Privacy Policy"
              left={props => <List.Icon {...props} icon="shield-check" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => {
                Linking.openURL(`${webBaseUrl}/privacy-policy`);
              }}
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
          <Card style={styles.menuCard} onPress={() => router.push('/owner/subscription-seats' as any)}>
            <Card.Content style={styles.menuContent}>
              <View style={styles.menuIcon}>
                <IconButton icon="credit-card-outline" size={24} iconColor="#6366F1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={styles.menuTitle}>Subscription and seats</Text>
                <Text variant="bodySmall" style={styles.menuDesc}>
                  {subscriptionSummary?.active
                    ? `Active with ${subscriptionSummary.staffCount} seats (${subscriptionSummary.extraSeatCount} extra).`
                    : 'Open subscription first, then manage extra seats here.'}
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
          <Text variant="bodySmall" style={styles.versionText}>
            Version {appVersion || 'N/A'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
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
  heroContent: {
    alignItems: 'center',
    gap: 4,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.96)',
  },
  cameraButton: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  name: {
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 2,
    marginTop: 0,
  },
  email: {
    color: '#475569',
    marginBottom: 6,
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
  menuContainer: {
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
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
