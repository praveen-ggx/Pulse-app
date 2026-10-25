import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Theme from '@/constants/Theme';
import {
  DESKTOP_SIGNUP_SPLIT_FLOW_MAX,
  DESKTOP_SIGNUP_SPLIT_PAD,
} from '@/features/auth/signup/signUpConstants';
import { PULSE_SIGNUP_TYPO, PULSE_SIGNUP_TYPO_MOBILE } from '@/features/auth/signup/signUpTypography';
import {
  PULSE_PRODUCTS,
  PULSE_PRODUCTS_COMING_SOON,
  WORKSPACE_ACCESS_ACTIONS,
} from '@/lib/onboarding/productCatalog';
import { WORKSPACE_SETUP_COPY } from '@/lib/onboarding/workspaceSetupContent';
import { ROUTES } from '@/lib/routes';
import { useIsDesktopWebInput } from '@/lib/useIsDesktopWebInput';
import { WEB_APP_VIEWPORT_STYLE } from '@/lib/webViewportHeight';

import { PulseAccessOption } from './PulseAccessOption';
import { PulseComingSoonProduct } from './PulseComingSoonProduct';
import { PulseProductOption } from './PulseProductOption';
import { PulseBrandMarkLink } from './PulseSplitBrandLogo';
import { WorkspaceSetupHeroPanel } from './WorkspaceSetupHeroPanel';

export function OnboardingPersonaHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWebInput();

  const navigateProduct = useCallback(
    (route: string, productId?: string) => {
      if (productId === 'commerce' || route.startsWith('/sign-in')) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.assign(route);
          return;
        }
      }
      router.push(route as never);
    },
    [router],
  );

  const navigateAccess = useCallback(
    (route: string, params?: Record<string, string>) => {
      if (params) {
        router.push({ pathname: route, params } as never);
        return;
      }
      router.push(route as never);
    },
    [router],
  );

  const goToSignIn = useCallback(() => {
    router.push(ROUTES.SIGN_IN as never);
  }, [router]);

  const renderSignInChip = () => (
    <Pressable
      onPress={goToSignIn}
      style={({ pressed }) => [styles.signInChip, pressed && styles.signInChipPressed]}
      accessibilityRole="button"
      accessibilityLabel={WORKSPACE_SETUP_COPY.signInLink}
    >
      <Text style={styles.signInChipText}>{WORKSPACE_SETUP_COPY.signInLink}</Text>
    </Pressable>
  );

  const renderProductHubMain = () => (
    <View style={styles.hub}>
      <View style={styles.hubHeader}>
        <View style={styles.hubHeaderCopy}>
          <Text style={[styles.hubTitle, !isDesktop && styles.hubTitleMobile, isDesktop && styles.hubTitleDesktop]}>
            {WORKSPACE_SETUP_COPY.personaTitle}
          </Text>
          <Text style={[styles.hubSubtitle, !isDesktop && styles.hubSubtitleMobile, isDesktop && styles.hubSubtitleDesktop]}>
            {WORKSPACE_SETUP_COPY.personaSubtitle}
          </Text>
        </View>
        {isDesktop ? renderSignInChip() : null}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, !isDesktop && styles.sectionLabelMobile, isDesktop && styles.sectionLabelDesktop]}>
          {WORKSPACE_SETUP_COPY.sectionProducts}
        </Text>
        <Text style={[styles.invitedEyebrow, !isDesktop && styles.invitedEyebrowMobile, isDesktop && styles.invitedEyebrowDesktop]}>
          {WORKSPACE_SETUP_COPY.invitedEyebrow}
        </Text>
        <View style={styles.productList}>
          {PULSE_PRODUCTS.map((product) => (
            <PulseProductOption
              key={product.id}
              product={product}
              compact={false}
              onPress={() => navigateProduct(product.route, product.id)}
            />
          ))}
        </View>
      </View>

      <View style={styles.inviteBlock}>
        <Text style={[styles.sectionLabel, !isDesktop && styles.sectionLabelMobile, isDesktop && styles.sectionLabelDesktop]}>
          {WORKSPACE_SETUP_COPY.sectionWorkspaceAccess}
        </Text>
        <View style={styles.accessList}>
          {WORKSPACE_ACCESS_ACTIONS.map((action) => (
            <View key={action.id} style={styles.accessOptionCell}>
              <PulseAccessOption
                action={action}
                compact
                onPress={() => navigateAccess(action.route, action.params)}
              />
            </View>
          ))}
        </View>
      </View>

      {PULSE_PRODUCTS_COMING_SOON.length > 0 ? (
        <View style={styles.comingSoonStrip}>
          <Text style={styles.comingSoonCaption}>{WORKSPACE_SETUP_COPY.sectionComingSoon}</Text>
          <View style={styles.comingSoonChips}>
            {PULSE_PRODUCTS_COMING_SOON.map((product) => (
              <PulseComingSoonProduct key={product.id} product={product} variant="chip" />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

  if (isDesktop) {
    return (
      <View
        style={[
          styles.desktopShell,
          Platform.OS === 'web' ? (WEB_APP_VIEWPORT_STYLE as object) : null,
        ]}
      >
        <View style={[styles.desktopCol, styles.desktopLeftCol]}>
          <WorkspaceSetupHeroPanel />
        </View>

        <View style={styles.panelDivider} />

        <View style={[styles.desktopCol, styles.rightPanel]}>
          <ScrollView
            style={styles.rightScroll}
            contentContainerStyle={styles.rightScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.panelInner}>{renderProductHubMain()}</View>
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.mobileRoot, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.mobileScroll}
        contentContainerStyle={[styles.mobileScrollContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.mobileTopBar}>
          <PulseBrandMarkLink
            onPress={() => router.push(ROUTES.TERMINAL_WEBSITE)}
            accessibilityLabel={WORKSPACE_SETUP_COPY.pulseWebsiteLink}
            size="lg"
            linkStyle={styles.mobileBrandAnchor}
          />
          {renderSignInChip()}
        </View>
        {renderProductHubMain()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  desktopShell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Theme.screenBackground,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 0,
  },

  desktopCol: {
    flex: 1,
    minWidth: 0,
    maxWidth: '50%',
    minHeight: 0,
    alignSelf: 'stretch',
    zIndex: 1,
  },

  desktopLeftCol: {
    backgroundColor: Theme.screenBackground,
  },

  panelInner: {
    width: '100%',
    maxWidth: DESKTOP_SIGNUP_SPLIT_FLOW_MAX,
    alignSelf: 'center',
    paddingHorizontal: DESKTOP_SIGNUP_SPLIT_PAD,
    paddingVertical: 28,
  },

  panelDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(77, 54, 54, 0.1)',
    alignSelf: 'stretch',
    zIndex: 2,
  },

  rightPanel: {
    backgroundColor: Theme.screenBackground,
    flex: 1,
    minHeight: 0,
  },
  rightScroll: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  rightScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  hub: {
    gap: 22,
    width: '100%',
  },
  hubHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  hubHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  hubTitle: {
    color: Theme.brandBlueInk,
    fontWeight: '600',
  },
  hubTitleDesktop: {
    ...PULSE_SIGNUP_TYPO.titleDesktop,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  hubTitleMobile: {
    ...PULSE_SIGNUP_TYPO_MOBILE.title,
  },
  hubSubtitle: {
    color: Theme.textMuted,
  },
  hubSubtitleDesktop: {
    ...PULSE_SIGNUP_TYPO.subtitle,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 0,
  },
  hubSubtitleMobile: {
    ...PULSE_SIGNUP_TYPO_MOBILE.subtitle,
  },
  signInChip: {
    flexShrink: 0,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.brandBlueInk,
    backgroundColor: Theme.cardWhite,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' } as object,
      default: {},
    }),
  },
  signInChipPressed: {
    backgroundColor: Theme.brandBlueSoft,
  },
  signInChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: Theme.brandBlueInk,
  },

  section: {
    gap: 10,
  },
  sectionLabel: {
    ...PULSE_SIGNUP_TYPO.label,
    color: Theme.textMuted,
  },
  sectionLabelDesktop: {
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.5,
  },
  sectionLabelMobile: {
    ...PULSE_SIGNUP_TYPO_MOBILE.label,
    color: Theme.textMuted,
  },
  invitedEyebrow: {
    ...PULSE_SIGNUP_TYPO.caption,
    color: Theme.textSecondary,
    marginBottom: -2,
  },
  invitedEyebrowDesktop: {
    fontSize: 12,
    lineHeight: 16,
  },
  invitedEyebrowMobile: {
    ...PULSE_SIGNUP_TYPO_MOBILE.caption,
    color: Theme.textSecondary,
    marginBottom: -2,
  },

  productList: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  accessList: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  accessOptionCell: {
    flex: 1,
    minWidth: 0,
  },
  inviteBlock: {
    gap: 8,
  },
  comingSoonStrip: {
    gap: 8,
    paddingTop: 4,
  },
  comingSoonCaption: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Theme.textMuted,
  },
  comingSoonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  mobileRoot: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    position: 'relative',
    overflow: 'hidden',
  },
  mobileScroll: {
    flex: 1,
    minHeight: 0,
  },
  mobileScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  mobileTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  mobileBrandAnchor: {
    alignSelf: 'flex-start',
  },
});
