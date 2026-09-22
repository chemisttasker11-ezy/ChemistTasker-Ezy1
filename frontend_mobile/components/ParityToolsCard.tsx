import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, IconButton, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';

type Tool = { title: string; subtitle: string; icon: string; route: string };

const managerTools: Tool[] = [
  { title: 'Workforce', subtitle: 'Employment terms, rates and payroll prep', icon: 'account-hard-hat-outline', route: '/workforce/employment-engagements' },
  { title: 'Roster', subtitle: 'Plan, validate and publish weekly coverage', icon: 'calendar-month-outline', route: '/manager/roster' },
  { title: 'Attendance', subtitle: 'Clocking, exceptions and manager review', icon: 'clock-check-outline', route: '/attendance' },
  { title: 'Finance', subtitle: 'Customers, expenses, BAS and invoices', icon: 'cash-multiple', route: '/finance' },
  { title: 'Marketplace', subtitle: 'Assets, tools, books and workwear', icon: 'storefront-outline', route: '/marketplace' },
  { title: 'Ethical Marketplace', subtitle: 'Private verified medicine exchange', icon: 'shield-check-outline', route: '/marketplace/ethical/access' },
  { title: 'Pill rewards', subtitle: 'Balance, activity and referrals', icon: 'pill', route: '/rewards/pills' },
];

const workerTools: Tool[] = [
  { title: 'Attendance', subtitle: 'Clock, breaks and attendance corrections', icon: 'clock-check-outline', route: '/attendance' },
  { title: 'Finance', subtitle: 'Invoices, expenses and finance records', icon: 'cash-multiple', route: '/finance' },
  { title: 'Marketplace', subtitle: 'Browse and exchange pharmacy goods', icon: 'storefront-outline', route: '/marketplace' },
  { title: 'Ethical Marketplace', subtitle: 'Access approved private pharmacy exchange', icon: 'shield-check-outline', route: '/marketplace/ethical/access' },
  { title: 'My ratings', subtitle: 'Relationship rating summary and history', icon: 'star-outline', route: '/profile/ratings' },
  { title: 'Pill rewards', subtitle: 'Balance, activity and referrals', icon: 'pill', route: '/rewards/pills' },
];

const explorerTools: Tool[] = [
  { title: 'Marketplace', subtitle: 'Browse ChemistTasker Marketplace', icon: 'storefront-outline', route: '/marketplace' },
  { title: 'My ratings', subtitle: 'Relationship rating summary and history', icon: 'star-outline', route: '/profile/ratings' },
  { title: 'Pill rewards', subtitle: 'Balance, activity and referrals', icon: 'pill', route: '/rewards/pills' },
];

const managerRoles = new Set(['OWNER','ORGANIZATION','ORG_ADMIN','ORG_OWNER','ORG_STAFF','CHIEF_ADMIN','REGION_ADMIN']);

export default function ParityToolsCard() {
  const router = useRouter();
  const { user, hasCapability } = useAuth();
  const { selectedPharmacyId } = useWorkspace();
  const role = String(user?.role || '').toUpperCase();
  const tools = useMemo(() => {
    if (role === 'EXPLORER') return explorerTools;
    if (role === 'OWNER') return managerTools;

    const canManageRoster = hasCapability('MANAGE_ROSTER', selectedPharmacyId);
    const canManageStaff = canManageRoster || hasCapability('MANAGE_STAFF', selectedPharmacyId);
    const isOrganizationRole = managerRoles.has(role);

    const delegated: Tool[] = [];
    if (canManageStaff) delegated.push(managerTools[0]);
    if (canManageRoster) {
      delegated.push(managerTools[1]);
      delegated.push(managerTools[2]);
    }

    // Preserve the existing non-management tools for organization personas, but
    // never expose staff/roster controls solely because the user has an org role.
    delegated.push(...(isOrganizationRole ? managerTools.slice(3) : workerTools));
    return delegated.filter((tool, index, rows) => rows.findIndex((candidate) => candidate.route === tool.route) === index);
  }, [hasCapability, role, selectedPharmacyId]);

  return (
    <View style={styles.section}>
      <Text variant="titleMedium" style={styles.heading}>Work & platform tools</Text>
      <View style={styles.grid}>
        {tools.map((tool) => (
          <Card key={tool.route} mode="outlined" style={styles.card} onPress={() => router.push(tool.route as any)}>
            <Card.Content style={styles.content}>
              <View style={styles.icon}><IconButton icon={tool.icon} size={22} iconColor="#6366F1" /></View>
              <View style={styles.copy}>
                <Text variant="titleSmall" style={styles.title}>{tool.title}</Text>
                <Text variant="bodySmall" style={styles.subtitle}>{tool.subtitle}</Text>
              </View>
              <IconButton icon="chevron-right" size={18} iconColor="#9CA3AF" />
            </Card.Content>
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 20, marginBottom: 24, gap: 12 },
  heading: { color: '#111827', fontWeight: '700' },
  grid: { gap: 10 },
  card: { borderRadius: 14, backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { color: '#111827', fontWeight: '700' },
  subtitle: { color: '#6B7280', marginTop: 2 },
});
