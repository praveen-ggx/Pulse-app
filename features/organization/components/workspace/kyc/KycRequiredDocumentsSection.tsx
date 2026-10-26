import Theme from '@/constants/Theme';
import { Layout } from '@/constants/Layout';
import type {
  OrganizationKycDocDefinition,
  OrganizationKycDocument,
} from '@/features/organization/types/organizationKycDocuments.types';
import type { WorkspaceKyc } from '@/types/organization';
import {
  kycOptionalDocumentDefs,
  kycRequiredDocumentDefs,
  kycStructureRequirementsHint,
  effectiveKycRegistrationType,
  latestOrgKycDocumentMatching,
  registrationTypeLabel,
  resolveAcceptTypes,
  totalUploadedKycDocuments,
} from '@/features/organization/utils/kycVerification.util';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const WEB_COPY =
  Platform.OS === 'web'
    ? ({ whiteSpace: 'pre-wrap', letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

import { KycVerificationDocumentCard } from './KycVerificationDocumentCard';

type Props = {
  kyc: WorkspaceKyc | null;
  documents: OrganizationKycDocument[];
  canEdit: boolean;
  frozen: boolean;
  uploadingDocType: OrganizationKycDocument['doc_type'] | null;
  onOpenUpdate: (definition: OrganizationKycDocDefinition) => void;
  /** Optional docs only, and only above the last-remaining-document floor. */
  onRemove?: (docType: OrganizationKycDocument['doc_type']) => void;
  /** First-time verify wizard: required evidence only. */
  requiredOnly?: boolean;
};

function optionalChipLabel(def: OrganizationKycDocDefinition): string {
  if (def.type === 'cin_certificate' || def.type === 'incorporation_certificate') return '+ CIN';
  if (def.type === 'msme_certificate') return '+ Udyam Certificate';
  if (def.type === 'iec_certificate') return '+ IEC';
  return `+ ${def.label}`;
}

export function KycRequiredDocumentsSection({
  kyc,
  documents,
  canEdit,
  frozen,
  uploadingDocType,
  onOpenUpdate,
  onRemove,
  requiredOnly = false,
}: Props) {
  const requiredDefs = kycRequiredDocumentDefs(kyc);
  const optionalDefs = kycOptionalDocumentDefs(kyc);
  const [revealedOptional, setRevealedOptional] = useState<string[]>([]);
  // Removal must stay confined to still-draft evidence. `frozen` only covers
  // pending/verified — a rejected org has already been through one full
  // submit+review cycle, so its documents are just as much "submitted
  // evidence" as a verified org's. Gate on the org never having left
  // unverified, not just on the current frozen flag.
  const isUnsubmittedDraft = (kyc?.verification_status ?? 'unverified') === 'unverified';
  const canRemoveUploaded =
    canEdit && isUnsubmittedDraft && totalUploadedKycDocuments(documents) > 1;
  const resolvedType = effectiveKycRegistrationType(kyc);
  const structureLabel = registrationTypeLabel(resolvedType);
  const structureHint = kycStructureRequirementsHint(
    resolvedType,
    !!kyc?.gst_not_applicable,
  );

  const optionalHasFile = useMemo(() => {
    const uploaded = new Set<string>();
    for (const def of optionalDefs) {
      const match = latestOrgKycDocumentMatching(documents, resolveAcceptTypes(def));
      if (match?.storage_path) uploaded.add(def.type);
    }
    return uploaded;
  }, [documents, optionalDefs]);

  const visibleOptional = optionalDefs.filter(
    (def) => optionalHasFile.has(def.type) || revealedOptional.includes(def.type),
  );
  const optionalChips = optionalDefs.filter(
    (def) => !optionalHasFile.has(def.type) && !revealedOptional.includes(def.type),
  );

  return (
    <>
      <View style={styles.banner}>
        <Text style={[styles.bannerTitle, WEB_COPY]}>
          {structureLabel
            ? `Required for ${structureLabel}`
            : 'Required for your business structure'}
        </Text>
        {structureHint ? (
          <Text style={[styles.bannerBody, WEB_COPY]}>{structureHint}</Text>
        ) : null}
      </View>

      <View style={styles.cardStack}>
      {requiredDefs.map((def) => (
        <KycVerificationDocumentCard
          key={`req-${def.type}-${def.label}`}
          definition={def}
          documents={documents}
          kyc={kyc}
          canEdit={canEdit}
          uploading={
            !!uploadingDocType &&
            (uploadingDocType === def.type ||
              !!def.acceptTypes?.includes(uploadingDocType) ||
              !!def.uploadChoices?.includes(uploadingDocType))
          }
          onOpenUpdate={onOpenUpdate}
        />
      ))}
      </View>

      {!requiredOnly && visibleOptional.length > 0 ? (
        <View style={styles.optionalHeader}>
          <Text style={[styles.optionalHeaderText, WEB_COPY]}>Optional for this structure</Text>
        </View>
      ) : null}

      {!requiredOnly ? (
        <View style={styles.cardStack}>
        {visibleOptional.map((def) => (
            <KycVerificationDocumentCard
              key={`opt-${def.type}`}
              definition={def}
              documents={documents}
              kyc={kyc}
              canEdit={canEdit}
              uploading={uploadingDocType === def.type}
              onOpenUpdate={onOpenUpdate}
              onRemove={canRemoveUploaded ? onRemove : undefined}
              onDismiss={
                !optionalHasFile.has(def.type)
                  ? () =>
                      setRevealedOptional((prev) => prev.filter((type) => type !== def.type))
                  : undefined
              }
            />
          ))}
        </View>
      ) : null}

      {!requiredOnly && canEdit && !frozen && optionalChips.length > 0 ? (
        <View style={styles.chipRow}>
          {optionalChips.map((def) => (
            <Pressable
              key={`chip-${def.type}`}
              style={styles.addChip}
              onPress={() => setRevealedOptional((prev) => [...prev, def.type])}
              accessibilityRole="button"
            >
              <Text style={[styles.addChipText, WEB_COPY]}>{optionalChipLabel(def)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  cardStack: {
    gap: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  banner: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 3,
    backgroundColor: Theme.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  bannerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  bannerBody: {
    fontSize: 10,
    color: Theme.textMuted,
    lineHeight: 14,
    fontWeight: '500',
  },
  optionalHeader: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  optionalHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addChip: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.cardWhite,
  },
  addChipText: { fontSize: 13, fontWeight: '700', color: Theme.primary },
});
