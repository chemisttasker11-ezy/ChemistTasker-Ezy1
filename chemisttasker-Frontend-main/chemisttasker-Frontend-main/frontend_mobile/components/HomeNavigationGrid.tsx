import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';

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
  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {items.map((item, index) => {
          const palette = navPalette[index % navPalette.length];
          const cardStyle = index % 5 === 3 || index % 5 === 4 ? styles.cardCompact : styles.card;
          return (
            <TouchableOpacity
              key={`${item.route}-${item.title}`}
              style={[cardStyle, { backgroundColor: palette.bg }]}
              onPress={() => onNavigate(item.route)}
              activeOpacity={0.78}
            >
              <IconButton icon={item.icon} size={38} iconColor={item.color || palette.icon} style={styles.icon} />
              <Text variant="titleSmall" style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              {item.description ? (
                <Text variant="bodySmall" style={styles.description} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const navPalette: readonly { bg: string; icon: string }[] = [
  { bg: '#EAF3F7', icon: '#0F5E83' },
  { bg: '#EEEAFB', icon: '#7C3AED' },
  { bg: '#E8F4EF', icon: '#087A5F' },
  { bg: '#FFF4E4', icon: '#D08A10' },
  { bg: '#EAF1FA', icon: '#1D5FA7' },
  { bg: '#FCE8F2', icon: '#C02672' },
  { bg: '#EAF3F1', icon: '#26866B' },
  { bg: '#F1EAFB', icon: '#7C3AED' },
  { bg: '#E8F0F5', icon: '#17617B' },
];

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: horizontalPadding,
    marginBottom: 24,
    padding: 8,
    borderRadius: 18,
    backgroundColor: '#EAF0F0',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  card: {
    width: '31.5%',
    minHeight: 136,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  cardCompact: {
    width: '31.5%',
    minHeight: 122,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  icon: {
    margin: 0,
    marginBottom: 8,
  },
  title: {
    color: '#111111',
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 18,
  },
  description: {
    color: '#111111',
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 15,
    opacity: 0.72,
  },
});
