import React, { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Avatar, Button, Divider, IconButton, List, Modal, Portal, Text } from 'react-native-paper';
import { useAuth } from '@/context/AuthContext';
import { AdminWorkspaceProvider, useAdminWorkspace } from '@/context/AdminWorkspaceContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { brandColors } from '@/constants/theme';
import {
  getAssignmentId,
  getAssignmentPharmacyName,
  selectRolePersona,
  type MobileAdminAssignment,
} from '@/utils/mobilePersona';

function profileRouteForRole(role?: string | null) {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'PHARMACIST') return '/pharmacist/profile';
  if (normalized === 'OTHER_STAFF') return '/otherstaff/profile';
  if (normalized === 'OWNER') return '/owner/profile';
  if (normalized === 'EXPLORER') return '/explorer/profile';
  if (normalized.includes('ORG') || normalized === 'ORGANIZATION') return '/organization/profile';
  return '/admin';
}

function AdminSidebar({
  visible,
  onDismiss,
  onNavigate,
  assignments,
  activeAssignmentId,
  onSelectAssignment,
  onReturnToRole,
  roleLabel,
  canManageStaff,
  canManageRoster,
}: {
  visible: boolean;
  onDismiss: () => void;
  onNavigate: (route: string) => void;
  assignments: MobileAdminAssignment[];
  activeAssignmentId: number | null;
  onSelectAssignment: (assignmentId: number) => void;
  onReturnToRole: () => void;
  roleLabel: string;
  canManageStaff: boolean;
  canManageRoster: boolean;
}) {
  const { logout } = useAuth();
  const router = useRouter();

  const items = [
    { label: 'Overview', icon: 'view-dashboard-outline', route: '/admin', visible: true },
    { label: 'Chat', icon: 'message-text-outline', route: '/admin/chat', visible: true },
    { label: 'Pharmacy Hub', icon: 'account-group-outline', route: '/admin/hub', visible: true },
    { label: 'Calendar', icon: 'calendar-outline', route: '/admin/calendar', visible: true },
    { label: 'Pharmacies', icon: 'store-outline', route: '/admin/pharmacies', visible: canManageStaff },
    { label: 'Workforce & Payroll', icon: 'account-cash-outline', route: '/workforce-settings', visible: canManageStaff || canManageRoster },
    { label: 'Shift Centre', icon: 'calendar-month-outline', route: '/admin/shifts', visible: canManageRoster },
    { label: 'Weekly Roster', icon: 'calendar-account-outline', route: '/manager/roster', visible: canManageRoster },
    { label: 'Attendance Approvals', icon: 'check-decagram-outline', route: '/attendance/reviews', visible: canManageRoster },
    { label: 'Timesheets', icon: 'clock-check-outline', route: '/workforce-timesheets', visible: canManageRoster },
    { label: 'Post Shift', icon: 'plus-circle-outline', route: '/admin/post-shift', visible: canManageRoster },
    { label: 'Pills', icon: 'pill', route: '/admin/pills', visible: true },
    { label: 'Notifications', icon: 'bell-outline', route: '/admin/notifications', visible: true },
  ].filter((item) => item.visible);

  const handleLogout = async () => {
    onDismiss();
    await logout();
    router.replace('/login' as any);
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.sidebar}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text variant="labelMedium" style={styles.sidebarEyebrow}>Admin workspace</Text>
          <Text variant="titleMedium" style={styles.sidebarTitle}>
            Manage your pharmacy responsibilities
          </Text>

          {assignments.length > 0 ? (
            <View style={styles.scopeBlock}>
              <Text variant="labelSmall" style={styles.scopeLabel}>ACTIVE PHARMACY</Text>
              {assignments.map((assignment) => {
                const id = getAssignmentId(assignment);
                if (id == null) return null;
                const selected = id === activeAssignmentId;
                return (
                  <List.Item
                    key={id}
                    title={getAssignmentPharmacyName(assignment)}
                    description={selected ? 'Current admin scope' : 'Switch admin scope'}
                    left={(props) => <List.Icon {...props} icon={selected ? 'check-circle' : 'store-outline'} color={selected ? brandColors.navy : undefined} />}
                    style={[styles.scopeItem, selected && styles.scopeItemSelected]}
                    onPress={() => onSelectAssignment(id)}
                  />
                );
              })}
            </View>
          ) : null}

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
          <List.Item
            title={`Return to ${roleLabel} workspace`}
            description="Switch back to your personal role"
            left={(props) => <List.Icon {...props} icon="account-switch-outline" />}
            onPress={onReturnToRole}
          />
          <Button icon="logout" textColor={brandColors.danger} onPress={handleLogout}>
            Logout
          </Button>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

function AdminLayoutInner() {
  const router = useRouter();
  const { user, isLoading, hasCapability } = useAuth();
  const { reloadWorkspace } = useWorkspace();
  const {
    assignments,
    activeAssignment,
    activePharmacyId: pharmacyId,
    activePharmacyName: pharmacyName,
    selectAssignment,
    isLoading: adminWorkspaceLoading,
  } = useAdminWorkspace();
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
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

  if (isLoading || adminWorkspaceLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brandColors.white }}>
        <ActivityIndicator size="large" color={brandColors.navy} />
      </View>
    );
  }

  const profileRoute = profileRouteForRole(user?.role);
  const roleLabel = String(user?.role || 'staff').toLowerCase().replace('_', ' ');
  const canManageStaff = Boolean(pharmacyId && hasCapability('MANAGE_STAFF', pharmacyId));
  const canManageRoster = Boolean(pharmacyId && hasCapability('MANAGE_ROSTER', pharmacyId));

  const adminPath = (route: string) => {
    if (route === '/admin/post-shift' && pharmacyId) return `/admin/${pharmacyId}/post-shift`;
    if (route === '/admin/pills' && pharmacyId) return `/admin/${pharmacyId}/pills`;
    if (route === '/manager/roster' && pharmacyId) return `/manager/roster?pharmacyId=${pharmacyId}`;
    if (route === '/workforce-timesheets' && pharmacyId) return `/workforce-timesheets?pharmacyId=${pharmacyId}`;
    if (route === '/workforce-settings' && pharmacyId) return `/workforce-settings?pharmacyId=${pharmacyId}`;
    return route;
  };

  const navigateAdmin = (route: string) => {
    router.push(adminPath(route) as any);
  };

  const returnToRole = async () => {
    setSidebarVisible(false);
    const route = await selectRolePersona(user);
    await reloadWorkspace();
    router.replace(route as any);
  };

  const changeAssignment = async (assignmentId: number) => {
    await selectAssignment(assignmentId);
    setSidebarVisible(false);
    router.replace('/admin' as any);
  };

  return (
    <>
      <AdminSidebar
        visible={sidebarVisible}
        onDismiss={() => setSidebarVisible(false)}
        onNavigate={navigateAdmin}
        assignments={assignments}
        activeAssignmentId={getAssignmentId(activeAssignment)}
        onSelectAssignment={(assignmentId) => void changeAssignment(assignmentId)}
        onReturnToRole={() => void returnToRole()}
        roleLabel={roleLabel}
        canManageStaff={canManageStaff}
        canManageRoster={canManageRoster}
      />
      <Stack
        screenOptions={{
          headerShown: true,
          headerTitle: pharmacyName,
          headerStyle: { backgroundColor: brandColors.white },
          headerShadowVisible: false,
          headerLeft: () => (
            <IconButton icon="menu" accessibilityLabel="Open admin menu" onPress={() => setSidebarVisible(true)} />
          ),
          headerRight: () => (
            <View style={styles.headerRight}>
              <IconButton
                icon="bell-outline"
                accessibilityLabel="Notifications"
                onPress={() => router.push('/admin/notifications' as any)}
              />
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.push(profileRoute as any)}>
                {photoUrl ? (
                  <Avatar.Image size={36} source={{ uri: photoUrl }} />
                ) : (
                  <Avatar.Text
                    size={36}
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
        <Stack.Screen name="index" options={{ headerTitle: pharmacyName }} />
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
        <Stack.Screen name="hub" options={{ headerTitle: 'Pharmacy Hub' }} />
        <Stack.Screen name="calendar" options={{ headerTitle: 'Calendar' }} />
        <Stack.Screen name="notifications" options={{ headerTitle: 'Notifications' }} />
      </Stack>
    </>
  );
}

export default function AdminLayout() {
  return (
    <AdminWorkspaceProvider>
      <AdminLayoutInner />
    </AdminWorkspaceProvider>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  avatar: {
    backgroundColor: brandColors.navy,
  },
  avatarLabel: {
    color: brandColors.white,
    fontWeight: 'bold',
  },
  sidebar: {
    marginHorizontal: 12,
    maxHeight: '88%',
    borderRadius: 18,
    backgroundColor: brandColors.white,
    paddingVertical: 16,
    overflow: 'hidden',
  },
  sidebarEyebrow: {
    color: brandColors.navy,
    letterSpacing: 1,
    paddingHorizontal: 18,
    fontWeight: '800',
  },
  sidebarTitle: {
    color: brandColors.navy,
    fontWeight: '900',
    paddingHorizontal: 18,
    marginTop: 4,
    marginBottom: 12,
  },
  scopeBlock: {
    marginHorizontal: 12,
    padding: 8,
    borderRadius: 14,
    backgroundColor: brandColors.mist,
  },
  scopeLabel: {
    color: brandColors.body,
    letterSpacing: 0.8,
    marginHorizontal: 8,
    marginBottom: 2,
    fontWeight: '800',
  },
  scopeItem: {
    borderRadius: 12,
  },
  scopeItemSelected: {
    backgroundColor: brandColors.white,
  },
  sidebarDivider: {
    marginVertical: 8,
  },
});
