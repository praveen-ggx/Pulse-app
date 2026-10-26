import type { AnimationObject } from 'lottie-react-native';
import type { ComponentType } from 'react';
import type { ImageSourcePropType } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import Theme from '@/constants/Theme';
import type { OnboardingPersonaId } from '@/lib/onboarding/constants';
import type { PulseMascotIllustrationId } from '@/lib/pulseMascotIllustrations';

export type OnboardingLottieAsset = {
  source: AnimationObject;
  glyphScale?: number;
  speed?: number;
};

export type OnboardingFeatureItem = OnboardingLottieAsset & {
  label: string;
  accent: string;
};

/** Pulse brand triad — brown ink, yellow gold, pastel blue. */
export const ONBOARDING_BRAND = {
  ink: Theme.brandBlueInk,
  yellow: Theme.accentGold,
  blue: Theme.brandBlue,
} as const;

export const ONBOARDING_PERSONA_LOTTIE: Record<OnboardingPersonaId, OnboardingLottieAsset> = {
  business_owner: {
    source: require('@/assets/Animated folder/business-startup.json'),
    glyphScale: 1.28,
  },
  driver: {
    source: require('@/assets/Animated folder/driver-license.json'),
    glyphScale: 1.22,
  },
  join_team: {
    source: require('@/assets/Animated folder/add-friend.json'),
    glyphScale: 1.2,
  },
  join_fleet: {
    source: require('@/assets/Animated folder/email-notification.json'),
    glyphScale: 1.18,
  },
};

export const ONBOARDING_PERSONA_ACCENT: Record<OnboardingPersonaId, string> = {
  business_owner: ONBOARDING_BRAND.blue,
  driver: ONBOARDING_BRAND.yellow,
  join_team: ONBOARDING_BRAND.ink,
  join_fleet: ONBOARDING_BRAND.yellow,
};

export const ONBOARDING_FEATURE_LOTTIE: readonly OnboardingFeatureItem[] = [
  {
    label: 'Trip management',
    source: require('@/assets/Animated folder/online-tracking.json'),
    glyphScale: 1.18,
    accent: ONBOARDING_BRAND.blue,
  },
  {
    label: 'Ledger management',
    source: require('@/assets/Animated folder/payment.json'),
    glyphScale: 1.15,
    accent: ONBOARDING_BRAND.yellow,
  },
  {
    label: 'Network management',
    source: require('@/assets/Animated folder/signals.json'),
    glyphScale: 1.12,
    accent: ONBOARDING_BRAND.ink,
  },
  {
    label: 'Bid management',
    source: require('@/assets/Animated folder/auction.json'),
    glyphScale: 1.15,
    accent: ONBOARDING_BRAND.yellow,
  },
  {
    label: 'Business chat',
    source: require('@/assets/Animated folder/Chat.json'),
    glyphScale: 1.12,
    accent: ONBOARDING_BRAND.blue,
  },
  {
    label: 'Driver app',
    source: require('@/assets/Animated folder/chat-with-driver.json'),
    glyphScale: 1.15,
    accent: ONBOARDING_BRAND.ink,
  },
] as const;

export const ONBOARDING_HERO_LOTTIE: OnboardingLottieAsset = {
  source: require('@/assets/Animated folder/logistics.json'),
  glyphScale: 1.2,
  speed: 0.9,
};

export type PulseProductVisual =
  | { type: 'lottie'; asset: OnboardingLottieAsset }
  | { type: 'image'; source: ImageSourcePropType; aspect?: number }
  | { type: 'svg'; Art: ComponentType<SvgProps>; aspect?: number }
  | { type: 'mascot'; id: PulseMascotIllustrationId };

/** Hub product tiles — Pulse Core & Pulse Pilot. */
export const PULSE_PRODUCT_VISUALS = {
  core: {
    type: 'image',
    source: require('@/assets/illustrations/pulse_mascot_cutout.png'),
    aspect: 691 / 877,
  },
  pilot: {
    type: 'image',
    source: require('@/assets/illustrations/otp_delivery_truck_mascot_cutout.png'),
    aspect: 1359 / 645,
  },
  commerce: {
    type: 'lottie',
    asset: {
      source: require('@/assets/Animated folder/warehouse-management.json'),
      glyphScale: 1.15,
    },
  },
} as const satisfies Record<'core' | 'pilot' | 'commerce', PulseProductVisual>;
