import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { passwordReset } from '@chemisttasker/shared-core';
import AuthLayout, { AuthLink, AuthNotice } from '../components/AuthLayout';
import { Button, TextField } from '@/components/ui';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (loading) return;
    setError('');
    setMessage('');
    const address = email.trim().toLowerCase();
    if (!address) {
      setError('Please enter your email');
      return;
    }
    setLoading(true);
    try {
      await passwordReset(address);
      setMessage('If an account exists, a reset link has been sent to your email.');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send reset instructions."
      onBack={router.canGoBack() ? () => router.back() : undefined}
      backDisabled={loading}
      footer={
        // Always the sign-in screen: arriving from register's duplicate-email notice, back() would return there.
        <AuthLink label="Back to login" onPress={() => router.replace('/login')} disabled={loading} />
      }
    >
      {error ? <AuthNotice tone="error" message={error} /> : null}
      {message ? <AuthNotice tone="success" message={message} /> : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="send"
        onSubmitEditing={() => void handleReset()}
        disabled={loading}
      />

      <Button
        label={message ? 'Send again' : 'Send reset link'}
        busyLabel="Sending"
        onPress={() => void handleReset()}
        busy={loading}
        haptic="light"
      />
    </AuthLayout>
  );
}
