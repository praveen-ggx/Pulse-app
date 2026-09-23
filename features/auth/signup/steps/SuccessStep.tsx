import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { USER_2D_AVATARS } from '@/constants/UserAvatars';
import { useSuiteAuthContext } from '@/features/auth/hooks/useSuiteAuthContext';
import { ROUTES } from '@/lib/routes';
import { openSuiteProductApp } from '@/lib/suite/suiteAuth';
import { isSuiteProductLocked } from '@/lib/suite/productLock';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { SignUpPulseFormStep } from '../SignUpPulseFormStep';
import { SignUpWorkspaceReadyCard } from '../components/SignUpWorkspaceReadyCard';

export function SuccessStep({ flow }: { flow: SignUpFlow }) {
  const router = useRouter();
  const { productId, returnTo } = useSuiteAuthContext();
  const enterOperations = () => {
    flow.finishBusinessSignup();
    if (productId === 'commerce' && !isSuiteProductLocked('commerce')) {
      openSuiteProductApp(returnTo);
      return;
    }
    router.replace(ROUTES.TABS.TRIPS);
  };
  const verifying = flow.emailVerificationRequired;
  const enteringOps = !verifying && flow.loading;
  const hasChosenProfilePhoto =
    !!flow.profilePreviewUri || !!flow.profileAvatarSeed?.trim();
  const profilePreset =
    !flow.profilePreviewUri && flow.profileAvatarSeed?.trim()
      ? USER_2D_AVATARS.find((a) => a.seed === flow.profileAvatarSeed)
      : undefined;

  return (
    <SignUpPulseFormStep
      title={verifying ? 'Workspace created' : 'Workspace ready'}
      subtitle={
        verifying
          ? `We've sent a verification link to ${flow.email}. Open it, then come back and sign in to start managing trips.`
          : `${flow.orgName} is live on the Pulse network.`
      }
      primaryLabel={
        verifying
          ? flow.resendingSecs > 0
            ? `Resend in ${flow.resendingSecs}s`
            : 'Resend verification'
          : 'Enter operations'
      }
      onPrimary={
        verifying
          ? flow.resendVerification
          : () => {
              enterOperations();
            }
      }
      primaryDisabled={verifying && flow.resendingSecs > 0}
      primaryLoading={enteringOps}
      secondaryAction={{
        label: verifying ? 'Continue after verification' : 'Sign in on another device',
        onPress: () => {
          flow.finishBusinessSignup();
          router.replace(ROUTES.SIGN_IN);
        },
      }}
      centerContent
    >
      <View style={styles.cardWrap}>
        <SignUpWorkspaceReadyCard
          entityName={flow.orgName}
          verifying={verifying}
          profilePreviewUri={hasChosenProfilePhoto ? flow.profilePreviewUri : null}
          profileImage={hasChosenProfilePhoto ? profilePreset?.image : undefined}
          profilePhotoLabel="Profile photo selected"
          checkpoints={[
            { id: 'org', label: 'Workspace created', status: 'complete' },
            { id: 'profile', label: 'Business profile complete', status: 'complete' },
            {
              id: 'verify',
              label: verifying ? 'Email verification' : 'Business verification',
              status: verifying ? 'in_progress' : 'pending',
              detail: verifying
                ? `Link sent to ${flow.email}`
                : 'Submit your business documents next',
            },
            {
              id: 'ops',
              label: 'Operational access',
              status: verifying ? 'pending' : 'complete',
              detail: verifying ? 'Unlocks once you verify and sign back in' : 'Unlocked',
            },
          ]}
        />
      </View>
    </SignUpPulseFormStep>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
});
