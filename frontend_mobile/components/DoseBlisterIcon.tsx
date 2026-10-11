import React from 'react';
import { StyleSheet, View } from 'react-native';

/** Compact tablet-blister silhouette. Pure React Native, no new dependency. */
export function DoseBlisterIcon({ checked = false, size = 24 }: { checked?: boolean; size?: number }) {
  const scale = size / 24;
  return <View accessibilityLabel={checked ? 'Blister-pack final check' : 'Dose administration blister pack'} style={[styles.pack, { width: size, height: 26 * scale, padding: 2 * scale }]}>
    {Array.from({ length: 7 }, (_, row) => <View key={row} style={styles.row}>
      {Array.from({ length: 4 }, (_, col) => <View key={col} style={[styles.tablet, { width: 2.6 * scale, height: 1.5 * scale }]} />)}
    </View>)}
    {checked ? <View style={[styles.check, { width: 12 * scale, height: 12 * scale }]}><View style={[styles.tick, { width: 4 * scale, height: 7 * scale }]} /></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  pack: { width: 24, height: 26, flexShrink: 0, borderWidth: 1.5, borderColor: '#2463A6', borderRadius: 3, padding: 2, justifyContent: 'space-around' },
  row: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  tablet: { width: 2.6, height: 1.5, backgroundColor: '#2463A6', borderRadius: 1 },
  check: { position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#2463A6', alignItems: 'center', justifyContent: 'center' },
  tick: { width: 4, height: 7, marginTop: -2, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: '#2463A6', transform: [{ rotate: '45deg' }] }
});
