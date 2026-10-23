import type { OperatingModel } from '@/features/auth/services/auth.service';

export type BusinessType = 'INDIVIDUAL' | 'SOLE_PROPRIETOR' | 'PARTNERSHIP' | 'PVT_LTD' | 'LLP' | 'OPC' | 'OTHER';
export type EmployeeCount = '1-10' | '11-50' | '51-200' | '201-500' | '500+';
export type FleetSize = '1-5' | '6-15' | '16-30' | '31-50' | '50+';
export type MonthlyVolume = '<50' | '50-200' | '200-500' | '500-1000' | '1000+';

export const OTP_LENGTH = 6;
export const DEBOUNCE_MS = 600;
/** Background phone-exists lookup while typing — shorter than org-name debounce. */
export const PHONE_CHECK_DEBOUNCE_MS = 280;
/** Fail open if phone lookup hangs (RPC + edge fallback). */
export const PHONE_LOOKUP_TIMEOUT_MS = 3500;
export const OTP_RESEND_SECS = 30;
export const EMAIL_RESEND_SECS = 60;
export const DESKTOP_BREAKPOINT = 1024;
export const DESKTOP_MAX_PANEL_WIDTH = 560;
/** Centered signup card width on desktop web. */
export const DESKTOP_SIGNUP_CARD_WIDTH = 560;
/** Inner form column max width inside desktop card. */
export const DESKTOP_SIGNUP_FORM_WIDTH = 480;
/** Desktop split — flow column max width (right panel). Use full pane width; cap for very wide screens. */
export const DESKTOP_SIGNUP_SPLIT_FLOW_MAX = 560;
/** Horizontal inset inside the right split pane (keep modest — pane is already half viewport). */
export const DESKTOP_SIGNUP_SPLIT_PAD = 28;
/** Vertical inset for split-pane flow columns (left marketing + right form). */
export const DESKTOP_SIGNUP_SPLIT_FLOW_PAD_Y = 36;
/** Left marketing rail — logo + copy share this gutter for alignment. */
export const DESKTOP_SPLIT_MARKETING_GUTTER = 40;
/** Brand mark inset from top of split pane. */
export const DESKTOP_SPLIT_BRAND_TOP = 32;
/** Reserved space below logo before marketing copy (prevents overlap on short panes). */
export const DESKTOP_SPLIT_BRAND_CLEARANCE = 16;
/** Scroll end padding so fields clear the sticky footer. */
export const SIGNUP_FORM_FOOTER_CLEARANCE = 24;
/** Room above the in-step sticky footer (mobile account step). */
export const SIGNUP_STICKY_FOOTER_CLEARANCE = 68;
/** Mobile shell progress rail — inline-primary scroll clearance. */
export const SIGNUP_MOBILE_PROGRESS_CLEARANCE = 52;
/** Account step: room below confirm password for progress rail + mobile keyboard. */
export const SCROLL_BOTTOM_PAD = 24;
export const SIGNUP_ACCOUNT_SCROLL_PAD = 140;
export const SIGNUP_ACCOUNT_MOBILE_SCROLL_PAD = 40;
/** Extra scroll margin when a password field is focused (keyboard + iOS accessory). */
export const SIGNUP_PASSWORD_SCROLL_PAD = 64;
export const SIGNUP_CONFIRM_PASSWORD_SCROLL_PAD = 104;
export const CONFIRM_SCROLL_DELAY_MS = 150;

/** Short labels — 8 steps on ~390px web; longer names overlap in the progress rail. */
export const STEP_LABELS = ['Phone', 'Verify', 'Org', 'Profile', 'City', 'Account', 'Logo', 'Photo'] as const;

export const BUSINESS_ACTIVATION_HEADERS: Record<
  number,
  { title: string; subtitle: string }
> = {
  0: {
    title: 'Identity',
    subtitle: 'Verify mobile to begin workspace provisioning',
  },
  1: {
    title: 'Verification',
    subtitle: 'Confirm the code sent to your number',
  },
  2: {
    title: 'Workspace',
    subtitle: 'Name your operator on the Pulse network',
  },
  3: {
    title: 'Operations profile',
    subtitle: 'Fleet model, scale, and structure',
  },
  4: {
    title: 'Base location',
    subtitle: 'Primary office for dispatch context',
  },
  5: {
    title: 'Credentials',
    subtitle: 'Secure account before activation',
  },
};

export const OPERATING_MODELS: { value: OperatingModel; label: string; sub: string }[] = [
  { value: 'ASSET_BASED', label: 'Asset', sub: 'Own trucks' },
  { value: 'NON_ASSET', label: 'Aggregate', sub: 'Broker only' },
  { value: 'HYBRID', label: 'Both', sub: 'Mixed fleet' },
];

export const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'SOLE_PROPRIETOR', label: 'Sole Proprietor' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'PVT_LTD', label: 'Pvt. Limited' },
  { value: 'LLP', label: 'LLP' },
  { value: 'OPC', label: 'OPC' },
  { value: 'OTHER', label: 'Other' },
];

export const EMPLOYEE_COUNTS: EmployeeCount[] = ['1-10', '11-50', '51-200', '201-500', '500+'];
export const FLEET_SIZES: FleetSize[] = ['1-5', '6-15', '16-30', '31-50', '50+'];
export const MONTHLY_VOLUMES: { value: MonthlyVolume; label: string }[] = [
  { value: '<50', label: 'Under 50' },
  { value: '50-200', label: '50–200' },
  { value: '200-500', label: '200–500' },
  { value: '500-1000', label: '500–1,000' },
  { value: '1000+', label: '1,000+' },
];
