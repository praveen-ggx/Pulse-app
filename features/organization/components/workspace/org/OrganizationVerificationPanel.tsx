import Theme from '@/constants/Theme';
import { Layout } from '@/constants/Layout';
import { KycVerificationStatusView } from '@/features/organization/components/workspace/kyc/KycVerificationStatusView';
import type { OrganizationKycDocDefinition } from '@/features/organization/types/organizationKycDocuments.types';
import type { OrganizationKycDocument } from '@/features/organization/types/organizationKycDocuments.types';
import type { WorkspaceKyc } from '@/types/organization';
import { Lock } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { workspacePanelStyles as panelStyles } from '@/features/organization/components/workspace/workspacePanelUi';

const WEB_COPY =
  Platform.OS === 'web'
    ? ({ whiteSpace: 'pre-wrap', letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

type Props = {
  kyc: WorkspaceKyc | null;
  documents: OrganizationKycDocument[];
  canEdit: boolean;
  onOpenDocuments: () => void;
  onOpenUpdate: (definition: OrganizationKycDocDefinition) => void;
  onStartVerify: () => void;
};

export function OrganizationVerificationPanel({
  kyc,
  documents,
  canEdit,
  onOpenDocuments,
  onOpenUpdate,
  onStartVerify,
}: Props) {
  const status = kyc?.verification_status ?? 'unverified';
  const isDraft = status === 'unverified' || status === 'rejected';

  if (!isDraft) {
    return (
      <View style={panelStyles.panelStack}>
        <KycVerificationStatusView
          kyc={kyc}
          documents={documents}
          canEdit={canEdit}
          onOpenUpdate={onOpenUpdate}
        />
        <Pressable
          onPress={onOpenDocuments}
          style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.secondaryText, WEB_COPY]}>
            {status === 'verified' ? 'Update a document' : 'View submitted documents'}
          </Text>
        </Pressable>
      </View>
    );
  }

  const rejected = status === 'rejected';

  return (
    <View style={panelStyles.panelStack}>
      <View style={styles.intro}>
        <Text style={[styles.introTitle, WEB_COPY]}>
          {rejected ? 'Action required' : 'Verify your business'}
        </Text>
        <Text style={[styles.introBody, WEB_COPY]}>
          {rejected
            ? kyc?.kyc_rejected_reason?.trim() ||
              'We need you to update your verification.'
            : 'A short guided flow — business type, identity, tax registrations, then the documents we need.'}
        </Text>
      </View>

      {!canEdit ? (
        <View style={panelStyles.kycReadonlyNote}>
          <Lock size={10} color={Theme.textMuted} strokeWidth={2} />
          <Text style={panelStyles.kycReadonlyText}>
            Only admins and owners can continue verification.
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={onStartVerify}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.88 }]}
          accessibilityRole="button"
          accessibilityLabel={rejected ? 'Fix verification' : 'Continue verification'}
        >
          <Text style={[styles.ctaText, WEB_COPY]}>
            {rejected ? 'Fix verification' : 'Continue verification'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 6, paddingHorizontal: 4, paddingBottom: 4 },
  introTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  introBody: { fontSize: 13, lineHeight: 19, color: Theme.textMuted },
  cta: {
    marginTop: 8,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: Theme.buttonDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.buttonDarkText,
  },
  secondary: {
    minHeight: Layout.minTouchTargetSize,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 16,
  },
  secondaryText: { fontSize: 13, fontWeight: '700', color: Theme.primary },
});
