/**
 * 4-step verification + review. Orchestrates existing KYC primitives —
 * does not change state semantics, frozen fields, or the document-update lifecycle.
 */
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { Layout } from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { WorkspaceDetailLayout } from '@/features/organization/components/workspace/WorkspaceDetailLayout';
import { KycSubmitFooter } from '@/features/organization/components/workspace/kyc/KycSubmitFooter';
import { KycVerificationDocumentCard } from '@/features/organization/components/workspace/kyc/KycVerificationDocumentCard';
import { formatOrgAddress } from '@/features/organization/components/workspace/org/organizationHub.util';
import {
  InfoRow,
  KycFieldRow,
  KycFieldsList,
  SectionHeader,
  type KycField,
  workspacePanelStyles as panelStyles,
} from '@/features/organization/components/workspace/workspacePanelUi';
import type { OrganizationKycDocDefinition } from '@/features/organization/types/organizationKycDocuments.types';
import type { OrganizationKycDocument } from '@/features/organization/types/organizationKycDocuments.types';
import type { OrganizationKycDocType } from '@/features/organization/types/organizationKycDocuments.types';
import {
  REGISTRATION_TYPE_OPTIONS,
  buildKycRequirementProfile,
  effectiveKycRegistrationType,
  kycOptionalTaxFields,
  kycRequiredDocumentCounts,
  kycTaxIdentityCounts,
  latestOrgKycDocumentMatching,
  registrationTypeLabel,
  registrationTypeRequiresCin,
  resolveAcceptTypes,
  totalUploadedKycDocuments,
} from '@/features/organization/utils/kycVerification.util';
import type { RegistrationType, WorkspaceKyc } from '@/types/organization';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type InfoStep = 0 | 1 | 2 | 3;
type VerifyStep = InfoStep | 4;

const STEP_LABELS = ['Business', 'Identity', 'Tax', 'Documents'] as const;

const INFO_COPY: { title: string; caption: string }[] = [
  { title: 'Business type', caption: 'How is the organisation registered?' },
  { title: 'Business identity', caption: 'Who you are — Pulse prefills what it already knows.' },
  { title: 'Tax information', caption: 'Tell us about your tax registrations.' },
  {
    title: 'Business documents',
    caption: "Upload the documents we need to verify your business.",
  },
];

const OPTIONAL_TAX: { field: KycField; chip: string }[] = [
  { field: 'cin', chip: '+ CIN' },
  { field: 'msme_number', chip: '+ Udyam' },
  { field: 'tan_number', chip: '+ TAN' },
  { field: 'iec_number', chip: '+ IEC' },
];

function firstIncompleteStep(
  kyc: WorkspaceKyc | null,
  documents: OrganizationKycDocument[],
): VerifyStep {
  if (!kyc?.registration_type) return 0;
  if (!kyc.address_line?.trim() || !kyc.city?.trim() || !kyc.state?.trim()) return 1;
  if (kycTaxIdentityCounts(kyc).remaining > 0) return 2;
  if (kycRequiredDocumentCounts(documents, kyc).remaining > 0) return 3;
  return 4;
}

type Props = {
  orgName: string;
  kyc: WorkspaceKyc | null;
  documents: OrganizationKycDocument[];
  canEdit: boolean;
  frozen: boolean;
  canSubmit: boolean;
  submitGaps: string[];
  submitting: boolean;
  uploadingDocType: OrganizationKycDocType | null;
  onSaveRegistrationType: (
    type: RegistrationType,
  ) => Promise<{ error: Error | null }>;
  onSaveOperatingAddress: (input: {
    address_line: string;
    city: string;
    state: string;
    address_pincode: string;
  }) => Promise<{ error: Error | null }>;
  onSaveKycField: (field: KycField, val: string) => Promise<void>;
  onValidateGstin: (
    gstin: string,
  ) => Promise<{ ok: boolean; message?: string; registryName?: string }>;
  onSetGstNotApplicable: (notApplicable: boolean) => Promise<void>;
  onOpenUpdate: (definition: OrganizationKycDocDefinition) => void;
  onRemoveDocument?: (docType: OrganizationKycDocType) => Promise<void>;
  onSubmit: () => Promise<{ ok: boolean; error: Error | null }>;
  onExit: () => void;
  onComplete: () => void;
};

export function OrganizationVerifyWizard({
  orgName,
  kyc,
  documents,
  canEdit,
  frozen,
  canSubmit,
  submitGaps,
  submitting,
  uploadingDocType,
  onSaveRegistrationType,
  onSaveOperatingAddress,
  onSaveKycField,
  onValidateGstin,
  onSetGstNotApplicable,
  onOpenUpdate,
  onRemoveDocument,
  onSubmit,
  onExit,
  onComplete,
}: Props) {
  const [step, setStep] = useState<VerifyStep>(() => firstIncompleteStep(kyc, documents));
  const [saving, setSaving] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [typeDraft, setTypeDraft] = useState<RegistrationType | null>(
    () => effectiveKycRegistrationType(kyc),
  );
  const [addressLine, setAddressLine] = useState(kyc?.address_line ?? '');
  const [city, setCity] = useState(kyc?.city ?? '');
  const [stateVal, setStateVal] = useState(kyc?.state ?? '');
  const [pincode, setPincode] = useState(kyc?.address_pincode ?? '');
  const [revealedOptional, setRevealedOptional] = useState<KycField[]>([]);
  const [gstIntent, setGstIntent] = useState<'yes' | 'no' | null>(() =>
    kyc?.gst_not_applicable ? 'no' : kyc?.gstin?.trim() ? 'yes' : null,
  );

  useEffect(() => {
    setTypeDraft(effectiveKycRegistrationType(kyc));
  }, [kyc?.registration_type, kyc?.business_type]);

  useEffect(() => {
    setAddressLine(kyc?.address_line ?? '');
    setCity(kyc?.city ?? '');
    setStateVal(kyc?.state ?? '');
    setPincode(kyc?.address_pincode ?? '');
  }, [kyc?.address_line, kyc?.city, kyc?.state, kyc?.address_pincode]);

  const tax = kycTaxIdentityCounts(kyc);
  const docs = kycRequiredDocumentCounts(documents, kyc);
  const typeLabel = registrationTypeLabel(typeDraft);
  const addressFilled = !!(addressLine.trim() && city.trim() && stateVal.trim());
  const isReview = step === 4;
  const infoIndex = (isReview ? 3 : step) as InfoStep;
  const heading = isReview
    ? {
        title: 'Review & submit',
        caption: 'Your verification is ready.',
      }
    : step === 2
      ? { title: INFO_COPY[2].title, caption: INFO_COPY[2].caption }
      : step === 3
        ? {
            title: INFO_COPY[3].title,
            caption: `We've selected these based on your business type and registrations.`,
          }
        : INFO_COPY[step];

  const cinRequired = registrationTypeRequiresCin(typeDraft);
  const isIndividual = typeDraft === 'individual';
  const profile = buildKycRequirementProfile(kyc);
  const gstChoice: 'yes' | 'no' | null =
    gstIntent ??
    (kyc?.gst_not_applicable ? 'no' : kyc?.gstin?.trim() ? 'yes' : null);
  const optionalTaxFields = kycOptionalTaxFields(typeDraft);
  const optionalChips = useMemo(
    () =>
      OPTIONAL_TAX.filter((item) => {
        if (!optionalTaxFields.includes(item.field)) return false;
        if (kyc?.[item.field]?.trim()) return false;
        if (revealedOptional.includes(item.field)) return false;
        return true;
      }),
    [optionalTaxFields, kyc, revealedOptional],
  );
  const hasOptionalRows = optionalTaxFields.some(
    (field) => !!kyc?.[field]?.trim() || revealedOptional.includes(field),
  );

  const handleRemoveOptional = async (field: KycField) => {
    if (!optionalTaxFields.includes(field)) return;
    setRevealedOptional((prev) => prev.filter((item) => item !== field));
    if (kyc?.[field]?.trim()) await onSaveKycField(field, '');
  };

  const canContinue =
    canEdit &&
    !frozen &&
    !saving &&
    (step === 0
      ? !!typeDraft
      : step === 1
        ? addressFilled
        : step === 2
          ? tax.remaining === 0
          : step === 3
            ? docs.remaining === 0
            : false);

  const handleBack = () => {
    setStepError(null);
    if (step === 0) {
      onExit();
      return;
    }
    setStep((prev) => (prev - 1) as VerifyStep);
  };

  const handleContinue = async () => {
    if (!canContinue) return;
    setSaving(true);
    setStepError(null);
    try {
      if (step === 0 && typeDraft) {
        const { error } = await onSaveRegistrationType(typeDraft);
        if (error) {
          setStepError(error.message);
          return;
        }
      }
      if (step === 1) {
        const { error } = await onSaveOperatingAddress({
          address_line: addressLine.trim(),
          city: city.trim(),
          state: stateVal.trim(),
          address_pincode: pincode.trim(),
        });
        if (error) {
          setStepError(error.message);
          return;
        }
      }
      setStep((prev) => (prev + 1) as VerifyStep);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    const result = await onSubmit();
    if (result.ok) onComplete();
    else if (result.error) setStepError(result.error.message);
  };

  const body =
    step === 0 ? (
      <View style={panelStyles.detailCard}>
        <SectionHeader label="Registration type" />
        <View style={styles.chipRow}>
          {REGISTRATION_TYPE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.chip, typeDraft === opt.value && styles.chipOn]}
              onPress={() => setTypeDraft(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: typeDraft === opt.value }}
            >
              <Text style={[styles.chipText, typeDraft === opt.value && styles.chipTextOn]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    ) : step === 1 ? (
      <View style={panelStyles.detailCard}>
        <SectionHeader label="Identity" />
        <InfoRow label="Business name" value={orgName || kyc?.name || '—'} />
        {typeLabel ? <InfoRow label="Type" value={typeLabel} /> : null}
        <View style={styles.addressBlock}>
          <Text style={styles.fieldLabel}>Operating address</Text>
          <TextInput
            style={styles.input}
            value={addressLine}
            onChangeText={setAddressLine}
            placeholder="Address line"
            placeholderTextColor={Theme.textMuted}
          />
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputHalf]}
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor={Theme.textMuted}
            />
            <TextInput
              style={[styles.input, styles.inputHalf]}
              value={stateVal}
              onChangeText={setStateVal}
              placeholder="State"
              placeholderTextColor={Theme.textMuted}
            />
          </View>
          <TextInput
            style={styles.input}
            value={pincode}
            onChangeText={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="Pincode"
            placeholderTextColor={Theme.textMuted}
            keyboardType="number-pad"
            maxLength={6}
          />
        </View>
      </View>
    ) : step === 2 ? (
      <View style={styles.stack}>
        {!isIndividual ? (
          <View style={panelStyles.detailCard}>
            <SectionHeader label="GST registration" />
            <Text style={styles.gstPrompt}>Is your business registered for GST?</Text>
            <View style={styles.gstChoiceRow}>
              <Pressable
                style={[styles.gstChoice, gstChoice === 'yes' && styles.gstChoiceOn]}
                onPress={() => {
                  setGstIntent('yes');
                  if (kyc?.gst_not_applicable) void onSetGstNotApplicable(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: gstChoice === 'yes' }}
              >
                <Text style={[styles.gstChoiceText, gstChoice === 'yes' && styles.gstChoiceTextOn]}>
                  Yes
                </Text>
              </Pressable>
              <Pressable
                style={[styles.gstChoice, gstChoice === 'no' && styles.gstChoiceOn]}
                onPress={() => {
                  setGstIntent('no');
                  if (!kyc?.gst_not_applicable) void onSetGstNotApplicable(true);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: gstChoice === 'no' }}
              >
                <Text style={[styles.gstChoiceText, gstChoice === 'no' && styles.gstChoiceTextOn]}>
                  No
                </Text>
              </Pressable>
            </View>
            {gstChoice === 'yes' ? (
              <KycFieldRow
                field="gstin"
                value={kyc?.gstin}
                verificationStatus={kyc?.verification_status}
                canEdit={canEdit && !frozen}
                onSave={onSaveKycField}
                onValidateGstin={onValidateGstin}
                required
              />
            ) : gstChoice === 'no' ? (
              <View style={styles.gstSkipped}>
                <Text style={styles.gstSkippedTitle}>Not registered for GST</Text>
                <Text style={styles.gstSkippedSub}>
                  GSTIN and GST certificate are not required.
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={panelStyles.detailCard}>
          <SectionHeader label="Required" />
          <KycFieldsList
            kyc={kyc}
            canEdit={canEdit && !frozen}
            onSave={onSaveKycField}
            onValidateGstin={onValidateGstin}
            cinRequired={cinRequired}
            section="required"
            hideGstin
          />
        </View>
        <View style={styles.optionalBlock}>
          <Text style={styles.optionalTitle}>Other registrations</Text>
          <Text style={styles.optionalCaption}>Add only if applicable.</Text>
          {hasOptionalRows ? (
            <View style={panelStyles.detailCard}>
              <KycFieldsList
                kyc={kyc}
                canEdit={canEdit && !frozen}
                onSave={onSaveKycField}
                onValidateGstin={onValidateGstin}
                forceShowOptional={revealedOptional}
                cinRequired={cinRequired}
                section="optional"
                onRemoveOptional={(field) => void handleRemoveOptional(field)}
                hideGstin
              />
            </View>
          ) : null}
          {optionalChips.length > 0 ? (
            <View style={styles.optionalRow}>
              {optionalChips.map((item) => (
                <Pressable
                  key={item.field}
                  style={styles.addChip}
                  onPress={() => setRevealedOptional((prev) => [...prev, item.field])}
                  accessibilityRole="button"
                >
                  <Text style={styles.addChipText}>{item.chip}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    ) : step === 3 ? (
      <VerifyDocumentsStep
        orgName={orgName}
        kyc={kyc}
        documents={documents}
        canEdit={canEdit && !frozen}
        uploadingDocType={uploadingDocType}
        onOpenUpdate={onOpenUpdate}
        onRemoveDocument={onRemoveDocument}
      />
    ) : (
      <View style={styles.stack}>
        <View style={panelStyles.detailCard}>
          <SectionHeader
            label="Business"
            trailing={
              <Pressable onPress={() => setStep(0)} accessibilityRole="button">
                <Text style={styles.editLink}>Edit →</Text>
              </Pressable>
            }
          />
          <InfoRow label="Business" value={orgName || kyc?.name || '—'} />
          <InfoRow label="Type" value={typeLabel || '—'} />
          <InfoRow label="Address" value={formatOrgAddress(kyc) || '—'} />
        </View>
        <View style={panelStyles.detailCard}>
          <SectionHeader
            label="Tax"
            trailing={
              <Pressable onPress={() => setStep(2)} accessibilityRole="button">
                <Text style={styles.editLink}>Edit →</Text>
              </Pressable>
            }
          />
          <InfoRow
            label="GSTIN"
            value={
              isIndividual
                ? 'Not required'
                : kyc?.gst_not_applicable
                  ? 'Not registered for GST'
                  : kyc?.gstin?.trim() || '—'
            }
          />
          <InfoRow
            label={isIndividual ? 'PAN' : 'Business PAN'}
            value={kyc?.business_pan?.trim() || '—'}
          />
          {kyc?.cin?.trim() ? <InfoRow label="CIN" value={kyc.cin} /> : null}
          {kyc?.msme_number?.trim() ? (
            <InfoRow label="Udyam" value={kyc.msme_number} />
          ) : null}
          {kyc?.tan_number?.trim() ? <InfoRow label="TAN" value={kyc.tan_number} /> : null}
          {kyc?.iec_number?.trim() ? <InfoRow label="IEC" value={kyc.iec_number} /> : null}
        </View>
        <View style={panelStyles.detailCard}>
          <SectionHeader
            label="Documents"
            trailing={
              <Pressable onPress={() => setStep(3)} accessibilityRole="button">
                <Text style={styles.editLink}>Edit →</Text>
              </Pressable>
            }
          />
          {profile.requiredDocuments.map((def) => {
            const match = latestOrgKycDocumentMatching(
              documents,
              resolveAcceptTypes(def),
            );
            const ok =
              !!match?.storage_path ||
              (def.type === 'address_proof' && !!kyc?.address_proof_path?.trim());
            return (
              <InfoRow
                key={def.type}
                label={def.label}
                value={ok ? 'Ready' : 'Missing'}
              />
            );
          })}
        </View>
      </View>
    );

  const footer = isReview ? (
    <KycSubmitFooter
      canSubmit={canSubmit}
      submitting={submitting}
      missingItems={submitGaps}
      confirmCopy="By submitting, you confirm that the information and documents provided belong to this business and are accurate."
      onSubmit={() => void handleSubmit()}
    />
  ) : (
    <Pressable
      style={[styles.continueBtn, !canContinue && styles.continueDisabled]}
      disabled={!canContinue}
      onPress={() => void handleContinue()}
      accessibilityRole="button"
      accessibilityState={{ disabled: !canContinue }}
    >
      {saving ? (
        <LoadingIndicator size="small" color={Theme.buttonDarkText} />
      ) : (
        <Text style={styles.continueText}>Continue</Text>
      )}
    </Pressable>
  );

  return (
    <WorkspaceDetailLayout
      title="Verify your business"
      subtitle={orgName || 'Organisation'}
      onBack={handleBack}
      footerSlot={footer}
    >
      <View style={styles.header}>
        <VerifyStepper infoIndex={infoIndex} complete={isReview} />
        <Text style={styles.stepMeta}>
          {isReview ? 'Review' : `Step ${step + 1} of 4`}
        </Text>
        <Text style={styles.stepTitle}>{heading.title}</Text>
        <Text style={styles.stepCaption}>{heading.caption}</Text>
      </View>
      {stepError ? <Text style={styles.errorText}>{stepError}</Text> : null}
      {body}
    </WorkspaceDetailLayout>
  );
}

function VerifyDocumentsStep({
  orgName,
  kyc,
  documents,
  canEdit,
  uploadingDocType,
  onOpenUpdate,
  onRemoveDocument,
}: {
  orgName: string;
  kyc: WorkspaceKyc | null;
  documents: OrganizationKycDocument[];
  canEdit: boolean;
  uploadingDocType: OrganizationKycDocType | null;
  onOpenUpdate: (definition: OrganizationKycDocDefinition) => void;
  onRemoveDocument?: (docType: OrganizationKycDocType) => Promise<void>;
}) {
  const profile = buildKycRequirementProfile(kyc);
  const [revealedOptional, setRevealedOptional] = useState<string[]>([]);
  const isUnsubmittedDraft = (kyc?.verification_status ?? 'unverified') === 'unverified';
  const canRemoveUploaded =
    canEdit && isUnsubmittedDraft && totalUploadedKycDocuments(documents) > 1;

  const optionalHasFile = useMemo(() => {
    const uploaded = new Set<string>();
    for (const def of profile.optionalDocuments) {
      const match = latestOrgKycDocumentMatching(documents, resolveAcceptTypes(def));
      if (match?.storage_path) uploaded.add(def.type);
    }
    return uploaded;
  }, [documents, profile.optionalDocuments]);

  const visibleOptional = profile.optionalDocuments.filter(
    (def) => optionalHasFile.has(def.type) || revealedOptional.includes(def.type),
  );
  const optionalChips = profile.optionalDocuments.filter(
    (def) => !optionalHasFile.has(def.type) && !revealedOptional.includes(def.type),
  );

  const chipLabel = (def: OrganizationKycDocDefinition) => {
    if (def.type === 'msme_certificate') return '+ Udyam Certificate';
    if (def.type === 'iec_certificate') return '+ IEC';
    if (def.type === 'cin_certificate' || def.type === 'incorporation_certificate') {
      return '+ CIN';
    }
    return `+ ${def.label}`;
  };

  return (
    <View style={styles.stack}>
      <Text style={styles.docIntro}>
        Upload the documents we need to verify {orgName || 'your business'}.
      </Text>
      <Text style={styles.optionalCaption}>
        We've selected these based on your business type and registrations.
      </Text>
      <Text style={styles.sectionKicker}>Required documents</Text>
      {profile.requiredDocuments.map((def) => (
        <KycVerificationDocumentCard
          key={`req-${def.type}`}
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
      <View style={styles.optionalBlock}>
        <Text style={styles.optionalTitle}>Optional documents</Text>
        <Text style={styles.optionalCaption}>
          Add any other documents that help verify your business.
        </Text>
        {visibleOptional.map((def) => (
          <KycVerificationDocumentCard
            key={`opt-${def.type}`}
            definition={def}
            documents={documents}
            kyc={kyc}
            canEdit={canEdit}
            uploading={uploadingDocType === def.type}
            onOpenUpdate={onOpenUpdate}
            onRemove={canRemoveUploaded ? onRemoveDocument : undefined}
            onDismiss={
              !optionalHasFile.has(def.type)
                ? () =>
                    setRevealedOptional((prev) => prev.filter((type) => type !== def.type))
                : undefined
            }
          />
        ))}
        {canEdit && optionalChips.length > 0 ? (
          <View style={styles.optionalRow}>
            {optionalChips.map((def) => (
              <Pressable
                key={`chip-${def.type}`}
                style={styles.addChip}
                onPress={() => setRevealedOptional((prev) => [...prev, def.type])}
                accessibilityRole="button"
              >
                <Text style={styles.addChipText}>{chipLabel(def)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function VerifyStepper({
  infoIndex,
  complete,
}: {
  infoIndex: InfoStep;
  complete: boolean;
}) {
  return (
    <View style={styles.stepper} accessibilityRole="progressbar">
      {([0, 1, 2, 3] as const).map((i) => {
        const done = complete || i < infoIndex;
        const current = !complete && i === infoIndex;
        return (
          <Fragment key={i}>
            {i > 0 ? (
              <View style={[styles.rail, (complete || i <= infoIndex) && styles.railOn]} />
            ) : null}
            <View style={styles.stepNode}>
              <View
                style={[
                  styles.dot,
                  (done || current) && styles.dotOn,
                  current && styles.dotCurrent,
                ]}
              >
                {done ? <Text style={styles.dotCheck}>✓</Text> : null}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  (done || current) && styles.stepLabelOn,
                ]}
                numberOfLines={1}
              >
                {STEP_LABELS[i]}
              </Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, paddingHorizontal: 4, paddingBottom: 8 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  stepNode: { alignItems: 'center', gap: 4, minWidth: 52, flexShrink: 0 },
  rail: {
    flex: 1,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 4,
    marginTop: 9,
  },
  railOn: { backgroundColor: Theme.primary },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dotOn: { backgroundColor: Theme.primary },
  dotCurrent: {
    backgroundColor: Theme.textPrimaryDark,
  },
  dotCheck: { fontSize: 10, fontWeight: '800', color: Theme.textOnPrimary },
  stepLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: Theme.textMuted,
    letterSpacing: 0.1,
  },
  stepLabelOn: { color: Theme.textPrimaryDark },
  stepMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textMuted,
    letterSpacing: 0.3,
    textAlign: 'center',
    marginTop: 4,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  stepCaption: {
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textMuted,
    textAlign: 'center',
  },
  stack: { gap: 10 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  chip: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    justifyContent: 'center',
  },
  chipOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueSoft,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: Theme.textSecondary },
  chipTextOn: { color: Theme.brandBlueInk },
  addressBlock: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Theme.textPrimaryDark },
  input: {
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.screenBackground,
    minHeight: Layout.minTouchTargetSize,
  },
  inputRow: { flexDirection: 'row', gap: 8 },
  inputHalf: { flex: 1, minWidth: 0 },
  optionalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
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
  gstPrompt: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  gstChoiceRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 8,
  },
  gstChoice: {
    flex: 1,
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.cardWhite,
  },
  gstChoiceOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueSoft,
  },
  gstChoiceText: { fontSize: 14, fontWeight: '700', color: Theme.textSecondary },
  gstChoiceTextOn: { color: Theme.brandBlueInk },
  gstSkipped: { paddingHorizontal: 12, paddingBottom: 12, gap: 2 },
  gstSkippedTitle: { fontSize: 13, fontWeight: '700', color: Theme.textPrimaryDark },
  gstSkippedSub: { fontSize: 12, color: Theme.textMuted, lineHeight: 16 },
  optionalBlock: { gap: 6, paddingHorizontal: 4 },
  optionalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  optionalCaption: { fontSize: 12, color: Theme.textMuted, lineHeight: 16 },
  docIntro: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  sectionKicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Theme.textMuted,
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  editLink: { fontSize: 12, fontWeight: '700', color: Theme.primary },
  continueBtn: {
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 10,
    backgroundColor: Theme.buttonDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueDisabled: { opacity: 0.45 },
  continueText: { fontSize: 14, fontWeight: '700', color: Theme.buttonDarkText },
  errorText: {
    fontSize: 12,
    color: Theme.destructive,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
});
