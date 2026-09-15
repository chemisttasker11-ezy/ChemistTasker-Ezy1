import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Surface } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen() {
    const router = useRouter();

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Surface style={styles.logoContainer} elevation={0}>
                    <Text variant="headlineLarge" style={styles.title}>
                        ChemistTasker
                    </Text>
                    <Text variant="titleMedium" style={styles.subtitle}>
                        Connecting Pharmacies with Professionals
                    </Text>
                </Surface>

                <View style={styles.buttonContainer}>
                    <Button
                        mode="contained"
                        onPress={() => router.push('/login')}
                        style={styles.button}
                        contentStyle={styles.buttonContent}
                    >
                        Login
                    </Button>

                    <Button
                        mode="outlined"
                        onPress={() => router.push('/register')}
                        style={styles.button}
                        contentStyle={styles.buttonContent}
                    >
                        Register
                    </Button>

                    <Button
                        mode="text"
                        onPress={() => { }}
                        style={styles.guestButton}
                    >
                        Continue as Guest
                    </Button>
                </View>

                <View style={styles.footer}>
                    <Text variant="bodySmall" style={styles.footerText}>
                        By continuing, you agree to our Terms of Service and Privacy Policy
                    </Text>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    content: {
        flex: 1,
        justifyContent: 'space-between',
        padding: 24,
    },
    logoContainer: {
        alignItems: 'center',
        paddingVertical: 60,
        backgroundColor: 'transparent',
    },
    title: {
        fontWeight: 'bold',
        marginBottom: 8,
        color: '#1976d2',
    },
    subtitle: {
        color: '#666',
        textAlign: 'center',
    },
    buttonContainer: {
        gap: 12,
    },
    button: {
        borderRadius: 8,
    },
    buttonContent: {
        paddingVertical: 8,
    },
    guestButton: {
        marginTop: 8,
    },
    footer: {
        alignItems: 'center',
        paddingTop: 20,
    },
    footerText: {
        color: '#999',
        textAlign: 'center',
    },
});
