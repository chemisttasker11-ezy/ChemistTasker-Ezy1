import React, { createContext, type ReactNode, useContext, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Building2,
  Check,
  ChevronDown,
  Globe,
  type LucideIcon,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react-native';
import { BottomSheet, ScalePressable } from '@/components/ui';
import { colors, font, persona, radius, space, touch, type } from '@/constants/tokens';
import { useAdminWorkspace } from '@/context/AdminWorkspaceContext';
import { usePersonaSwitch, useScopedDashboard } from '@/roles/shared/dashboard/dashboardScope';
import { useGuardedNavigation } from '@/roles/shared/forms/UnsavedChangesRegistryProvider';
import { getAssignmentId, getAssignmentPharmacyName } from '@/utils/mobilePersona';

type SwitchOption = {
  key: string;
  label: string;
  helper?: string;
  icon: LucideIcon;
  selected: boolean;
  onSelect: () => void | Promise<void>;
};

type SwitchGroup = {
  /** Pill text: the active persona or pharmacy. */
  label: string;
  icon: LucideIcon;
  sheetTitle: string;
  sheetSubtitle?: string;
  options: SwitchOption[];
  accent?: { bg: string; fg: string };
};

type WorkspaceSwitch = { persona: SwitchGroup | null; scope: SwitchGroup | null };

const SwitchContext = createContext<WorkspaceSwitch>({ persona: null, scope: null });

const personaTone = (role: string) => {
  const normalized = role.toUpperCase();
  if (normalized === 'OWNER') return persona.owner;
  if (normalized === 'PHARMACIST') return persona.pharmacist;
  if (normalized === 'OTHER_STAFF') return persona.otherStaff;
  if (normalized === 'EXPLORER') return persona.explorer;
  return persona.organization;
};
const pillTone = (tone: { softBg: string; textAA: string }) => ({ bg: tone.softBg, fg: tone.textAA });

export type RoleWorkspaceProps = {
  /** Role for persona switching (the dashboards passed the same value). */
  personaRole: string;
  /** Role whose dashboard scope the header pill sets; omit for no pharmacy scope (explorer). */
  scopeRole?: string;
  /** Organization dashboards also offer "All organization pharmacies". */
  allOrganizationPharmacies?: boolean;
};

/** Role personas: persona switch from usePersonaSwitch, pharmacy scope from useScopedDashboard. */
export function RoleWorkspaceProvider({
  personaRole,
  scopeRole,
  allOrganizationPharmacies = false,
  children,
}: RoleWorkspaceProps & { children: ReactNode }) {
  const switcher = usePersonaSwitch(personaRole);
  const scope = useScopedDashboard(scopeRole ?? personaRole);
  // Persona switches guard themselves in usePersonaSwitch; a scope change re-renders the screens, so ask first too.
  const guarded = useGuardedNavigation();
  const roleSelected = !switcher.activeAdmin && (!switcher.activeOrg || !switcher.canSwitchToOrg);

  const personaOptions: SwitchOption[] = [
    {
      key: 'role',
      label: switcher.roleLabel,
      icon: UserRound,
      selected: roleSelected,
      onSelect: switcher.openRoleWorkspace,
    },
    ...switcher.assignments.map((assignment) => {
      const assignmentId = getAssignmentId(assignment) as number;
      return {
        key: `admin-${assignmentId}`,
        label: 'Admin',
        helper: getAssignmentPharmacyName(assignment),
        icon: ShieldCheck,
        selected: false,
        onSelect: () => switcher.enterAdminWorkspace(assignmentId),
      };
    }),
    ...(switcher.canSwitchToOrg
      ? [{
          key: 'organization',
          label: 'Organization',
          icon: Building2,
          selected: switcher.activeOrg,
          onSelect: switcher.openOrganizationWorkspace,
        }]
      : []),
  ];

  const scopeOptions: SwitchOption[] = scopeRole
    ? [
        ...(allOrganizationPharmacies
          ? [{
              key: 'all',
              label: 'All organization pharmacies',
              icon: Store,
              selected: scope.workspace === 'internal' && scope.selectedPharmacyId == null,
              onSelect: () => guarded(scope.selectAllOrganizationPharmacies),
            }]
          : []),
        ...(scope.canSelectPlatform
          ? [{
              key: 'platform',
              label: 'ChemistTasker Platform',
              icon: Globe,
              selected: scope.workspace === 'platform',
              onSelect: () => guarded(scope.selectPlatform),
            }]
          : []),
        ...scope.pharmacies.map((pharmacy) => ({
          key: `pharmacy-${pharmacy.id}`,
          label: pharmacy.name,
          helper: pharmacy.helper,
          icon: Store,
          selected: scope.workspace === 'internal' && scope.selectedPharmacyId === pharmacy.id,
          onSelect: () => guarded(() => scope.selectPharmacy(pharmacy)),
        })),
      ]
    : [];

  const activePersona = personaOptions.find((option) => option.selected) ?? personaOptions[0];
  const value: WorkspaceSwitch = {
    persona:
      personaOptions.length > 1
        ? {
            label: activePersona.label,
            icon: activePersona.icon,
            sheetTitle: 'Switch workspace',
            options: personaOptions,
            accent: pillTone(activePersona.key === 'organization' ? persona.organization : personaTone(personaRole)),
          }
        : null,
    scope: scopeOptions.length
      ? {
          label: scope.scopeLabel,
          icon: scope.workspace === 'platform' ? Globe : Store,
          sheetTitle: 'Choose pharmacy',
          sheetSubtitle: 'Sets what your dashboard shows.',
          options: scopeOptions,
        }
      : null,
  };

  return <SwitchContext.Provider value={value}>{children}</SwitchContext.Provider>;
}

/** Delegated admin: return to the role or organization workspace; the scope pill picks the administered pharmacy. */
export function AdminWorkspaceSwitchProvider({ personaRole, children }: { personaRole: string; children: ReactNode }) {
  const switcher = usePersonaSwitch(personaRole);
  const { assignments, activeAssignment, activePharmacyName, selectAssignment } = useAdminWorkspace();
  const activeId = getAssignmentId(activeAssignment);
  const guarded = useGuardedNavigation();

  const personaOptions: SwitchOption[] = [
    { key: 'admin', label: 'Admin', icon: ShieldCheck, selected: true, onSelect: () => {} },
    { key: 'role', label: switcher.roleLabel, icon: UserRound, selected: false, onSelect: switcher.openRoleWorkspace },
    ...(switcher.canSwitchToOrg
      ? [{ key: 'organization', label: 'Organization', icon: Building2, selected: false, onSelect: switcher.openOrganizationWorkspace }]
      : []),
  ];

  const scopeOptions: SwitchOption[] = assignments
    .filter((assignment) => getAssignmentId(assignment) != null)
    .map((assignment) => {
      const assignmentId = getAssignmentId(assignment) as number;
      return {
        key: `assignment-${assignmentId}`,
        label: getAssignmentPharmacyName(assignment),
        icon: Store,
        selected: assignmentId === activeId,
        onSelect: () => guarded(() => void selectAssignment(assignmentId)),
      };
    });

  const value: WorkspaceSwitch = {
    persona: {
      label: 'Admin',
      icon: ShieldCheck,
      sheetTitle: 'Switch workspace',
      options: personaOptions,
      accent: pillTone(persona.admin),
    },
    scope: scopeOptions.length
      ? {
          label: activePharmacyName,
          icon: Store,
          sheetTitle: 'Administering pharmacy',
          sheetSubtitle: 'Choose the pharmacy whose admin workspace you want to open.',
          options: scopeOptions,
        }
      : null,
  };

  return <SwitchContext.Provider value={value}>{children}</SwitchContext.Provider>;
}

function SwitchPill({ group, grow }: { group: SwitchGroup; grow: boolean }) {
  const [open, setOpen] = useState(false);
  const accent = group.accent ?? { bg: colors.surfaceBg, fg: colors.textPrimary };
  const Icon = group.icon;
  // Nothing to switch to: a plain label, no chevron, no one-option sheet.
  const single = group.options.length <= 1;
  const target = [styles.pillTarget, grow ? styles.pillGrow : null];

  const pill = (
    <View
      style={[
        styles.pill,
        { backgroundColor: accent.bg, borderColor: group.accent ? accent.bg : colors.border },
      ]}
    >
      {/* The narrow persona pill beside a scope pill gives its icon's width to the label. */}
      {grow ? <Icon size={16} color={group.accent ? accent.fg : colors.textSecondary} strokeWidth={2} /> : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.pillText, { color: accent.fg }]}>
        {group.label}
      </Text>
      {single ? null : (
        <ChevronDown size={16} color={group.accent ? accent.fg : colors.textSecondary} strokeWidth={2} />
      )}
    </View>
  );

  if (single) {
    return (
      <View accessible accessibilityLabel={group.label} style={target}>
        {pill}
      </View>
    );
  }

  return (
    <>
      <ScalePressable
        onPress={() => setOpen(true)}
        accessibilityLabel={`${group.sheetTitle}. Current: ${group.label}`}
        accessibilityHint="Opens a list to switch"
        style={target}
      >
        {pill}
      </ScalePressable>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={group.sheetTitle} subtitle={group.sheetSubtitle}>
        <View style={styles.options}>
          {group.options.map((option) => {
            const OptionIcon = option.icon;
            return (
              <ScalePressable
                key={option.key}
                static
                pressBg
                haptic="selection"
                accessibilityRole="radio"
                accessibilityState={{ selected: option.selected, checked: option.selected }}
                accessibilityLabel={option.helper ? `${option.label}, ${option.helper}` : option.label}
                onPress={() => {
                  setOpen(false);
                  if (!option.selected) void option.onSelect();
                }}
                style={[styles.option, option.selected ? styles.optionSelected : null]}
              >
                <OptionIcon
                  size={20}
                  color={option.selected ? colors.accentStrong : colors.textSecondary}
                  strokeWidth={option.selected ? 2 : 1.75}
                />
                <View style={styles.optionCopy}>
                  <Text
                    numberOfLines={1}
                    style={[styles.optionLabel, option.selected ? styles.optionLabelSelected : null]}
                  >
                    {option.label}
                  </Text>
                  {option.helper ? (
                    <Text numberOfLines={1} style={styles.optionHelper}>
                      {option.helper}
                    </Text>
                  ) : null}
                </View>
                {option.selected ? <Check size={20} color={colors.accentStrong} strokeWidth={2} /> : null}
              </ScalePressable>
            );
          })}
        </View>
      </BottomSheet>
    </>
  );
}

/** Root-tab header left side: persona pill and pharmacy scope pill, or the screen title when neither applies. */
export function WorkspacePills({ title }: { title: string }) {
  const { persona: personaGroup, scope } = useContext(SwitchContext);
  if (!personaGroup && !scope) {
    return (
      <Text accessibilityRole="header" numberOfLines={1} style={styles.rootTitle}>
        {title}
      </Text>
    );
  }
  return (
    <View style={styles.pills}>
      {personaGroup ? <SwitchPill group={personaGroup} grow={!scope} /> : null}
      {scope ? <SwitchPill group={scope} grow /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rootTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: font.outfit.medium,
    fontSize: type.titleLarge.fontSize,
    lineHeight: type.titleLarge.lineHeight,
    letterSpacing: type.titleLarge.letterSpacing,
  },
  pills: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pillTarget: { minHeight: touch.min, justifyContent: 'center', flexShrink: 0, maxWidth: '42%' },
  // minWidth 0 lets a long pharmacy name truncate instead of pushing into the bell.
  pillGrow: { flexShrink: 1, minWidth: 0, maxWidth: '100%' },
  pill: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    height: 34,
    paddingLeft: space.md - 2,
    paddingRight: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillText: { flexShrink: 1, fontFamily: font.inter.semiBold, fontSize: 13, lineHeight: 18 },
  options: { gap: space.xs, paddingBottom: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
  },
  optionSelected: { backgroundColor: colors.tone.violet.bg },
  optionCopy: { flex: 1, minWidth: 0 },
  optionLabel: {
    color: colors.textPrimary,
    fontFamily: font.inter.medium,
    fontSize: type.bodyLarge.fontSize,
    lineHeight: 20,
  },
  optionLabelSelected: { fontFamily: font.inter.semiBold, color: colors.accentStrong },
  optionHelper: {
    marginTop: 1,
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
});
