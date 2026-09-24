import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useAuth } from '@/context/AuthContext';
import { brandColors, getPersonaPalette } from '@/constants/theme';

const horizontalPadding = 20;

export type HomeNavigationItem = {
  title: string;
  description?: string;
  icon: string;
  route: string;
  color?: string;
};

type HomeNavigationGridProps = {
  items: HomeNavigationItem[];
  onNavigate: (route: string) => void;
};

export default function HomeNavigationGrid({ items, onNavigate }: HomeNavigationGridProps) {
  const { user } = useAuth();
  const persona = getPersonaPalette(user?.role);

  return (
    <View style={styles.section}>
      <Text variant="titleMedium" style={styles.heading}>Quick access</Text>
      <View style={styles.grid}>
        {items.map((item) => (
          <Pressable
            key={`${item.route}-${item.title}`}
            accessibilityRole="button"
            accessibilityLabel={item.description ? `${item.title}. ${item.description}` : item.title}
            style={({ pressed }) => [
              styles.card,
              pressed && styles.cardPressed,
              { borderColor: persona.soft },
            ]}
            onPress={() => onNavigate(item.route)}
          >
            <View style={[styles.iconWrap, { backgroundColor: persona.soft }]}>
              <Icon source={item.icon} size={24} color={item.color || persona.accent} />
            </View>
            <View style={styles.copy}>
              <Text variant="titleSmall" style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              {item.description ? (
                <Text variant="bodySmall" style={styles.description} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <Icon source="chevron-right" size={20} color="#8A97AA" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: horizontalPadding,
    marginBottom: 24,
    gap: 12,
  },
  heading: {
    color: brandColors.navy,
    fontWeight: '800',
  },
  grid: {
    gap: 10,
  },
  card: {
    minHeight: 76,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: brandColors.white,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.995 }],
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: brandColors.navy,
    fontWeight: '800',
    lineHeight: 18,
  },
  description: {
    color: brandColors.body,
    marginTop: 3,
    lineHeight: 17,
  },
});
