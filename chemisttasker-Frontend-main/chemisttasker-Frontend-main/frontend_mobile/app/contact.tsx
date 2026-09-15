import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text, TextInput, Surface } from 'react-native-paper';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';
import { contactSupport } from '@chemisttasker/shared-core';

export default function ContactScreen() {
  const { user } = useAuth();
  const appVersion = useMemo(() => {
    const expo = Constants?.expoConfig;
    return typeof expo?.version === 'string' ? expo.version : '';
  }, []);
  const [form, setForm] = useState({
    name: user?.username || user?.email || '',
    email: user?.email || '',
    phone: '',
    subject: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const updateField = (key: keyof typeof form) => (value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.subject.trim() || !form.message.trim()) {
      Alert.alert('Missing info', 'Please complete all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      await contactSupport({
        ...form,
        source: 'mobile',
        app_version: appVersion,
      });
      Alert.alert('Sent', 'Thanks! Your message has been sent.');
      setForm({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send message.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text variant="headlineSmall" style={styles.title}>Contact Us</Text>
        <Text style={styles.subtitle}>Tell us what you need and we will get back to you.</Text>

        <Surface style={styles.formCard} elevation={0}>
          <TextInput
            label="Full Name"
            value={form.name}
            onChangeText={updateField('name')}
            style={styles.input}
          />
          <TextInput
            label="Email"
            value={form.email}
            onChangeText={updateField('email')}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />
          <TextInput
            label="Phone (optional)"
            value={form.phone}
            onChangeText={updateField('phone')}
            keyboardType="phone-pad"
            style={styles.input}
          />
          <TextInput
            label="Subject"
            value={form.subject}
            onChangeText={updateField('subject')}
            style={styles.input}
          />
          <TextInput
            label="Message"
            value={form.message}
            onChangeText={updateField('message')}
            multiline
            numberOfLines={6}
            style={[styles.input, styles.messageInput]}
          />
          <Button
            mode="contained"
            loading={submitting}
            disabled={submitting}
            onPress={handleSubmit}
            style={styles.submitButton}
          >
            {submitting ? 'Sending...' : 'Send Message'}
          </Button>
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  title: {
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    color: '#6B7280',
    marginTop: 6,
    marginBottom: 16,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  messageInput: {
    minHeight: 120,
  },
  submitButton: {
    marginTop: 8,
  },
});
