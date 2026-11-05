import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, HelperText, Text, TextInput } from 'react-native-paper';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';
import { contactSupport } from '@chemisttasker/shared-core';
import { colors, radius, space, touch } from '@/constants/tokens';
import { contactTopics, validateContactForm, type ContactForm } from '@/features/support/contactModel';

export default function ContactScreen() {
  const { user } = useAuth();
  // A route may remain mounted across sign-out / account switching. Remount its
  // form so another user cannot see the previous account's draft or response.
  const sessionKey = user?.id != null ? `user:${user.id}` : user?.email ? `email:${user.email}` : 'guest';
  return <ContactForm key={sessionKey} user={user} />;
}

function ContactForm({ user }: { user: ReturnType<typeof useAuth>['user'] }) {
  const submittingRef = useRef(false);
  const appVersion = useMemo(() => {
    const expo = Constants?.expoConfig;
    return typeof expo?.version === 'string' ? expo.version : '';
  }, []);
  const initialName = user?.username || user?.email || '';
  const initialEmail = user?.email || '';
  const [form, setForm] = useState<ContactForm>({
    name: initialName,
    email: initialEmail,
    phone: '',
    subject: '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const topics = useMemo(() => contactTopics(user?.role), [user?.role]);

  const updateField = (key: keyof ContactForm) => (value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: '' }));
    setFeedback(null);
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    const validation = validateContactForm(form);
    setErrors(validation);
    if (Object.keys(validation).length) {
      setFeedback({ type: 'error', text: 'Review the highlighted fields before sending.' });
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setFeedback(null);
    try {
      await contactSupport({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
        source: 'mobile',
        app_version: appVersion,
      });
      setFeedback({ type: 'success', text: 'Your message has been submitted. Our team can reply using your email address.' });
      // Keep identity context available for subsequent questions; do not make the user retype it.
      setForm(prev => ({ ...prev, subject: '', message: '' }));
    } catch (failure: any) {
      setFeedback({ type: 'error', text: failure?.message || 'Your message could not be sent. You can retry without losing your text.' });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.heading}>
          <Text variant="headlineSmall" style={styles.title}>Contact ChemistTasker</Text>
          <Text style={styles.subtitle}>We can help with your pharmacy work, account and app experience. Choose a topic, then describe what you need.</Text>
        </View>
        <Card mode="outlined" style={styles.card}><Card.Content style={styles.form}>
          <Text variant="titleMedium" style={styles.sectionTitle}>What can we help with?</Text>
          <View style={styles.topics}>
            {topics.map(topic => <Chip key={topic} compact selected={form.subject === topic} onPress={() => updateField('subject')(topic)} disabled={submitting}>{topic}</Chip>)}
          </View>
          <TextInput mode="outlined" label="Subject" value={form.subject} onChangeText={updateField('subject')} maxLength={200} error={!!errors.subject} disabled={submitting} />
          {errors.subject ? <HelperText type="error">{errors.subject}</HelperText> : null}
          <TextInput mode="outlined" label="Your message" value={form.message} onChangeText={updateField('message')} multiline numberOfLines={6} maxLength={5000} style={styles.message} error={!!errors.message} disabled={submitting} />
          {errors.message ? <HelperText type="error">{errors.message}</HelperText> : null}
        </Card.Content></Card>
        <Card mode="outlined" style={styles.card}><Card.Content style={styles.form}>
          <Text variant="titleMedium" style={styles.sectionTitle}>Your contact details</Text>
          <TextInput mode="outlined" label="Full name" value={form.name} onChangeText={updateField('name')} error={!!errors.name} disabled={submitting} autoComplete="name" />
          {errors.name ? <HelperText type="error">{errors.name}</HelperText> : null}
          <TextInput mode="outlined" label="Email address" value={form.email} onChangeText={updateField('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={!!errors.email} disabled={submitting} />
          {errors.email ? <HelperText type="error">{errors.email}</HelperText> : null}
          <TextInput mode="outlined" label="Phone (optional)" value={form.phone} onChangeText={updateField('phone')} keyboardType="phone-pad" disabled={submitting} />
        </Card.Content></Card>
        {feedback ? <Text accessibilityRole="alert" style={feedback.type === 'success' ? styles.success : styles.error}>{feedback.text}</Text> : null}
        <Button mode="contained" onPress={() => void handleSubmit()} loading={submitting} disabled={submitting} contentStyle={styles.action}>Send message</Button>
        <Text style={styles.note}>Please avoid including passwords or other sensitive authentication information.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, paddingBottom: space['3xl'], gap: space.lg },
  heading: { gap: space.sm },
  title: { color: colors.textPrimary, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, lineHeight: 21 },
  card: { backgroundColor: colors.surfaceBg, borderRadius: radius.card, borderColor: colors.border },
  form: { gap: space.sm },
  sectionTitle: { color: colors.textPrimary, fontWeight: '700' },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: space.xs },
  message: { minHeight: 134 },
  action: { minHeight: touch.min },
  error: { color: colors.status.red.fg },
  success: { color: colors.status.green.fg },
  note: { color: colors.textMuted, fontSize: 12 },
});
