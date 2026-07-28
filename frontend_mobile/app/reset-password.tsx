import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput, Button, Surface } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { passwordResetConfirm } from '@chemisttasker/shared-core';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';

export default function ResetPasswordScreen() {
    const router = useRouter();
    const { logout } = useAuth();
    const { uid, token } = useLocalSearchParams<{ uid: string; token: string }>();

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await passwordResetConfirm({
                uid: uid ?? '',
                token: token ?? '',
                new_password1: newPassword,
                new_password2: confirmPassword,
            });
            await logout();
            router.replace('/login');
        } catch {
            setError('Failed to reset password. The link may be invalid or expired.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout title="Set a New Password">
            {error ? (
                <Surface style={styles.errorContainer} elevation={1}>
                    <Text style={styles.errorText}>{error}</Text>
                </Surface>
            ) : null}

            <TextInput
                label="New Password"
                value={newPassword}
                onChangeText={setNewPassword}
                mode="outlined"
                style={styles.input}
                secureTextEntry={!showPassword}
                right={
                    <TextInput.Icon
                        icon={showPassword ? 'eye-off' : 'eye'}
                        onPress={() => setShowPassword((v) => !v)}
                    />
                }
            />

            <TextInput
                label="Confirm New Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                mode="outlined"
                style={styles.input}
                secureTextEntry={!showConfirmPassword}
                right={
                    <TextInput.Icon
                        icon={showConfirmPassword ? 'eye-off' : 'eye'}
                        onPress={() => setShowConfirmPassword((v) => !v)}
                    />
                }
            />

            <Button
                mode="contained"
                onPress={handleSubmit}
                loading={loading}
                disabled={loading}
                style={styles.button}
                contentStyle={styles.buttonContent}
            >
                Reset Password
            </Button>

            <View style={styles.backRow}>
                <Button mode="text" onPress={() => router.replace('/login')} style={styles.backButton}>
                    Back to login
                </Button>
            </View>
        </AuthLayout>
    );
}

const styles = StyleSheet.create({
    input: {
        backgroundColor: '#fff',
    },
    button: {
        marginTop: 8,
        borderRadius: 8,
    },
    buttonContent: {
        paddingVertical: 8,
    },
    backRow: {
        alignItems: 'center',
    },
    backButton: {
        marginTop: 4,
    },
    errorContainer: {
        backgroundColor: '#ffebee',
        padding: 12,
        borderRadius: 8,
    },
    errorText: {
        color: '#c62828',
    },
});
