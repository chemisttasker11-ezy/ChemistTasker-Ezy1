import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Checkbox, IconButton, Modal, Portal, Text, TextInput } from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';

export type TalentFilterState = {
  search: string;
  roles: string[];
  workTypes: string[];
  states: string[];
  skills: string[];
  willingToTravel: boolean;
  placementSeeker: boolean;
  availabilityStart: string | null;
  availabilityEnd: string | null;
};

const toggleList = (list: string[], value: string) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

const FilterSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

export default function FiltersSidebar({
  visible,
  onDismiss,
  filters,
  onChange,
  roleOptions,
  stateOptions,
  workTypeOptions,
  roleSkillOptions,
  softwareOptions,
  expandedRoleSkills,
  onToggleRoleSkillExpand,
}: {
  visible: boolean;
  onDismiss: () => void;
  filters: TalentFilterState;
  onChange: (next: TalentFilterState) => void;
  roleOptions: string[];
  stateOptions: string[];
  workTypeOptions: string[];
  roleSkillOptions: Record<string, string[]>;
  softwareOptions: string[];
  expandedRoleSkills: Record<string, boolean>;
  onToggleRoleSkillExpand: (role: string) => void;
}) {
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <Text variant="titleMedium" style={styles.title}>Filters</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          <TextInput
            mode="outlined"
            placeholder="Role, City, Ref #..."
            value={filters.search}
            onChangeText={(value) => onChange({ ...filters, search: value })}
            left={<TextInput.Icon icon="magnify" />}
          />

          <FilterSection title="Quick Filters">
            <Checkbox.Item
              label="Open to Travel"
              status={filters.willingToTravel ? 'checked' : 'unchecked'}
              onPress={() => onChange({ ...filters, willingToTravel: !filters.willingToTravel })}
              position="leading"
            />
            <Checkbox.Item
              label="Students & Interns"
              status={filters.placementSeeker ? 'checked' : 'unchecked'}
              onPress={() => onChange({ ...filters, placementSeeker: !filters.placementSeeker })}
              position="leading"
            />
          </FilterSection>

          <FilterSection title="Role Type & Skills">
            {roleOptions.map((role) => {
              const hasSkills = (roleSkillOptions[role] || []).length > 0;
              const expanded = expandedRoleSkills[role] ?? false;
              return (
                <View key={role}>
                  <View style={styles.rowBetween}>
                    <Checkbox.Item
                      label={role}
                      status={filters.roles.includes(role) ? 'checked' : 'unchecked'}
                      onPress={() => onChange({ ...filters, roles: toggleList(filters.roles, role) })}
                      position="leading"
                      style={{ flex: 1 }}
                    />
                    {hasSkills ? (
                      <IconButton icon={expanded ? 'chevron-up' : 'chevron-down'} onPress={() => onToggleRoleSkillExpand(role)} />
                    ) : null}
                  </View>
                  {hasSkills && expanded ? (
                    <View style={styles.subSection}>
                      {roleSkillOptions[role].map((skill) => (
                        <Checkbox.Item
                          key={skill}
                          label={skill}
                          status={filters.skills.includes(skill) ? 'checked' : 'unchecked'}
                          onPress={() => onChange({ ...filters, skills: toggleList(filters.skills, skill) })}
                          position="leading"
                          labelStyle={{ fontSize: 12 }}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </FilterSection>

          <FilterSection title="Software Proficiency">
            {softwareOptions.map((skill) => (
              <Checkbox.Item
                key={skill}
                label={skill}
                status={filters.skills.includes(skill) ? 'checked' : 'unchecked'}
                onPress={() => onChange({ ...filters, skills: toggleList(filters.skills, skill) })}
                position="leading"
              />
            ))}
          </FilterSection>

          <FilterSection title="Engagement Type">
            {workTypeOptions.map((type) => (
              <Checkbox.Item
                key={type}
                label={type}
                status={filters.workTypes.includes(type) ? 'checked' : 'unchecked'}
                onPress={() => onChange({ ...filters, workTypes: toggleList(filters.workTypes, type) })}
                position="leading"
              />
            ))}
          </FilterSection>

          <FilterSection title="Availability Dates">
            <Button mode="outlined" onPress={() => setStartPickerOpen(true)}>
              Start: {filters.availabilityStart ?? 'Any'}
            </Button>
            <View style={{ height: 8 }} />
            <Button mode="outlined" onPress={() => setEndPickerOpen(true)}>
              End: {filters.availabilityEnd ?? 'Any'}
            </Button>
          </FilterSection>

          <FilterSection title="Location (State)">
            {stateOptions.map((state) => (
              <Checkbox.Item
                key={state}
                label={state}
                status={filters.states.includes(state) ? 'checked' : 'unchecked'}
                onPress={() => onChange({ ...filters, states: toggleList(filters.states, state) })}
                position="leading"
              />
            ))}
          </FilterSection>

          <Button
            mode="outlined"
            onPress={() =>
              onChange({
                search: '',
                roles: [],
                workTypes: [],
                states: [],
                skills: [],
                willingToTravel: false,
                placementSeeker: false,
                availabilityStart: null,
                availabilityEnd: null,
              })
            }
          >
            Clear Filters
          </Button>
        </ScrollView>

        <DatePickerModal
          mode="single"
          locale="en"
          visible={startPickerOpen}
          onDismiss={() => setStartPickerOpen(false)}
          date={filters.availabilityStart ? new Date(`${filters.availabilityStart}T00:00:00`) : new Date()}
          onConfirm={({ date }) => {
            onChange({ ...filters, availabilityStart: date ? date.toISOString().split('T')[0] : null });
            setStartPickerOpen(false);
          }}
        />
        <DatePickerModal
          mode="single"
          locale="en"
          visible={endPickerOpen}
          onDismiss={() => setEndPickerOpen(false)}
          date={filters.availabilityEnd ? new Date(`${filters.availabilityEnd}T00:00:00`) : new Date()}
          onConfirm={({ date }) => {
            onChange({ ...filters, availabilityEnd: date ? date.toISOString().split('T')[0] : null });
            setEndPickerOpen(false);
          }}
        />
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    maxHeight: '92%',
  },
  title: { marginBottom: 12, fontWeight: '700' },
  section: {
    marginTop: 12,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 8,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    color: '#6B7280',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 4,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subSection: { paddingLeft: 16 },
});
