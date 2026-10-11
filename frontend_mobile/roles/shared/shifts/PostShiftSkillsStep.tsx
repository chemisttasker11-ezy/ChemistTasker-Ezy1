import type { Dispatch, SetStateAction } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Chip, List, Surface, Text } from 'react-native-paper';
import skillsRegistry from '@chemisttasker/shared-core/skills_registry.json';
import { roleSkillGroups, claimModeLabel, skillLabel } from '@chemisttasker/shared-core';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { DoseBlisterIcon } from '../../../components/DoseBlisterIcon';
import { PRIMARY } from './PostShiftScreen.helpers';
import { styles } from './PostShiftScreen.styles';

type Setter<T> = Dispatch<SetStateAction<T>>;

type Props = {
  roleNeeded: string;
  mustHave: string[];
  setMustHave: Setter<string[]>;
  niceToHave: string[];
  setNiceToHave: Setter<string[]>;
};

export default function PostShiftSkillsStep({
  roleNeeded,
  mustHave,
  setMustHave,
  niceToHave,
  setNiceToHave,
}: Props) {
  const categories = roleSkillGroups(skillsRegistry as any, roleNeeded as any).map(group => ({
    key: group.key, title: group.label, items: group.items
  }));
  const available = new Set(categories.flatMap(category => category.items.map(skill => skill.code)));
  const previous = Array.from(new Set([...mustHave, ...niceToHave])).filter(code => !available.has(code));

  return (
    <Surface style={styles.card} elevation={1}>
      <Text style={styles.label}>Skills</Text>
      <View style={styles.infoAlert}>
        <Text style={styles.infoAlertText}>
          Select only essential skills as Required. Choose Preferred for skills that can be learned on the job.
        </Text>
      </View>
      {previous.length > 0 ? <View style={{ gap: 8 }}>
        <Text>Review requirements unavailable for this role before saving.</Text>
        {previous.map(code => <Chip key={code} onClose={() => {
          setMustHave(values => values.filter(value => value !== code));
          setNiceToHave(values => values.filter(value => value !== code));
        }}>{skillLabel(skillsRegistry as any, code)}</Chip>)}
      </View> : null}

      <List.AccordionGroup>
        {categories.map((category) => {
          const selectedCount = category.items.filter(
            (skill: any) =>
              mustHave.includes(skill.code) || niceToHave.includes(skill.code),
          ).length;

          return (
            <List.Accordion
              key={category.key}
              id={category.key}
              title={category.title}
              titleStyle={{ fontWeight: '700', color: '#111827' }}
              description={selectedCount > 0 ? `${selectedCount} selected` : undefined}
              descriptionStyle={{ color: PRIMARY, fontWeight: '600' }}
              style={styles.accordionHeader}
            >
              <View style={styles.skillGrid}>
                {category.items.map((skill: any) => {
                  const isRequired = mustHave.includes(skill.code);
                  const isFavorable = niceToHave.includes(skill.code);

                  return (
                    <View
                      key={skill.code}
                      style={[
                        styles.skillTile,
                        isRequired && {
                          backgroundColor: 'rgba(109, 40, 217, 0.06)',
                        },
                        isFavorable && {
                          backgroundColor: 'rgba(16, 185, 129, 0.08)',
                        },
                      ]}
                    >
                      <View style={styles.skillTextContainer}>
                        {skill.icon_mobile === 'BLISTER_PACK' || skill.icon_mobile === 'BLISTER_CHECK' ? <DoseBlisterIcon checked={skill.icon_mobile === 'BLISTER_CHECK'} /> : <MaterialCommunityIcons name={skill.icon_mobile as any} size={21} color="#2463A6" />}
                        <Text
                          style={[
                            styles.skillLabel,
                            isRequired || isFavorable
                              ? { fontWeight: '700' }
                              : {},
                          ]}
                        >
                          {skill.label}
                        </Text>
                        {skill.definition ? (
                          <Text style={styles.skillDescription}>
                            {skill.definition}
                          </Text>
                        ) : null}
                        {claimModeLabel(skill.eligibility[roleNeeded]) ? <Text style={styles.skillDescription}>{claimModeLabel(skill.eligibility[roleNeeded])}</Text> : null}
                      </View>

                      <View style={styles.toggleGroup}>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`${skill.label}: required`}
                          accessibilityState={{ selected: isRequired }}
                          style={[
                            styles.toggleBtn,
                            styles.toggleBtnLeft,
                            isRequired && styles.toggleBtnRequiredActive,
                          ]}
                          onPress={() => {
                            setMustHave((previous) =>
                              previous.includes(skill.code)
                                ? previous.filter((code) => code !== skill.code)
                                : [...previous, skill.code],
                            );
                            setNiceToHave((previous) =>
                              previous.filter((code) => code !== skill.code),
                            );
                          }}
                        >
                          <Text
                            style={[
                              styles.toggleBtnText,
                              isRequired && styles.toggleBtnTextActive,
                            ]}
                          >
                            Required
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`${skill.label}: preferred`}
                          accessibilityState={{ selected: isFavorable }}
                          style={[
                            styles.toggleBtn,
                            styles.toggleBtnRight,
                            isFavorable && styles.toggleBtnFavorableActive,
                          ]}
                          onPress={() => {
                            setNiceToHave((previous) =>
                              previous.includes(skill.code)
                                ? previous.filter((code) => code !== skill.code)
                                : [...previous, skill.code],
                            );
                            setMustHave((previous) =>
                              previous.filter((code) => code !== skill.code),
                            );
                          }}
                        >
                          <Text
                            style={[
                              styles.toggleBtnText,
                              isFavorable && styles.toggleBtnTextActive,
                            ]}
                          >
                            Preferred
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </List.Accordion>
          );
        })}
      </List.AccordionGroup>
    </Surface>
  );
}
