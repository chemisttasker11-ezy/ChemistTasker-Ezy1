import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Icon, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { colors, font, radius, space, touch } from '@/constants/tokens';

export type PlatformTool = { title: string; subtitle: string; icon: string; route: string };

export const managerTools: PlatformTool[] = [
  { title: 'Workforce', subtitle: 'Employment terms, rates and payroll prep', icon: 'account-hard-hat-outline', route: '/workforce/employment-engagements' },
  { title: 'Roster', subtitle: 'Plan, validate and publish weekly coverage', icon: 'calendar-month-outline', route: '/manager/roster' },
  { title: 'Attendance', subtitle: 'Clocking, exceptions and manager review', icon: 'clock-check-outline', route: '/attendance' },
  { title: 'Finance', subtitle: 'Customers, expenses, BAS and invoices', icon: 'cash-multiple', route: '/finance' },
  { title: 'Marketplace', subtitle: 'Assets, tools, books and workwear', icon: 'storefront-outline', route: '/marketplace' },
  { title: 'Ethical Marketplace', subtitle: 'Private verified medicine exchange', icon: 'shield-check-outline', route: '/marketplace/ethical/access' },
  { title: 'Pill rewards', subtitle: 'Balance, activity and referrals', icon: 'pill', route: '/rewards/pills' },
];

const workerTools: PlatformTool[] = [
  { title: 'Attendance', subtitle: 'Clock, breaks and attendance corrections', icon: 'clock-check-outline', route: '/attendance' },
  { title: 'Finance', subtitle: 'Invoices, expenses and finance records', icon: 'cash-multiple', route: '/finance' },
  { title: 'Marketplace', subtitle: 'Browse and exchange pharmacy goods', icon: 'storefront-outline', route: '/marketplace' },
  { title: 'Ethical Marketplace', subtitle: 'Access approved private pharmacy exchange', icon: 'shield-check-outline', route: '/marketplace/ethical/access' },
  { title: 'My ratings', subtitle: 'Relationship rating summary and history', icon: 'star-outline', route: '/profile/ratings' },
  { title: 'Pill rewards', subtitle: 'Balance, activity and referrals', icon: 'pill', route: '/rewards/pills' },
];

const explorerTools: PlatformTool[] = [
  { title: 'Marketplace', subtitle: 'Browse ChemistTasker Marketplace', icon: 'storefront-outline', route: '/marketplace' },
  { title: 'My ratings', subtitle: 'Relationship rating summary and history', icon: 'star-outline', route: '/profile/ratings' },
  { title: 'Pill rewards', subtitle: 'Balance, activity and referrals', icon: 'pill', route: '/rewards/pills' },
];

const managerRoles = new Set(['OWNER','ORGANIZATION','ORG_ADMIN','ORG_OWNER','ORG_STAFF','CHIEF_ADMIN','REGION_ADMIN']);

/** The work and platform tools this user may open (capability-gated); the dashboard card and the More tab list them. */
export function usePlatformTools(): PlatformTool[] {
  const { user, hasCapability } = useAuth();
  const { selectedPharmacyId } = useWorkspace();
  const role = String(user?.role || '').toUpperCase();
  return useMemo(() => {
    if (role === 'EXPLORER') return explorerTools;

    const canManageRoster = hasCapability('MANAGE_ROSTER', selectedPharmacyId);
    const canManageStaff = canManageRoster || hasCapability('MANAGE_STAFF', selectedPharmacyId);
    const isOrganizationRole = managerRoles.has(role);

    const delegated: PlatformTool[] = [];
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
}

export default function ParityToolsCard() {
  const router = useRouter();
  const tools = usePlatformTools();

  return (
    <View style={styles.section}>
      <Text variant="titleMedium" style={styles.heading}>Work & platform tools</Text>
      <View style={styles.grid}>
        {tools.map((tool) => (
          <Card
            key={tool.route}
            mode="outlined"
            style={styles.card}
            accessibilityLabel={`${tool.title}. ${tool.subtitle}`}
            onPress={() => router.push(tool.route as any)}
          >
            <Card.Content style={styles.content}>
              <View style={styles.icon} importantForAccessibility="no-hide-descendants"><Icon source={tool.icon} size={22} color={colors.primary} /></View>
              <View style={styles.copy}>
                <Text variant="titleSmall" style={styles.title}>{tool.title}</Text>
                <Text variant="bodySmall" style={styles.subtitle}>{tool.subtitle}</Text>
              </View>
              <View importantForAccessibility="no-hide-descendants"><Icon source="chevron-right" size={18} color={colors.textMuted} /></View>
            </Card.Content>
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: space.xl, marginBottom: space['2xl'], gap: space.md },
  heading: { color: colors.textPrimary, fontFamily: font.outfit.semiBold },
  grid: { gap: space.sm },
  card: { borderRadius: radius.card, backgroundColor: colors.surfaceBg, borderColor: colors.border },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: touch.min + space.md },
  icon: { width: touch.min, height: touch.min, borderRadius: radius.control, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { color: colors.textPrimary, fontFamily: font.inter.semiBold },
  subtitle: { color: colors.textSecondary, marginTop: space.xxs },
});
