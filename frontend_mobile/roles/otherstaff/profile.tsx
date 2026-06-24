import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Avatar,
  Button,
  Card,
  Divider,
  List,
  Portal,
  Dialog,
  Surface,
  Text,
  TextInput,
  IconButton,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../../context/AuthContext';
import { deleteAccount, updateOnboardingForm } from '@chemisttasker/shared-core';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';

export default function OtherStaffProfileScreen() {
  const router = useRouter();
  const { user, logout, refreshUser, updateUserProfilePhoto } = useAuth();
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const appVersion = typeof Constants?.expoConfig?.version === 'string' ? Constants.expoConfig.version : '';
  const webBaseUrl = 'https://www.chemisttasker.com.au';
  const imageMediaTypes = (ImagePicker as any).MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images;
  const menuItems = [
    { title: 'Basic Info', description: 'Personal and contact details', icon: 'account-edit-outline', route: '/otherstaff/profile-basic-info' },
    { title: 'Identity', description: 'Government ID verification', icon: 'card-account-details-outline', route: '/otherstaff/profile-identity' },
    { title: 'Regulatory Docs', description: 'Role-specific compliance files', icon: 'file-certificate-outline', route: '/otherstaff/profile-regulatory' },
    { title: 'Skills', description: 'Skills and certificates', icon: 'star-outline', route: '/otherstaff/profile-skills' },
    { title: 'Payment', description: 'TFN/ABN and super details', icon: 'cash-multiple', route: '/otherstaff/profile-payment' },
    { title: 'Referees', description: 'References and requests', icon: 'account-group-outline', route: '/otherstaff/profile-referees' },
    { title: 'Bio', description: 'Short bio and resume', icon: 'file-account-outline', route: '/otherstaff/profile-bio' },
  ];

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
      const updated: any = await updateOnboardingForm('other_staff', formData);
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
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
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
                  label={(user?.username || user?.email || 'U').substring(0, 2).toUpperCase()}
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
                disabled={uploading}
              />
            </View>
            <Text variant="headlineSmall" style={styles.name}>
              {user?.username || 'Other Staff'}
            </Text>
            <Text variant="bodyMedium" style={styles.email}>
              {user?.email || ''}
            </Text>
            <View style={styles.roleChip}>
              <Text variant="labelSmall" style={styles.roleText}>OTHER STAFF</Text>
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
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Support
          </Text>
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

        <View style={styles.deleteContainer}>
          <Text variant="bodySmall" style={styles.deleteDescription}>
            Deleting your account is permanent. You will be signed out immediately, and verification
            documents are removed within 7 days.
          </Text>
          <Button
            mode="outlined"
            textColor="#EF4444"
            style={styles.deleteButton}
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
              onPress={handleDeleteAccount}
              disabled={!canDelete || deleting}
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
  name: { color: '#0F172A', fontWeight: 'bold', marginTop: 12 },
  email: { color: '#475569', marginTop: 4 },
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
  section: { paddingHorizontal: 16, marginTop: 16 },
  menuContainer: { paddingHorizontal: 16, gap: 10, marginTop: 8 },
  menuCard: { backgroundColor: '#FFFFFF', borderRadius: 16, elevation: 0, borderWidth: 1, borderColor: '#E5E7EB' },
  menuContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, gap: 8 },
  menuIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  menuTitle: { fontWeight: '600', color: '#111827' },
  menuDesc: { color: '#6B7280', marginTop: 2 },
  sectionTitle: {
    color: '#6B7280',
    marginBottom: 8,
    marginLeft: 4,
    fontWeight: '600',
  },
  listSurface: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  deleteContainer: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  deleteButton: {
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
  },
  deleteDescription: {
    color: '#9CA3AF',
    marginBottom: 12,
    textAlign: 'center',
  },
  versionText: {
    textAlign: 'center',
    color: '#9CA3AF',
    marginTop: 8,
  },
});
