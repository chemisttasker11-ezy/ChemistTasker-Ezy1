import React, { useEffect, useMemo, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Avatar, Button, Divider, IconButton, List, Modal, Portal, Text } from 'react-native-paper';
import { useAuth } from '@/context/AuthContext';

function profileRouteForRole(role?: string | null) {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'PHARMACIST') return '/pharmacist/profile';
  if (normalized === 'OTHER_STAFF') return '/otherstaff/profile';
  if (normalized === 'OWNER') return '/owner/profile';
  if (normalized.includes('ORG') || normalized === 'ORGANIZATION') return '/organization/profile';
  return '/admin';
}

function AdminSidebar({
  visible,
  onDismiss,
  onNavigate,
  pharmacyName,
}: {
  visible: boolean;
  onDismiss: () => void;
  onNavigate: (route: string) => void;
  pharmacyName: string;
}) {
  const { logout } = useAuth();
  const router = useRouter();

  const items = [
    { label: 'Overview', icon: 'view-dashboard-outline', route: '/admin' },
    { label: 'Pharmacies', icon: 'store-outline', route: '/admin/pharmacies' },
    { label: 'Roster', icon: 'calendar-month-outline', route: '/admin/shifts' },
    { label: 'Post Shift', icon: 'plus-circle-outline', route: '/admin/post-shift' },
    { label: 'Chat', icon: 'message-text-outline', route: '/admin/chat' },
    { label: 'Pills', icon: 'pill', route: '/admin/pills' },
    { label: 'Notifications', icon: 'bell-outline', route: '/admin/notifications' },
  ];

  const handleLogout = async () => {
    onDismiss();
    await logout();
    router.replace('/login' as any);
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.sidebar}>
        <Text variant="labelMedium" style={styles.sidebarEyebrow}>Admin workspace</Text>
        <Text variant="titleMedium" style={styles.sidebarTitle} numberOfLines={2}>
          {pharmacyName}
        </Text>
        <Divider style={styles.sidebarDivider} />
        {items.map((item) => (
          <List.Item
            key={`${item.route}-${item.label}`}
            title={item.label}
            left={(props) => <List.Icon {...props} icon={item.icon} />}
            onPress={() => {
              onDismiss();
              onNavigate(item.route);
            }}
          />
        ))}
        <Divider style={styles.sidebarDivider} />
        <Button icon="logout" textColor="#DC2626" onPress={handleLogout}>
          Logout
        </Button>
      </Modal>
    </Portal>
  );
}

export default function AdminLayout() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    // Do not update the photo based on an intermediate or loading user object.
    // This prevents the avatar from flickering during navigation.
    if (isLoading) {
      return;
    }
    if (!user) {
      setPhotoUrl(null);
      return;
    }
    const newPhoto =
      (user as any)?.profile_photo ||
      (user as any)?.profile_photo_url ||
      (user as any)?.profilePhoto ||
      null;
    setPhotoUrl(newPhoto);
  }, [user, isLoading]);

  const assignment = useMemo(() => {
    const assignments = Array.isArray((user as any)?.admin_assignments)
      ? (user as any).admin_assignments
      : [];
    return assignments.find((item: any) => item?.pharmacy_id || item?.pharmacyId) || assignments[0] || null;
  }, [user]);
  const pharmacyId = assignment?.pharmacy_id ?? assignment?.pharmacyId ?? assignment?.pharmacy ?? null;
  const pharmacyName = assignment?.pharmacy_name ?? assignment?.pharmacyName ?? (pharmacyId ? `Pharmacy #${pharmacyId}` : 'Admin pharmacy');
  const profileRoute = profileRouteForRole(user?.role);
  const adminPath = (route: string) => {
    if (route === '/admin/post-shift' && pharmacyId) return `/admin/${pharmacyId}/post-shift`;
    if (route === '/admin/pills' && pharmacyId) return `/admin/${pharmacyId}/pills`;
    return route;
  };

  const navigateAdmin = (route: string) => {
    router.push(adminPath(route) as any);
  };

  return (
    <>
      <AdminSidebar
        visible={sidebarVisible}
        onDismiss={() => setSidebarVisible(false)}
        onNavigate={navigateAdmin}
        pharmacyName={pharmacyName}
      />
      <Stack
        screenOptions={{
          headerShown: true,
          headerTitle: 'Admin',
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerShadowVisible: true,
          headerLeft: () => (
            <IconButton icon="menu" onPress={() => setSidebarVisible(true)} />
          ),
          headerRight: () => (
            <View style={styles.headerRight}>
              <IconButton
                icon="bell-outline"
                onPress={() => router.push('/admin/notifications' as any)}
              />
              <TouchableOpacity onPress={() => router.push(profileRoute as any)}>
                {photoUrl ? (
                  <Avatar.Image size={32} source={{ uri: photoUrl }} />
                ) : (
                  <Avatar.Text
                    size={32}
                    label={(user?.username || user?.email || 'A').charAt(0).toUpperCase()}
                    style={styles.avatar}
                    labelStyle={styles.avatarLabel}
                  />
                )}
              </TouchableOpacity>
            </View>
          ),
        }}
      >
        <Stack.Screen name="index" options={{ headerTitle: 'Admin Dashboard' }} />
        <Stack.Screen name="messages/[id]" options={{ headerTitle: 'Messages' }} />
        <Stack.Screen name="pharmacies/index" options={{ headerTitle: 'Pharmacies' }} />
        <Stack.Screen name="pharmacies/[id]" options={{ headerTitle: 'Pharmacy' }} />
        <Stack.Screen name="pharmacies/[id]/staff" options={{ headerTitle: 'Staff' }} />
        <Stack.Screen name="pharmacies/[id]/locums" options={{ headerTitle: 'Locums' }} />
        <Stack.Screen name="pharmacies/add" options={{ headerTitle: 'Add Pharmacy' }} />
        <Stack.Screen name="pharmacies/[id]/edit" options={{ headerTitle: 'Edit Pharmacy' }} />
        <Stack.Screen name="shifts/index" options={{ headerTitle: 'Shift Centre' }} />
        <Stack.Screen name="invoice" options={{ headerTitle: 'Invoices' }} />
        <Stack.Screen name="invoice/new" options={{ headerTitle: 'New Invoice' }} />
        <Stack.Screen name="invoice/[id]" options={{ headerTitle: 'Invoice' }} />
        <Stack.Screen name="post-shift" options={{ headerTitle: 'Post Shift' }} />
        <Stack.Screen name="[pharmacyId]/post-shift" options={{ headerTitle: 'Post Shift' }} />
        <Stack.Screen name="pills" options={{ headerTitle: 'Pills' }} />
        <Stack.Screen name="[pharmacyId]/pills" options={{ headerTitle: 'Pills' }} />
        <Stack.Screen name="chat" options={{ headerTitle: 'Chat' }} />
        <Stack.Screen name="notifications" options={{ headerTitle: 'Notifications' }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    backgroundColor: '#6366F1',
  },
  avatarLabel: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  sidebar: {
    marginHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    overflow: 'hidden',
  },
  sidebarEyebrow: {
    color: '#6366F1',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 18,
  },
  sidebarTitle: {
    color: '#111827',
    fontWeight: '900',
    paddingHorizontal: 18,
    marginTop: 4,
    marginBottom: 8,
  },
  sidebarDivider: {
    marginVertical: 8,
  },
});
