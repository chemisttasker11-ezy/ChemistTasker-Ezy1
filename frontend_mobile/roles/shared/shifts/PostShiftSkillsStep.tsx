import type { Dispatch, SetStateAction } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { List, Surface, Text } from 'react-native-paper';
import skillsRegistry from '@chemisttasker/shared-core/skills_registry.json';
import { roleSkillGroups } from '@chemisttasker/shared-core';
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

  return (
    <Surface style={styles.card} elevation={1}>
      <Text style={styles.label}>Skills</Text>
      <View style={styles.infoAlert}>
        <Text style={styles.infoAlertText}>
          Select which skills are Required (must have to apply) or Favorable (nice to have, but not mandatory).
        </Text>
      </View>

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
                      </View>

                      <View style={styles.toggleGroup}>
                        <TouchableOpacity
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
                            Favorable
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
