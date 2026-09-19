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
  WORKLOAD_TAGS,
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
}: Props) {
  return (
    <Surface style={styles.card} elevation={1}>
      <Text style={styles.label}>Pharmacy</Text>
      <Menu
        visible={pharmacyMenuVisible}
        onDismiss={() => setPharmacyMenuVisible(false)}
        anchor={
          <TouchableOpacity style={styles.selector} onPress={() => setPharmacyMenuVisible(true)}>
            <Text style={styles.selectorText}>
              {pharmacies.find((pharmacy) => pharmacy.id === pharmacyId)?.name || 'Select pharmacy'}
            </Text>
            <IconButton icon="chevron-down" size={18} />
          </TouchableOpacity>
        }
      >
        {pharmacies.map((pharmacy) => (
          <Menu.Item
            key={pharmacy.id}
            onPress={() => {
              setPharmacyId(pharmacy.id);
              setPharmacyMenuVisible(false);
            }}
            title={pharmacy.name || `Pharmacy ${pharmacy.id}`}
          />
        ))}
      </Menu>

      <Text style={styles.label}>Role Needed</Text>
      <View style={styles.pills}>
        {ROLE_OPTIONS.map((role) => {
          const selected = roleNeeded === role;
          return (
            <Chip
              key={role}
              selected={selected}
              onPress={() => setRoleNeeded(role)}
              style={chipStyle(selected)}
              textStyle={chipTextStyle(selected)}
            >
              {role}
            </Chip>
          );
        })}
      </View>

      <Text style={styles.label}>Employment Type</Text>
      <View style={styles.pills}>
        {EMPLOYMENT_TYPES.map((employment) => {
          const selected =
            employmentType === employment ||
            (employment === 'LOCUM' && employmentType === 'CASUAL');
          return (
            <Chip
              key={employment}
              selected={selected}
              onPress={() => setEmploymentType(employment)}
              style={chipStyle(selected)}
              textStyle={chipTextStyle(selected)}
            >
              {getEmploymentLabel(employment)}
            </Chip>
          );
        })}
      </View>

      <Text style={styles.label}>Description</Text>
      <Text style={styles.templateStatus}>
        {descriptionTemplateLoading
          ? 'Loading role description template...'
          : descriptionTemplate?.description
            ? 'Role description template available'
            : 'No role description template saved yet'}
      </Text>
      <View style={styles.templateActions}>
        <Button
          mode="outlined"
          compact
          disabled={!descriptionTemplate?.description}
          onPress={handleUseDescriptionTemplate}
          style={styles.templateButton}
        >
          Use Template
        </Button>
        <Button
          mode="contained"
          compact
          loading={descriptionTemplateSaving}
          disabled={
            descriptionTemplateSaving ||
            !pharmacyId ||
            !roleNeeded ||
            !description.trim()
          }
          onPress={handleSaveDescriptionTemplate}
          style={styles.templateButton}
        >
          Save as Template
        </Button>
      </View>
      <TextInput
        mode="outlined"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        style={styles.input}
        placeholder="Duties, expectations, notes"
      />

      <Text style={styles.label}>Workload Tags</Text>
      <View style={styles.pills}>
        {WORKLOAD_TAGS.map((tag) => {
          const selected = workloadTags.includes(tag);
          return (
            <Chip
              key={tag}
              selected={selected}
              onPress={() =>
                setWorkloadTags((current) =>
                  current.includes(tag)
                    ? current.filter((value) => value !== tag)
                    : [...current, tag],
                )
              }
              style={chipStyle(selected)}
              textStyle={chipTextStyle(selected)}
            >
              {tag}
            </Chip>
          );
        })}
      </View>
    </Surface>
  );
}
