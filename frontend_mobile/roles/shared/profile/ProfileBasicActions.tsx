import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Surface, Text, Chip } from 'react-native-paper';
import { colors, font, radius, space, touch } from '@/constants/tokens';

type Persona = 'pharmacist' | 'otherstaff';

/** The web Basic Info screen has photo and mobile verification in the same
 * section. Expo already owns photo upload on Profile and OTP at /mobile-verify;
 * surface those existing operations here without copying their state machines.
 */
export default function ProfileBasicActions({ persona, verified, phone }: {
  persona: Persona;
  verified: boolean;
  phone: string;
}) {
  const router = useRouter();
  return (
    <Surface elevation={0} style={styles.panel}>
      <Text variant="titleMedium" style={styles.title}>Photo & verification</Text>
      <Text variant="bodySmall" style={styles.hint}>
        Your profile photo helps pharmacies recognise you in Hub and chat. Update it from your profile.
      </Text>
      <Button mode="outlined" icon="camera-outline"
        accessibilityLabel="Manage profile photo" contentStyle={styles.action}
        onPress={() => router.push(`/${persona}/profile` as any)}>
        Manage profile photo
      </Button>
      {verified ? (
        <Chip icon="check-circle-outline" style={styles.verified} textStyle={styles.verifiedText}>Mobile number verified</Chip>
      ) : (
        <View style={styles.verify}>
          <Text variant="bodySmall" style={styles.hint}>
            Verify your mobile to unlock the regular worker verification requirements.
          </Text>
          <Button mode="contained" icon="cellphone-check"
            contentStyle={styles.action} disabled={!phone.trim()}
            onPress={() => router.push('/mobile-verify?source=profile' as any)}>
            Verify mobile
          </Button>
          {!phone.trim() ? <Text style={styles.hint}>Enter a phone number to continue.</Text> : null}
        </View>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  panel: { padding: space.lg, gap: space.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceBg },
  title: { fontFamily: font.outfit.medium, color: colors.textPrimary },
  hint: { color: colors.textSecondary, lineHeight: 20 },
  action: { minHeight: touch.min },
  verify: { gap: space.sm },
  verified: { alignSelf: 'flex-start', backgroundColor: colors.status.green.bg },
  verifiedText: { color: colors.status.green.fg, fontFamily: font.inter.semiBold },
});
