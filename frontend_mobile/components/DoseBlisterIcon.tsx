import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Compact tablet-blister silhouette. Pure React Native, no new dependency. */
export function DoseBlisterIcon({ checked = false }: { checked?: boolean }) {
  return <View accessibilityLabel={checked ? 'Blister-pack final check' : 'Dose administration blister pack'} style={styles.pack}>
    {[0,1,2,3].map(row => <View key={row} style={styles.row}>
      {[0,1,2].map(col => <View key={col} style={styles.tablet} />)}
    </View>)}
    {checked ? <View style={styles.check}><Text style={styles.tick}>✓</Text></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  pack: { width: 24, height: 26, borderWidth: 1.5, borderColor: '#2463A6', borderRadius: 3, padding: 2, justifyContent: 'space-around' },
  row: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  tablet: { width: 4, height: 3.2, borderWidth: 0.85, borderColor: '#2463A6', borderRadius: 3 },
  check: { position: 'absolute', right: -4, bottom: -4, borderRadius: 8, backgroundColor: '#E7F7F0', paddingHorizontal: 1 },
  tick: { fontWeight: '900', color: '#139568', fontSize: 13 }
});
