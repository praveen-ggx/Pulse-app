import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Theme from '@/constants/Theme';
import { DESKTOP_SIGNUP_SPLIT_FLOW_PAD_Y } from '@/features/auth/signup/signUpConstants';
import { PULSE_SIGNUP_TYPO } from '@/features/auth/signup/signUpTypography';
import Illustration3 from '@/assets/illustrations/3.svg';
import { WORKSPACE_SETUP_COPY } from '@/lib/onboarding/workspaceSetupContent';
import { ROUTES } from '@/lib/routes';

import { ONBOARDING_BRAND } from './onboardingPersonaAssets';
import { PulseSplitBrandLogo } from './PulseSplitBrandLogo';

const PANEL_CONTENT_MAX = 400;
const FOOTER_CONTENT_MAX = 460;
const ILLUSTRATION_SIZE = 220;
const WORKSPACE_SETUP_ILLUSTRATION_ASPECT = 600 / 587;

const Illustration = Illustration3;
const illustrationHeight = ILLUSTRATION_SIZE / WORKSPACE_SETUP_ILLUSTRATION_ASPECT;

/** Desktop hub left panel — aligned with signup / sign-in marketing rail. */
export function WorkspaceSetupHeroPanel() {
  const router = useRouter();

  return (
    <View style={styles.panel}>
      <PulseSplitBrandLogo onPress={() => router.push(ROUTES.TERMINAL_WEBSITE)} />

      <View style={styles.main}>
        <View style={styles.inner}>
          <View style={styles.copy}>
            <Text style={styles.tag}>{WORKSPACE_SETUP_COPY.tag}</Text>
            <Text style={styles.headline}>{WORKSPACE_SETUP_COPY.headline}</Text>

            <View style={styles.outcomes}>
              {WORKSPACE_SETUP_COPY.outcomes.map((line) => (
                <Text key={line} style={styles.outcomeLine}>
                  {line}
                </Text>
              ))}
            </View>
          </View>

          <View style={styles.illustrationWrap}>
            <Illustration width={ILLUSTRATION_SIZE} height={illustrationHeight} />
          </View>
        </View>
      </View>

      <View style={styles.footerRail}>
        <Text style={styles.closing}>{WORKSPACE_SETUP_COPY.closing}</Text>
        <Text style={styles.trust}>{WORKSPACE_SETUP_COPY.trust}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    position: 'relative',
    backgroundColor: Theme.screenBackground,
    minWidth: 0,
    minHeight: 0,
    justifyContent: 'space-between',
  },
  main: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingVertical: DESKTOP_SIGNUP_SPLIT_FLOW_PAD_Y,
  },
  inner: {
    width: '100%',
    maxWidth: PANEL_CONTENT_MAX,
    alignSelf: 'center',
    paddingHorizontal: 40,
    paddingBottom: 16,
    gap: 22,
  },
  copy: {
    width: '100%',
  },
  tag: {
    ...PULSE_SIGNUP_TYPO.label,
    color: Theme.textMuted,
    marginBottom: 10,
  },
  headline: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
    color: ONBOARDING_BRAND.ink,
    letterSpacing: -0.45,
    marginBottom: 12,
    maxWidth: 340,
  },
  outcomes: {
    gap: 3,
    minHeight: 76,
    marginBottom: 6,
  },
  outcomeLine: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    color: ONBOARDING_BRAND.ink,
    opacity: 0.82,
  },
  illustrationWrap: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 8,
  },
  footerRail: {
    width: '100%',
    maxWidth: FOOTER_CONTENT_MAX,
    alignSelf: 'center',
    paddingHorizontal: 40,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 4,
  },
  closing: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
    color: ONBOARDING_BRAND.ink,
  },
  trust: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
    color: ONBOARDING_BRAND.ink,
  },
});
