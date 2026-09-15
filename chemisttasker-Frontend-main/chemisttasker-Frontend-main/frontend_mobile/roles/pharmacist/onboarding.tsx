import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, StyleSheet, View, Alert } from 'react-native';
import { Text, Button, ActivityIndicator, Chip, ProgressBar, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getOnboarding, updateOnboarding } from '@chemisttasker/shared-core';
import { useAuth } from '../../context/AuthContext';
import { StepSection, StepField, StepActions } from '../../components/pharmacistOnboardingSteps';
import { AHPRA_CONSENT_TEXT } from '../../constants/ahpraConsent';

export default function PharmacistOnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const [stepIndex, setStepIndex] = useState(0);

  // Basic Info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  // Professional
  const [abn, setAbn] = useState('');
  const [ahpraNumber, setAhpraNumber] = useState('');

  // Skills
  const [skills, setSkills] = useState('');

  // Banking
  const [accountName, setAccountName] = useState('');
  const [bsb, setBsb] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  // Rates
  const [preferredHourlyRate, setPreferredHourlyRate] = useState('');
  const [minimumRate, setMinimumRate] = useState('');
  const [overtimeMultiplier, setOvertimeMultiplier] = useState('1.5');
  const [weekendPremium, setWeekendPremium] = useState('1.25');

  // Load existing data
  useEffect(() => {
    loadOnboarding();
  }, []);

  const loadOnboarding = async () => {
    try {
      setLoading(true);
      const data: any = await getOnboarding('pharmacist');

      // Basic
      setFirstName(data.first_name || '');
      setLastName(data.last_name || '');
      setMobile(data.mobile || '');
      setDateOfBirth(data.date_of_birth || '');

      // Professional
      setAbn(data.abn || '');
      setAhpraNumber(data.ahpra_number || '');

      // Banking
      setAccountName(data.bank_account_name || '');
      setBsb(data.bsb || '');
      setAccountNumber(data.account_number || '');

      // Rates
      setPreferredHourlyRate(data.preferred_hourly_rate || '');
      setMinimumRate(data.minimum_rate || '');
      setOvertimeMultiplier(data.overtime_multiplier || '1.5');
      setWeekendPremium(data.weekend_premium || '1.25');

      // Progress
      setProgress(data.progress_percent || 0);
    } catch (err) {
      console.error('Failed to load onboarding:', err);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    'Basic Info',
    'Professional',
    'Skills',
    'Banking',
    'Rates',
  ];

  const handleSave = async (nextStep?: number) => {
    // Validation for current step
    if (stepIndex === 0 && (!firstName || !lastName || !mobile)) {
      Alert.alert('Missing Information', 'Please complete required fields');
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();

      formData.append('first_name', firstName);
      formData.append('last_name', lastName);
      formData.append('mobile', mobile);
      if (dateOfBirth) formData.append('date_of_birth', dateOfBirth);
      if (abn) formData.append('abn', abn);
      if (ahpraNumber) formData.append('ahpra_number', ahpraNumber);
      if (skills) formData.append('skills', skills);
      if (accountName) formData.append('bank_account_name', accountName);
      if (bsb) formData.append('bsb', bsb);
      if (accountNumber) formData.append('account_number', accountNumber);
      if (preferredHourlyRate) formData.append('preferred_hourly_rate', preferredHourlyRate);
      if (minimumRate) formData.append('minimum_rate', minimumRate);
      if (overtimeMultiplier) formData.append('overtime_multiplier', overtimeMultiplier);
      if (weekendPremium) formData.append('weekend_premium', weekendPremium);

      await updateOnboarding('pharmacist', formData);

      if (typeof nextStep === 'number') {
        setStepIndex(nextStep);
      }
      await loadOnboarding();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update profile');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={{ marginTop: 16, color: '#6B7280' }}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="headlineMedium" style={styles.headerTitle}>Complete Your Profile</Text>
          <Text variant="bodyMedium" style={styles.headerSubtitle}>
            Fill in your details to start accepting shifts
          </Text>
        </View>
        <IconButton icon="close" onPress={() => router.back()} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressHeader}>
          <Text variant="labelMedium" style={styles.progressLabel}>Profile Completion</Text>
          <Chip mode="flat" compact textStyle={{ color: '#6366F1', fontSize: 11, fontWeight: '600' }}>
            {progress}%
          </Chip>
        </View>
        <ProgressBar progress={progress / 100} color="#6366F1" style={styles.progressBar} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {stepIndex === 0 && (
          <StepSection title="Basic Information" description="Tell us who you are">
            <StepField label="First Name" value={firstName} onChangeText={setFirstName} required />
            <StepField label="Last Name" value={lastName} onChangeText={setLastName} required />
            <StepField label="Mobile Number" value={mobile} onChangeText={setMobile} required keyboardType="phone-pad" placeholder="+61 4XX XXX XXX" />
            <StepField label="Date of Birth" value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD" helperText="Format: YYYY-MM-DD" />
            <StepActions onNext={() => handleSave(1)} loading={submitting} nextLabel="Continue" />
          </StepSection>
        )}

        {stepIndex === 1 && (
          <StepSection title="Professional Details" description="Credentials and registration">
            <StepField label="ABN" value={abn} onChangeText={setAbn} keyboardType="numeric" placeholder="XX XXX XXX XXX" />
            <StepField label="AHPRA Number" value={ahpraNumber} onChangeText={setAhpraNumber} placeholder="PHAXXXXXX" helperText={AHPRA_CONSENT_TEXT} />
            <StepActions onPrev={() => setStepIndex(0)} onNext={() => handleSave(2)} loading={submitting} nextLabel="Next: Skills" />
          </StepSection>
        )}

        {stepIndex === 2 && (
          <StepSection title="Skills" description="Add your key skills">
            <StepField label="Skills" value={skills} onChangeText={setSkills} placeholder="e.g., vaccinations, aged care" />
            <StepActions onPrev={() => setStepIndex(1)} onNext={() => handleSave(3)} loading={submitting} nextLabel="Next: Banking" />
          </StepSection>
        )}

        {stepIndex === 3 && (
          <StepSection title="Banking Details" description="Required for payments">
            <StepField label="Account Name" value={accountName} onChangeText={setAccountName} />
            <StepField label="BSB" value={bsb} onChangeText={setBsb} keyboardType="numeric" placeholder="XXX-XXX" />
            <StepField label="Account Number" value={accountNumber} onChangeText={setAccountNumber} keyboardType="numeric" />
            <StepActions onPrev={() => setStepIndex(2)} onNext={() => handleSave(4)} loading={submitting} nextLabel="Next: Rates" />
          </StepSection>
        )}

        {stepIndex === 4 && (
          <StepSection title="Rate Preferences" description="Set your preferred rates (optional)">
            <StepField
              label="Preferred Hourly Rate"
              value={preferredHourlyRate}
              onChangeText={setPreferredHourlyRate}
              keyboardType="numeric"
              placeholder="e.g., 55.00"
              helperText="Your ideal hourly rate in AUD"
            />
            <StepField
              label="Minimum Acceptable Rate"
              value={minimumRate}
              onChangeText={setMinimumRate}
              keyboardType="numeric"
              placeholder="e.g., 45.00"
              helperText="Lowest rate you'll accept"
            />
            <StepField
              label="Overtime Multiplier"
              value={overtimeMultiplier}
              onChangeText={setOvertimeMultiplier}
              keyboardType="numeric"
              placeholder="e.g., 1.5"
              helperText="Multiplier for overtime hours (e.g., 1.5 = time and a half)"
            />
            <StepField
              label="Weekend Premium"
              value={weekendPremium}
              onChangeText={setWeekendPremium}
              keyboardType="numeric"
              placeholder="e.g., 1.25"
              helperText="Multiplier for weekend shifts"
            />
            <StepActions onPrev={() => setStepIndex(3)} onNext={() => handleSave()} loading={submitting} nextLabel="Save & Finish" />
          </StepSection>
        )}

        <Text variant="bodySmall" style={styles.footerNote}>
          * Required fields. You can update this information anytime.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    color: '#6B7280',
    marginTop: 4,
  },
  progressContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    color: '#4B5563',
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontWeight: 'bold',
    color: '#111827',
  },
  input: {
    marginBottom: 4,
    backgroundColor: '#FFFFFF',
  },
  saveButton: {
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 12,
  },
  saveButtonContent: {
    paddingVertical: 8,
  },
  footerNote: {
    textAlign: 'center',
    color: '#6B7280',
    fontStyle: 'italic',
  },
});
