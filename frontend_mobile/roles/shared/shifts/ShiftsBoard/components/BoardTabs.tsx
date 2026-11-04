import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Pill } from '@/components/ui';
import { space } from '@/constants/tokens';

export type BoardTab = 'browse' | 'saved' | 'interested' | 'rejected' | 'accepted';

const TABS: { value: BoardTab; label: string }[] = [
    { value: 'browse', label: 'Browse' },
    { value: 'saved', label: 'Saved' },
    { value: 'interested', label: 'Interested' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'accepted', label: 'Offers' },
];

/** The Public and Community board views (web's board tabs) as one scrolling chip row: five never fit a phone row. */
export function BoardTabs({ value, onChange, savedCount }: { value: BoardTab; onChange: (tab: BoardTab) => void; savedCount: number }) {
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            style={styles.scroller}
            accessibilityLabel="Board views"
        >
            {TABS.map((tab) => {
                const label = tab.value === 'saved' && savedCount > 0 ? `Saved · ${savedCount}` : tab.label;
                return (
                    <Pill
                        key={tab.value}
                        label={label}
                        selected={value === tab.value}
                        onPress={() => onChange(tab.value)}
                        accessibilityLabel={tab.value === 'saved' ? `Saved, ${savedCount}` : tab.label}
                    />
                );
            })}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scroller: { flexGrow: 0 },
    row: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
});
