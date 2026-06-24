import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Linking } from 'react-native';
import { Card, Text, Button, Divider, Avatar, IconButton, List, Surface, Switch, Portal, Dialog, TextInput } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { deleteAccount, updateOnboardingForm } from '@chemisttasker/shared-core';

export default function PharmacistProfileScreen() {
  const { user, logout, refreshUser, updateUserProfilePhoto } = useAuth();
  const router = useRouter();
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const appVersion = typeof Constants?.expoConfig?.version === 'string' ? Constants.expoConfig.version : '';
  const webBaseUrl = 'https://www.chemisttasker.com.au';
  const imageMediaTypes = (ImagePicker as any).MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images;

  // Seed local photo from user profile (including onboarding photo) when available
  useEffect(() => {
    const photo =
      (user as any)?.profile_photo ||
      (user as any)?.profile_photo_url ||
      (user as any)?.profilePhoto ||
      null;
    if (photo && !profilePhoto) {
      setProfilePhoto(photo);
    }
  }, [user, profilePhoto]);

  // Profile refresh is handled centrally in AuthContext to avoid repeated calls.

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
      const updated: any = await updateOnboardingForm('pharmacist', formData);
      const newUrl = updated?.profile_photo_url || updated?.profile_photo || null;
      if (newUrl) {
        setProfilePhoto(newUrl);
        await updateUserProfilePhoto(newUrl);
      }
      await refreshUser();
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || 'Failed to upload profile photo.');
    } finally {
      setUploading(false);
    }
  };

  const pickImage = async () => {
    Alert.alert(
      'Update Profile Photo',
      'Choose an option',
      [
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
      ]
    );
  };

  const menuItems = [
    {
      title: 'Basic Info',
      description: 'Name, phone, address, and AHPRA details',
      icon: 'account-edit-outline',
      route: '/pharmacist/profile-basic-info',
    },
    {
      title: 'Identity',
      description: 'Government ID document and verification',
      icon: 'card-account-details-outline',
      route: '/pharmacist/profile-identity',
    },
    {
      title: 'Skills',
      description: 'Clinical services, software and certificates',
      icon: 'star-outline',
      route: '/pharmacist/profile-skills',
    },
    {
      title: 'Payment',
      description: 'TFN/ABN preference and super details',
      icon: 'cash-multiple',
      route: '/pharmacist/profile-payment',
    },
    {
      title: 'Referees',
      description: 'Reference contacts and request status',
      icon: 'account-group-outline',
      route: '/pharmacist/profile-referees',
    },
    {
      title: 'Rate',
      description: 'Set weekday, weekend and special rates',
      icon: 'calculator-variant-outline',
      route: '/pharmacist/profile-rate',
    },
    {
      title: 'Bio',
      description: 'Short bio and resume',
      icon: 'file-account-outline',
      route: '/pharmacist/profile-bio',
    },
  ];

  const preferencesItems = [
    {
      title: 'Notifications',
      icon: 'bell-outline',
      onPress: () => router.push('/notifications' as any),
      right: () => <Switch value />
    },
    {
      title: 'App Settings',
      icon: 'cog',
      onPress: () => {},
    },
  ];

  const supportItems = [
    {
      title: 'Contact Us',
      icon: 'message-text-outline',
      onPress: () => router.push('/contact' as any),
    },
    {
      title: 'Terms of Service',
      icon: 'file-document',
      onPress: () => {
        Linking.openURL(`${webBaseUrl}/terms-of-service`);
      },
    },
    {
      title: 'Privacy Policy',
      icon: 'shield-check',
      onPress: () => {
        Linking.openURL(`${webBaseUrl}/privacy-policy`);
      },
    },
  ];

  const canDelete = deleteText.trim().toUpperCase() === 'DELETE';

  const handleDeleteAccount = async () => {
    if (!canDelete || deleting) return;
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
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.header}>
          <Text variant="headlineMedium" style={styles.headerTitle}>Profile</Text>
        </View>

        <Card style={styles.profileCard}>
          <LinearGradient
            colors={['#D7E8FF', '#E9D5FF', '#F9C2DE']}
            locations={[0, 0.58, 1]}
            start={{ x: 0, y: 0.1 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientHeader}
          >
            <View style={styles.avatarContainer}>
              {profilePhoto ? (
                <Avatar.Image size={72} source={{ uri: profilePhoto }} style={styles.avatar} />
              ) : (
                <Avatar.Text
                  size={72}
                  label={(user?.username || 'U').substring(0, 2).toUpperCase()}
                  style={styles.avatar}
                  color="#4338CA"
                />
              )}
              <IconButton
                icon="camera"
                size={18}
                iconColor="#4338CA"
                containerColor="#FFFFFF"
                style={styles.cameraButton}
                onPress={pickImage}
              />
            </View>
            <Text variant="headlineSmall" style={styles.userName}>{user?.username || 'Pharmacist'}</Text>
            <Text variant="bodyMedium" style={styles.userEmail}>{user?.email || 'email@example.com'}</Text>
            <View style={styles.roleChip}>
              <Text variant="labelSmall" style={styles.roleText}>{user?.role || 'PHARMACIST'}</Text>
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

        <View style={styles.sectionBlock}>
          <Text variant="titleSmall" style={styles.sectionTitle}>Preferences</Text>
          <Surface style={styles.listSurface} elevation={0}>
            {preferencesItems.map((item, idx) => (
              <List.Item
                key={`${item.title}-${idx}`}
                title={item.title}
                left={(props) => <List.Icon {...props} icon={item.icon} />}
                right={item.right}
                onPress={item.onPress}
              />
            ))}
          </Surface>
        </View>

        <View style={styles.sectionBlock}>
          <Text variant="titleSmall" style={styles.sectionTitle}>Support</Text>
          <Surface style={styles.listSurface} elevation={0}>
            {supportItems.map((item, idx) => (
              <List.Item
                key={`${item.title}-${idx}`}
                title={item.title}
                left={(props) => <List.Icon {...props} icon={item.icon} />}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={item.onPress}
              />
            ))}
          </Surface>
        </View>

        <Text variant="bodySmall" style={styles.deleteDescription}>
          Deleting your account is permanent. You will be signed out immediately, and verification
          documents are removed within 7 days.
        </Text>
        <Button
          mode="outlined"
          textColor="#DC2626"
          style={styles.logoutButton}
          contentStyle={{ height: 48 }}
          icon="delete"
          onPress={() => setDeleteDialogOpen(true)}
        >
          Delete My Account
        </Button>
        <Text variant="bodySmall" style={styles.versionText}>
          Version {appVersion || 'N/A'}
        </Text>
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
                onPress={handleDeleteAccount}
                disabled={!canDelete || deleting}
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerTitle: {
    fontWeight: 'bold',
    color: '#111827',
  },
  profileCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#D6DCEF',
    elevation: 0,
  },
  gradientHeader: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.96)',
  },
  cameraButton: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    margin: 0,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  userName: {
    color: '#0F172A',
    fontWeight: 'bold',
    marginTop: 12,
  },
  userEmail: {
    color: '#475569',
    marginTop: 4,
  },
  roleChip: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(109, 40, 217, 0.22)',
  },
  roleText: {
    color: '#5B21B6',
    fontWeight: '600',
  },
  menuContainer: {
    paddingHorizontal: 20,
    gap: 12,
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
  sectionBlock: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  sectionTitle: {
    color: '#6B7280',
    marginBottom: 8,
    fontWeight: '600',
  },
  listSurface: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  logoutButton: {
    marginHorizontal: 20,
    marginTop: 32,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
  },
  deleteDescription: {
    marginHorizontal: 20,
    marginTop: 8,
    color: '#9CA3AF',
  },
  versionText: {
    textAlign: 'center',
    color: '#9CA3AF',
    marginTop: 8,
    marginBottom: 4,
  },
});
