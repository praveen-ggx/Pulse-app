import Theme from '@/constants/Theme';
import { KycRequiredDocumentsSection } from '@/features/organization/components/workspace/kyc/KycRequiredDocumentsSection';
import type { OrganizationKycDocDefinition } from '@/features/organization/types/organizationKycDocuments.types';
import type { OrganizationKycDocument } from '@/features/organization/types/organizationKycDocuments.types';
import type { OrganizationKycDocType } from '@/features/organization/types/organizationKycDocuments.types';
import {
  formatKycCountCopy,
  kycRequiredDocumentCounts,
} from '@/features/organization/utils/kycVerification.util';
import type { WorkspaceKyc } from '@/types/organization';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { workspacePanelStyles as panelStyles } from '@/features/organization/components/workspace/workspacePanelUi';

const WEB_COPY =
  Platform.OS === 'web'
    ? ({ whiteSpace: 'pre-wrap', letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

type Props = {
  kyc: WorkspaceKyc | null;
  documents: OrganizationKycDocument[];
  canEdit: boolean;
  frozen: boolean;
  uploadingDocType: OrganizationKycDocType | null;
  onOpenUpdate: (definition: OrganizationKycDocDefinition) => void;
  onRemove?: (docType: OrganizationKycDocType) => void;
};

export function OrganizationDocumentsPanel({
  kyc,
  documents,
  canEdit,
  frozen,
  uploadingDocType,
  onOpenUpdate,
  onRemove,
}: Props) {
  const counts = kycRequiredDocumentCounts(documents, kyc);
  const status = kyc?.verification_status ?? 'unverified';

  return (
    <View style={panelStyles.panelStack}>
      <View style={styles.intro}>
        <Text style={[styles.title, WEB_COPY]}>Documents</Text>
        <Text style={[styles.body, WEB_COPY]}>
          {status === 'verified'
            ? 'These files support your verified business identity. Update a document to send a new file for review.'
            : 'Evidence for the business structure you selected. Required files are listed first.'}
        </Text>
        <Text style={[styles.count, WEB_COPY]}>
          {formatKycCountCopy(counts.done, counts.total, 'document', 'documents')}
        </Text>
      </View>

      <View style={panelStyles.detailCard}>
        <KycRequiredDocumentsSection
          kyc={kyc}
          documents={documents}
          canEdit={canEdit}
          frozen={frozen}
          uploadingDocType={uploadingDocType}
          onOpenUpdate={onOpenUpdate}
          onRemove={onRemove}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 6, paddingHorizontal: 4, paddingBottom: 4 },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  body: { fontSize: 13, lineHeight: 19, color: Theme.textMuted },
  count: { fontSize: 12, fontWeight: '600', color: Theme.textSecondary, marginTop: 2 },
});
