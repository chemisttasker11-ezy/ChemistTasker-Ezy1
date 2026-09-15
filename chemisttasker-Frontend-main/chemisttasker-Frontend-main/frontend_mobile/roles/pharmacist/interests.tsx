import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Card, Button, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PharmacistInterestsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.headerTitle}>Interests</Text>
        <Text variant="bodyMedium" style={styles.headerSubtitle}>Explore opportunities</Text>
      </View>

      <View style={styles.content}>
        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.iconContainer}>
              <IconButton icon="star-outline" size={48} iconColor="#6366F1" />
            </View>
            <Text variant="titleLarge" style={styles.title}>Coming Soon</Text>
            <Text variant="bodyMedium" style={styles.description}>
              We are working on a new way for you to explore and manage your professional interests. Stay tuned!
            </Text>
            {/* <Button
              mode="contained"
              buttonColor="#6366F1"
              style={styles.button}
              onPress={() => { }}
            >
              Notify Me
            </Button> */}
          </Card.Content>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerTitle: {
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    color: '#6B7280',
    marginTop: 4,
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  cardContent: {
    alignItems: 'center',
    padding: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  button: {
    width: '100%',
    borderRadius: 12,
  },
});
