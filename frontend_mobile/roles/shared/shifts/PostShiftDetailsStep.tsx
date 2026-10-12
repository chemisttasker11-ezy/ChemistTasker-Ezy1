import type { SupportEntry } from '@chemisttasker/shared-core';
import { ShiftContextFields } from '../pharmacies/PharmacyProfileFields';
import type { Dispatch, SetStateAction } from 'react';
import { TouchableOpacity, View } from 'react-native';
import {
  Button,
  Chip,
  IconButton,
  Menu,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';
import {
  EMPLOYMENT_TYPES,
  ROLE_OPTIONS,
  type PharmacyOption,
  type ShiftDescriptionTemplate,
} from './PostShiftScreen.helpers';
import { styles } from './PostShiftScreen.styles';

type Setter<T> = Dispatch<SetStateAction<T>>;

type Props = {
  pharmacyMenuVisible: boolean;
  setPharmacyMenuVisible: Setter<boolean>;
  pharmacies: PharmacyOption[];
  pharmacyId: number | '';
  setPharmacyId: Setter<number | ''>;
  roleNeeded: string;
  setRoleNeeded: Setter<string>;
  employmentType: string;
  setEmploymentType: Setter<string>;
  getEmploymentLabel: (value: string) => string;
  descriptionTemplateLoading: boolean;
  descriptionTemplate: ShiftDescriptionTemplate | null;
  descriptionTemplateSaving: boolean;
  handleUseDescriptionTemplate: () => void;
  handleSaveDescriptionTemplate: () => void | Promise<void>;
  description: string;
  setDescription: Setter<string>;
  workloadTags: string[];
  setWorkloadTags: Setter<string[]>;
  supportOnShift: SupportEntry[];
  setSupportOnShift: Setter<SupportEntry[]>;
};

const ROLE_LABELS: Record<string, string> = {
  PHARMACIST: 'Pharmacist', INTERN: 'Intern pharmacist', TECHNICIAN: 'Dispensary technician', ASSISTANT: 'Assistant', STUDENT: 'Pharmacy student',
};

const chipStyle = (selected: boolean) => [
  styles.chip,
  selected ? styles.chipSelected : styles.chipUnselected,
];
const chipTextStyle = (selected: boolean) =>
  selected ? styles.chipTextSelected : styles.chipText;

export default function PostShiftDetailsStep({
  pharmacyMenuVisible,
  setPharmacyMenuVisible,
  pharmacies,
  pharmacyId,
  setPharmacyId,
  roleNeeded,
  setRoleNeeded,
  employmentType,
  setEmploymentType,
  getEmploymentLabel,
  descriptionTemplateLoading,
  descriptionTemplate,
  descriptionTemplateSaving,
  handleUseDescriptionTemplate,
  handleSaveDescriptionTemplate,
  description,
  setDescription,
  workloadTags,
  setWorkloadTags,
  supportOnShift,
  setSupportOnShift,
}: Props) {
  const pharmacyName = pharmacies.find((pharmacy) => pharmacy.id === pharmacyId)?.name;
  return (
    <Surface style={styles.card} elevation={1}>
      <Text style={styles.label}>Who do you need?</Text>
      <View style={styles.pills} accessibilityRole="radiogroup">
        {ROLE_OPTIONS.map((role) => {
          const selected = roleNeeded === role;
          return (
            <Chip key={role} selected={selected} onPress={() => setRoleNeeded(role)} accessibilityRole="radio"
              accessibilityState={{ checked: selected }} style={chipStyle(selected)} textStyle={chipTextStyle(selected)}>
              {ROLE_LABELS[role] ?? role}
            </Chip>
          );
        })}
      </View>

      <Text style={styles.label}>Type of work</Text>
      <View style={styles.pills}>
        {EMPLOYMENT_TYPES.map((employment) => {
          const selected = employmentType === employment || (employment === 'LOCUM' && employmentType === 'CASUAL');
          return (
            <Chip key={employment} selected={selected} onPress={() => setEmploymentType(employment)}
              style={chipStyle(selected)} textStyle={chipTextStyle(selected)}>
              {getEmploymentLabel(employment)}
            </Chip>
          );
        })}
      </View>

      {pharmacies.length > 1 ? (
        <>
          <Text style={styles.label}>Pharmacy</Text>
          <Menu
            visible={pharmacyMenuVisible}
            onDismiss={() => setPharmacyMenuVisible(false)}
            anchor={
              <TouchableOpacity style={styles.selector} onPress={() => setPharmacyMenuVisible(true)}>
                <Text style={styles.selectorText}>{pharmacyName || 'Select pharmacy'}</Text>
                <IconButton icon="chevron-down" size={18} />
              </TouchableOpacity>
            }
          >
            {pharmacies.map((pharmacy) => (
              <Menu.Item key={pharmacy.id} title={pharmacy.name || `Pharmacy ${pharmacy.id}`}
                onPress={() => { setPharmacyId(pharmacy.id); setPharmacyMenuVisible(false); }} />
            ))}
          </Menu>
        </>
      ) : (
        <Text style={styles.templateStatus}>Pharmacy: {pharmacyName || 'Loading…'}</Text>
      )}

      <Text style={styles.label}>About the shift</Text>
      <TextInput
        mode="outlined"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        style={styles.input}
        label="Description"
        placeholder="For example: busy community pharmacy, Webster packs on Tuesdays."
      />
      <View style={styles.templateActions}>
        {descriptionTemplate?.description ? (
          <Button mode="text" compact onPress={handleUseDescriptionTemplate} style={styles.templateButton}>Use saved description</Button>
        ) : null}
        <Button
          mode="text"
          compact
          loading={descriptionTemplateSaving}
          disabled={descriptionTemplateLoading || descriptionTemplateSaving || !pharmacyId || !roleNeeded || !description.trim()}
          onPress={handleSaveDescriptionTemplate}
          style={styles.templateButton}
        >
          Save for future shifts
        </Button>
      </View>

      <Text style={styles.label}>On the day</Text>
      <ShiftContextFields workload={workloadTags} support={supportOnShift}
        onWorkloadChange={setWorkloadTags} onSupportChange={setSupportOnShift} />
    </Surface>
  );
}
