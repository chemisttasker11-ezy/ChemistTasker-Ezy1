import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  findNodeHandle,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { ChevronLeft } from 'lucide-react-native';
import ProgressStepper from '@/components/ProgressStepper';
import { AuthNotice } from '@/components/AuthLayout';
import { Button, ContentState, ScalePressable } from '@/components/ui';
import { colors, radius, space, touch } from '@/constants/tokens';
import { durations, easings } from '@/constants/motion';
import { getOwnerSetupStatus, ownerSetupPaths } from '@/utils/ownerSetup';
import { useAuth } from '@/context/AuthContext';
import { useUnsavedChangesGuard } from '../shared/forms/useUnsavedChangesGuard';
import { useUnsavedChangesRegistry } from '../shared/forms/UnsavedChangesRegistryProvider';
import { ONBOARDING_STEPS, OnboardingProvider, useOwnerOnboardingForm } from './onboarding/_context';
import { SUBMIT_LABEL } from './onboarding/parts';
import OwnerOnboardingStep1 from './onboarding/step1';
import OwnerOnboardingStep2 from './onboarding/step2';
import OwnerOnboardingStep3 from './onboarding/step3';
import OwnerOnboardingReview from './onboarding/review';

const LAST_STEP = ONBOARDING_STEPS.length - 1;
const STEP_LABELS = [...ONBOARDING_STEPS];

const announce = (message: string) => {
  // Android reads the field's own live-region error; iOS needs the announcement.
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
};

/** The owner first run: one decision group per step, data kept across steps, one save at the end like web. */
function OwnerOnboardingFlow() {
  const router = useRouter();
  const state = useOwnerOnboardingForm();
  const { form, photo, loading, loadError, loadedSnapshot, saving, submitError, validateStep, submit } = state;
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [attempt, setAttempt] = useState(0);
  const titleRef = useRef<Text>(null);
  const firstRender = useRef(true);
  const insets = useSafeAreaInsets();
  const registry = useUnsavedChangesRegistry();

  const unsaved = useUnsavedChangesGuard(
    { form, photoPreview: photo.preview, photoUri: photo.uri, photoCleared: photo.cleared },
    // Same validated submit as Continue on the last step; navigation is left to the guard.
    { enabled: !loading, saving, onSave: () => saveAll() },
  );
  const { markClean } = unsaved;

  useEffect(() => {
    if (loadedSnapshot) markClean(loadedSnapshot as Parameters<typeof markClean>[0]);
    // The baseline is the loaded profile only, never later edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedSnapshot]);

  const goTo = (next: number) => {
    if (saving) return;
    setDirection(next > step ? 1 : -1);
    setAttempt(0);
    setStep(next);
  };

  const failAt = (at: number, message: string) => {
    if (at !== step) goTo(at);
    setAttempt((value) => value + 1);
    announce(message);
  };

  const saveAll = async () => {
    for (let at = 0; at < LAST_STEP; at += 1) {
      const message = Object.values(validateStep(at))[0];
      if (message) {
        failAt(at, message);
        return false;
      }
    }
    const saved = await submit();
    // Lets the guard pass this save's own navigation (the replace below or the dialog's).
    if (saved) markClean();
    return saved;
  };

  const finish = async () => {
    if (await saveAll()) router.replace(ownerSetupPaths.pharmacies as any);
  };

  const next = () => {
    if (step === LAST_STEP) {
      void finish();
      return;
    }
    const message = Object.values(validateStep(step))[0];
    if (message) failAt(step, message);
    else goTo(step + 1);
  };

  const back = () => {
    if (step > 0) goTo(step - 1);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (saving) return true;
      if (step > 0) {
        goTo(step - 1);
        return true;
      }
      // With history the removal guard asks; a cold start's Back exits with no removal event, so ask here first.
      if (router.canGoBack() || !registry?.isBlocking()) return false;
      void registry.requestNavigation(() => BackHandler.exitApp());
      return true;
    });
    return () => subscription.remove();
    // goTo only reads `step` and `saving`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, router, saving, step]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Move the screen reader to the new step's title once its enter animation has started.
    const timer = setTimeout(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 100);
    return () => clearTimeout(timer);
  }, [step]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.loading}>
          <ContentState kind="loading" />
        </View>
      </SafeAreaView>
    );
  }

  const stepProps = { titleRef, attempt, onContinue: next };
  const body =
    step === 0 ? (
      <OwnerOnboardingStep1 {...stepProps} />
    ) : step === 1 ? (
      <OwnerOnboardingStep2 {...stepProps} />
    ) : step === 2 ? (
      <OwnerOnboardingStep3 {...stepProps} />
    ) : (
      <OwnerOnboardingReview titleRef={titleRef} onEdit={goTo} />
    );
  const entering = (direction > 0 ? FadeInRight : FadeInLeft).duration(durations.fast).easing(easings.smoothOut);

  return (
    <OnboardingProvider value={state}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          {step > 0 ? (
            <ScalePressable
              onPress={back}
              accessibilityLabel={`Back to ${ONBOARDING_STEPS[step - 1]}`}
              style={styles.back}
              pressBg
            >
              <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
            </ScalePressable>
          ) : null}
          <View style={styles.progress}>
            <ProgressStepper currentStep={step + 1} totalSteps={STEP_LABELS.length} steps={STEP_LABELS} />
          </View>
        </View>

        {/* Edge-to-edge Android no longer resizes for the keyboard, so both platforms lift the footer here. */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
          <ScrollView
            key={step}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View entering={entering} style={styles.column}>
              {loadError && step === 0 ? <AuthNotice tone="error" message={loadError} /> : null}
              {/* Review shows its own; a failed dialog Save from steps 1-3 lands here. */}
              {submitError && step !== LAST_STEP ? <AuthNotice tone="error" message={submitError} /> : null}
              {body}
            </Animated.View>
          </ScrollView>

          {/* The white footer runs under the home indicator instead of leaving a page-colour strip. */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
            <View style={styles.footerColumn}>
              <Button
                label={step === LAST_STEP ? SUBMIT_LABEL : 'Continue'}
                busy={saving}
                busyLabel="Saving..."
                haptic={step === LAST_STEP ? 'medium' : 'light'}
                onPress={next}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </OnboardingProvider>
  );
}

export default function OwnerSetupOnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void getOwnerSetupStatus(user)
      .then((status) => {
        if (!active) return;
        if (!status.nextPath) {
          router.replace(ownerSetupPaths.dashboard as any);
          return;
        }
        if (status.nextPath && status.nextPath !== ownerSetupPaths.onboarding) {
          router.replace(status.nextPath as any);
        }
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err?.message || 'Unable to load owner setup.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [router, user?.id, retry]);

  if (loading || error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.loading}>
          {error ? (
            <ContentState
              kind="error"
              title="Owner setup didn't load"
              description={error}
              onAction={() => {
                setError('');
                setLoading(true);
                setRetry((value) => value + 1);
              }}
            />
          ) : (
            <ContentState kind="loading" />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return <OwnerOnboardingFlow />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.pageBg },
  loading: { flex: 1, justifyContent: 'center', padding: space.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: touch.min,
    paddingLeft: space.sm,
    paddingRight: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  back: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  // Without a back button the bar lines up with the content edge.
  progress: { flex: 1, paddingLeft: space.md },
  content: { flexGrow: 1, paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space['3xl'] },
  column: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: space.lg },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceBg,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  footerColumn: { width: '100%', maxWidth: 520, alignSelf: 'center' },
});
