import { ROUTES } from '@/lib/routes';
import {
  PULSE_CORE_BRAND_WORD,
  PULSE_PILOT_BRAND_WORD,
} from '@/lib/brand/pulseBrandMark.tokens';

/** Active Pulse products — first-class software offerings. */
export type PulseProductId = 'core' | 'pilot' | 'commerce';

export type PulseProduct = {
  id: PulseProductId;
  /** Styled wordmark text — e.g. pulsecore */
  brandWord: string;
  name: string;
  tagline: string;
  features: string;
  route: string;
};

export type PulseProductPreview = {
  id: string;
  name: string;
};

export type WorkspaceAccessAction = {
  id: 'join_workspace' | 'join_driver';
  title: string;
  route: string;
  params?: Record<string, string>;
};

export const PULSE_PRODUCTS: readonly PulseProduct[] = [
  {
    id: 'core',
    brandWord: PULSE_CORE_BRAND_WORD,
    name: 'Pulse Core',
    tagline: 'Transport operating system',
    features: 'Operations • Fleet • Finance',
    route: ROUTES.ONBOARDING.BUSINESS,
  },
  {
    id: 'pilot',
    brandWord: PULSE_PILOT_BRAND_WORD,
    name: 'Pulse Pilot',
    tagline: 'Driver app',
    features: 'Trips • Navigation • Earnings',
    route: ROUTES.ONBOARDING.DRIVER,
  },
] as const;

export const PULSE_PRODUCTS_COMING_SOON: readonly PulseProductPreview[] = [
  { id: 'commerce', name: 'Pulse Commerce' },
  { id: 'finance-pro', name: 'Pulse Finance Pro' },
] as const;

export const WORKSPACE_ACCESS_ACTIONS: readonly WorkspaceAccessAction[] = [
  {
    id: 'join_workspace',
    title: 'Join an existing workspace',
    route: ROUTES.ONBOARDING.BUSINESS,
    params: { intent: 'team' },
  },
  {
    id: 'join_driver',
    title: 'Join as driver',
    route: '/driver-signup',
    params: { ref: 'invite' },
  },
] as const;
