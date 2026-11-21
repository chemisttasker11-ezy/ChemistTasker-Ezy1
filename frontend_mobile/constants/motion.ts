import { Easing } from 'react-native-reanimated';

export const durations = {
  stagger: 40,
  micro: 80,
  quick: 150,
  fast: 250,
  medium: 350,
  slow: 400,
} as const;

export const duration = durations;

export const easings = {
  smoothOut: Easing.bezier(0.22, 1, 0.36, 1),
  inOut: Easing.inOut(Easing.ease),
};

export const easing = easings;

export const spring = {
  springTight: {
    damping: 24,
    stiffness: 280,
    mass: 0.9,
  },
  tight: {
    damping: 24,
    stiffness: 280,
    mass: 0.9,
  },
} as const;

export const motion = {
  duration: durations,
  durations,
  easing: easings,
  easings,
  spring,
} as const;

export type MotionTokens = typeof motion;
export type DurationTokens = typeof durations;
export type SpringTokens = typeof spring;
