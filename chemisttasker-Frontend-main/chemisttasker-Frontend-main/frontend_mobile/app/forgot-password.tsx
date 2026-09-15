import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text, TextInput, Button, Surface } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { passwordReset } from '@chemisttasker/shared-core';
import AuthLayout from '../components/AuthLayout';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleReset = async () => {
    setError('');
    setMessage('');
    if (!email) {
      setError('Please enter your email');
      return;
    }
    setLoading(true);
    try {
      await passwordReset(email);
      setMessage('If an account exists, a reset link has been sent to your email.');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Reset password">
      <Text variant="bodyMedium" style={styles.subtitle}>
        Enter your email and we&apos;ll send reset instructions.
      </Text>

      {error ? (
        <Surface style={styles.errorContainer} elevation={1}>
          <Text style={styles.errorText}>{error}</Text>
        </Surface>
      ) : null}

      {message ? (
        <Surface style={styles.successContainer} elevation={1}>
          <Text style={styles.successText}>{message}</Text>
        </Surface>
      ) : null}

      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        mode="outlined"
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Button
        mode="contained"
        onPress={handleReset}
        loading={loading}
        disabled={loading}
        style={styles.button}
        contentStyle={styles.buttonContent}
      >
        Send reset link
      </Button>

      <Button mode="text" onPress={() => router.back()} style={styles.backButton}>
        Back to login
      </Button>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: '#4b5563',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#fff',
    marginTop: 8,
  },
  button: {
    marginTop: 16,
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  backButton: {
    marginTop: 8,
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  errorText: {
    color: '#c62828',
  },
  successContainer: {
    backgroundColor: '#ecfdf3',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  successText: {
    color: '#166534',
  },
});
