/**
 * Shared workspace panel UI primitives.
 */
import { LoadingIndicator } from '@/components/LoadingIndicator';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import {
  effectiveKycRegistrationType,
  registrationTypeRequiresCin,
} from '@/features/organization/utils/kycVerification.util';
import type { WorkspaceKyc } from '@/types/organization';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock,
  Copy,
  Lock,
  Pencil,
} from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';

export const PURPLE = '#4D3636';
export const PURPLE_MID = '#312e81';
export const PURPLE_TINT = 'rgba(79,70,229,0.08)';
export const PURPLE_BORDER = 'rgba(79,70,229,0.18)';
export const TEAL = '#0f766e';
export const TEAL_TINT = 'rgba(15,118,110,0.08)';
export const AMBER = '#d97706';
export const AMBER_TINT = 'rgba(217,119,6,0.08)';
export const GREEN = '#16a34a';
export const GREEN_TINT = 'rgba(22,163,74,0.08)';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function orgInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0]![0] ?? '').toUpperCase();
  return ((words[0]![0] ?? '') + (words[words.length - 1]![0] ?? '')).toUpperCase();
}

export function modelLabel(m: string | undefined): string {
  switch (m) {
    case 'ASSET_BASED': return 'Asset-based';
    case 'NON_ASSET': return 'Non-asset';
    case 'HYBRID': return 'Hybrid';
    default: return 'Hybrid';
  }
}

export function modelColor(m: string | undefined): string {
  switch (m) {
    case 'ASSET_BASED': return TEAL;
    case 'NON_ASSET': return AMBER;
    default: return PURPLE;
  }
}

export type KycField = 'gstin' | 'business_pan' | 'cin' | 'msme_number' | 'tan_number' | 'iec_number';

export const KYC_FIELD_ORDER: KycField[] = [
  'gstin',
  'business_pan',
  'cin',
  'msme_number',
  'tan_number',
  'iec_number',
];

function kycLabel(f: KycField) {
  if (f === 'gstin') return 'GSTIN';
  if (f === 'business_pan') return 'Business PAN';
  if (f === 'cin') return 'CIN';
  if (f === 'msme_number') return 'MSME / Udyam';
  if (f === 'tan_number') return 'TAN';
  return 'IEC';
}

function kycSub(f: KycField) {
  if (f === 'gstin') return 'GST Identification Number (15 chars)';
  if (f === 'business_pan') return 'Permanent Account Number (10 chars)';
  if (f === 'cin') return 'Company Identification Number (21 chars)';
  if (f === 'msme_number') return 'Udyam Registration Number';
  if (f === 'tan_number') return 'Tax Deduction Account Number (10 chars)';
  return 'Importer Exporter Code (10 digits)';
}

function kycAddLabel(f: KycField) {
  if (f === 'gstin') return 'Enter GSTIN';
  if (f === 'business_pan') return 'Add PAN';
  if (f === 'cin') return 'Add CIN';
  if (f === 'msme_number') return 'Add Udyam';
  if (f === 'tan_number') return 'Add TAN';
  return 'Add IEC';
}

function kycPlaceholder(f: KycField) {
  if (f === 'gstin') return '27AAAAA0000A1Z5';
  if (f === 'business_pan') return 'AAAAA0000A';
  if (f === 'cin') return 'U12345MH2024PTC123456';
  if (f === 'msme_number') return 'UDYAM-MH-00-0000000';
  if (f === 'tan_number') return 'AAAA00000A';
  return '0000000000';
}

export function validateKyc(f: KycField, val: string): string | null {
  const v = val.trim().toUpperCase();
  if (!v) return null;
  if (f === 'gstin' && !/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/.test(v)) {
    return 'Invalid GSTIN format';
  }
  if (f === 'business_pan' && !/^[A-Z]{5}\d{4}[A-Z]$/.test(v)) {
    return 'Invalid PAN format (e.g. AAAAA0000A)';
  }
  if (f === 'cin' && v.length !== 21) {
    return 'CIN must be exactly 21 characters';
  }
  if (f === 'tan_number' && !/^[A-Z]{4}\d{5}[A-Z]$/.test(v)) {
    return 'Invalid TAN format (e.g. AAAA00000A)';
  }
  return null;
}

export function kycCompletionPct(kyc: WorkspaceKyc | null): number {
  if (!kyc) return 0;
  const gstOk = !!kyc.gst_not_applicable || !!kyc.gstin?.trim();
  const needsCin = registrationTypeRequiresCin(effectiveKycRegistrationType(kyc));
  const checks = [
    gstOk,
    !!kyc.business_pan?.trim(),
    !needsCin || !!kyc.cin?.trim(),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export type OrgProfileSnapshot = {
  gstin?: string | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  profile_website?: string | null;
};

export function profileCompletionPct(snap: OrgProfileSnapshot | null): number {
  if (!snap) return 0;
  const hasAddress = !!(snap.address_line || snap.city || snap.state);
  const hasWebsite = !!snap.profile_website;
  return Math.round(([hasAddress, hasWebsite].filter(Boolean).length / 2) * 100);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

export function SectionHeader({
  label,
  color = PURPLE,
  trailing,
}: {
  label: string;
  color?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={sh.wrap}>
      <View style={sh.left}>
        <View style={[sh.accent, { backgroundColor: color }]} />
        <Text
          style={[
            sh.title,
            Platform.OS === 'web'
              ? ({ whiteSpace: 'pre-wrap', letterSpacing: 0 } as TextStyle)
              : null,
          ]}
        >
          {label}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

const sh = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: Theme.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  accent: { width: 2, height: 9, borderRadius: 1, flexShrink: 0 },
  title: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Theme.textMuted,
  },
});

export function KycProgressBlock({
  pct,
  barColor,
  inline,
}: {
  pct: number;
  barColor: string;
  /** When true, renders a single compact row (bar + label). */
  inline?: boolean;
}) {
  if (inline) {
    return (
      <View style={kp.inlineWrap}>
        <View style={kp.inlineTrack}>
          <View
            style={[
              kp.fill,
              { width: `${pct}%` as `${number}%`, backgroundColor: barColor },
            ]}
          />
        </View>
        <Text style={kp.inlineLabel}>{pct}%</Text>
      </View>
    );
  }

  return (
    <View style={kp.wrap}>
      <View style={kp.track}>
        <View
          style={[
            kp.fill,
            { width: `${pct}%` as `${number}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      <Text style={kp.label}>{pct}% complete</Text>
    </View>
  );
}

const kp = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 8, gap: 5 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.surfaceGray,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 2 },
  label: { fontSize: 10, fontWeight: '500', color: Theme.textMuted },
  inlineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    minWidth: 88,
  },
  inlineTrack: {
    width: 56,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.surfaceGray,
    overflow: 'hidden',
  },
  inlineLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textMuted,
    minWidth: 28,
    textAlign: 'right',
  },
});

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={ir.row}>
      <Text style={ir.label}>{label}</Text>
      <Text style={ir.value} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

const ir = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    minHeight: 40,
  },
  label: {
    fontSize: 11,
    color: Theme.textMuted,
    fontWeight: '500',
    flexShrink: 0,
    letterSpacing: 0,
  },
  value: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    textAlign: 'right',
    flex: 1,
    minWidth: 0,
    letterSpacing: -0.05,
  },
});

export function ProfileFieldRow({
  label,
  value,
  filled,
}: {
  label: string;
  value: string;
  filled: boolean;
}) {
  return (
    <View style={pf.row}>
      <View style={[pf.dot, { backgroundColor: filled ? GREEN_TINT : Theme.surfaceGray }]}>
        {filled ? (
          <CheckCircle2 size={12} color={GREEN} strokeWidth={2.2} />
        ) : (
          <CircleDashed size={12} color={Theme.textMuted} strokeWidth={2} />
        )}
      </View>
      <View style={pf.text}>
        <Text style={pf.label}>{label}</Text>
        <Text style={[pf.value, !filled && pf.valueMissing]} numberOfLines={2}>
          {filled ? value : 'Not filled'}
        </Text>
      </View>
    </View>
  );
}

const pf = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    minHeight: 40,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  text: { flex: 1, minWidth: 0, gap: 1 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  value: {
    fontSize: 10,
    fontWeight: '400',
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  valueMissing: { color: Theme.textMuted, fontStyle: 'normal' },
});

export function OrgIdCopyRow({
  orgId,
  copying,
  onCopy,
}: {
  orgId: string;
  copying: boolean;
  onCopy: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [oid.row, pressed && { backgroundColor: Theme.surfaceGray }]}
      onPress={onCopy}
      accessibilityRole="button"
      accessibilityLabel="Copy organisation ID"
    >
      <View style={[oid.icon, { backgroundColor: PURPLE_TINT }]}>
        {copying ? (
          <Check size={13} color={GREEN} strokeWidth={2.6} />
        ) : (
          <Copy size={13} color={PURPLE} strokeWidth={2.2} />
        )}
      </View>
      <View style={oid.text}>
        <Text style={oid.label}>Org ID</Text>
        <Text style={oid.value} numberOfLines={1}>
          {orgId || '—'}
        </Text>
      </View>
      <Text style={oid.hint}>{copying ? 'Copied!' : 'Copy'}</Text>
    </Pressable>
  );
}

export function NavRow({
  icon,
  iconBg,
  label,
  sub,
  onPress,
}: {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  sub?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [nr.row, pressed && { backgroundColor: Theme.surfaceGray }]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={[nr.icon, iconBg ? { backgroundColor: iconBg } : null]}>{icon}</View>
      <View style={nr.text}>
        <Text style={nr.label}>{label}</Text>
        {sub ? <Text style={nr.sub}>{sub}</Text> : null}
      </View>
      <ChevronRight size={14} color={Theme.textMuted} strokeWidth={2} />
    </Pressable>
  );
}

const nr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    minHeight: 52,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.05,
  },
  sub: { fontSize: 10, color: Theme.textMuted, fontWeight: '500', lineHeight: 14 },
});

// ─── Inline KYC field editor ──────────────────────────────────────────────────

export function KycFieldRow({
  field,
  value,
  verificationStatus,
  canEdit,
  onSave,
  onValidateGstin,
  required,
  optional,
  onRemove,
}: {
  field: KycField;
  value: string | null | undefined;
  verificationStatus: string | null | undefined;
  canEdit: boolean;
  onSave: (field: KycField, val: string) => Promise<void>;
  onValidateGstin?: (
    gstin: string,
  ) => Promise<{ ok: boolean; message?: string; registryName?: string }>;
  /** Structure-driven: show Required pill (e.g. CIN for Private Limited). */
  required?: boolean;
  optional?: boolean;
  /** Optional IDs only — GSTIN / PAN / structure-required CIN cannot be removed. */
  onRemove?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [gstinValidating, setGstinValidating] = useState(false);
  const [gstinHint, setGstinHint] = useState<string | null>(null);
  const [validationErr, setValidationErr] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const isVerified = verificationStatus === 'verified';
  const isFrozen = isVerified || verificationStatus === 'pending';
  const hasValue = !!value?.trim();

  const statusIcon = isVerified
    ? <CheckCircle2 size={12} color={GREEN} strokeWidth={2.2} />
    : hasValue
    ? <Clock size={12} color={AMBER} strokeWidth={2.2} />
    : <CircleDashed size={12} color={Theme.textMuted} strokeWidth={2} />;

  const statusColor = isVerified ? GREEN : hasValue ? AMBER : Theme.textMuted;
  const statusBg = isVerified ? GREEN_TINT : hasValue ? AMBER_TINT : Theme.surfaceGray;

  const handleEdit = () => {
    if (!canEdit || isFrozen) return;
    setDraft(value ?? '');
    setValidationErr(null);
    setGstinHint(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const handleSave = async () => {
    const err = validateKyc(field, draft);
    if (err) { setValidationErr(err); return; }
    setSaving(true);
    try {
      await onSave(field, draft.trim().toUpperCase());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleValidateGstin = async () => {
    if (!onValidateGstin || field !== 'gstin') return;
    const err = validateKyc(field, draft);
    if (err) { setValidationErr(err); return; }
    setGstinValidating(true);
    setValidationErr(null);
    try {
      const result = await onValidateGstin(draft.trim().toUpperCase());
      if (!result.ok) {
        setValidationErr(result.message ?? 'GSTIN validation failed');
        setGstinHint(null);
        return;
      }
      setGstinHint(
        result.registryName
          ? `Verified — ${result.registryName}`
          : 'GSTIN verified and saved',
      );
      setEditing(false);
    } finally {
      setGstinValidating(false);
    }
  };

  const displayValue = isVerified
    ? 'Verified'
    : hasValue
      ? (value ?? '').trim()
      : '';
  const actionLabel = hasValue ? 'Edit' : kycAddLabel(field);

  return (
    <View style={kf.wrap}>
      <Pressable
        style={kf.row}
        onPress={canEdit && !isFrozen && !editing ? handleEdit : undefined}
        disabled={!canEdit || isFrozen || editing}
        accessibilityRole={canEdit && !isFrozen && !editing ? 'button' : undefined}
        accessibilityLabel={
          canEdit && !isFrozen && !editing
            ? `${actionLabel} ${kycLabel(field)}`
            : undefined
        }
      >
        <View style={[kf.iconBox, { backgroundColor: statusBg }]}>{statusIcon}</View>
        <View style={kf.main}>
          <View style={kf.labelRow}>
            <Text style={kf.label}>{kycLabel(field)}</Text>
            {required ? (
              <View style={kf.requiredPill}>
                <Text style={kf.requiredPillText}>Required</Text>
              </View>
            ) : null}
            {optional && !required ? (
              <View style={kf.optionalPill}>
                <Text style={kf.optionalPillText}>Optional</Text>
              </View>
            ) : null}
          </View>
          <Text style={kf.hint} numberOfLines={2}>
            {required && field === 'cin'
              ? 'Required for Private / Public Limited'
              : kycSub(field)}
          </Text>
        </View>
        {!editing ? (
          <View style={kf.trailing}>
            {hasValue || isVerified ? (
              <Text
                style={[
                  kf.valueLine,
                  (hasValue || isVerified) && { color: statusColor },
                ]}
                numberOfLines={1}
              >
                {displayValue}
              </Text>
            ) : null}
            {canEdit && !isFrozen ? (
              <View style={kf.trailingActions}>
                <View
                  style={kf.editBtn}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {hasValue ? (
                    <Pencil size={10} color={PURPLE} strokeWidth={2.2} />
                  ) : null}
                  <Text style={kf.editBtnText}>{actionLabel}</Text>
                </View>
                {onRemove ? (
                  <Pressable
                    style={kf.removeBtn}
                    onPress={onRemove}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${kycLabel(field)}`}
                  >
                    <Text style={kf.removeBtnText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : isFrozen ? (
              <Lock size={11} color={Theme.textMuted} strokeWidth={2} />
            ) : null}
          </View>
        ) : null}
      </Pressable>
      {editing ? (
        <View style={kf.editor}>
          <TextInput
            ref={inputRef}
            style={kf.input}
            value={draft}
            onChangeText={(t) => { setDraft(t); setValidationErr(null); }}
            placeholder={kycPlaceholder(field)}
            placeholderTextColor={Theme.textMuted}
            autoCapitalize="characters"
            returnKeyType="done"
            onSubmitEditing={() => void handleSave()}
          />
          <View style={kf.actionRow}>
            {field === 'gstin' && onValidateGstin && draft.trim().length === 15 ? (
              <Pressable
                style={({ pressed }) => [kf.saveBtn, pressed && { opacity: 0.9 }]}
                onPress={() => void handleValidateGstin()}
                disabled={gstinValidating || saving}
              >
                {gstinValidating ? (
                  <LoadingIndicator size="small" color="#fff" />
                ) : (
                  <Text style={kf.saveBtnText}>Verify GSTIN</Text>
                )}
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [kf.saveBtn, pressed && { opacity: 0.9 }]}
              onPress={() => void handleSave()}
              disabled={saving || gstinValidating}
              accessibilityRole="button"
              accessibilityLabel={`Save ${kycLabel(field)}`}
            >
              {saving ? (
                <LoadingIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Check size={11} color="#fff" strokeWidth={2.8} />
                  <Text style={kf.saveBtnText}>Save</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={kf.cancelBtn}
              onPress={() => setEditing(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel edit"
            >
              <Text style={kf.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          {gstinHint ? <Text style={kf.hintOk}>{gstinHint}</Text> : null}
          {validationErr ? <Text style={kf.errText}>{validationErr}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export function KycFieldsList({
  kyc,
  canEdit,
  onSave,
  onValidateGstin,
  onSetGstNotApplicable,
  forceShowOptional = [],
  cinRequired: cinRequiredProp,
  section = 'all',
  onRemoveOptional,
  hideGstin = false,
}: {
  kyc: WorkspaceKyc | null;
  canEdit: boolean;
  onSave: (field: KycField, val: string) => Promise<void>;
  onValidateGstin?: (
    gstin: string,
  ) => Promise<{ ok: boolean; message?: string; registryName?: string }>;
  onSetGstNotApplicable?: (notApplicable: boolean) => Promise<void>;
  /** Reveal empty optional IDs (CIN / Udyam / TAN / IEC) without listing them as blanks by default. */
  forceShowOptional?: KycField[];
  /** Override: CIN required for Private / Public Limited. */
  cinRequired?: boolean;
  section?: 'required' | 'optional' | 'all';
  onRemoveOptional?: (field: KycField) => void;
  /** Wizard asks GST Yes/No separately. */
  hideGstin?: boolean;
}) {
  const gstSkipped = !!kyc?.gst_not_applicable;
  const [gstSkipBusy, setGstSkipBusy] = useState(false);
  const cinRequired =
    cinRequiredProp ??
    registrationTypeRequiresCin(effectiveKycRegistrationType(kyc));
  const showRequired = section !== 'optional';
  const showOptional = section !== 'required';

  const handleGstSkip = async (notApplicable: boolean) => {
    if (!onSetGstNotApplicable || gstSkipBusy) return;
    setGstSkipBusy(true);
    try {
      await onSetGstNotApplicable(notApplicable);
    } finally {
      setGstSkipBusy(false);
    }
  };

  return (
    <>
      {showRequired && !hideGstin ? (
        gstSkipped ? (
          <View style={kf.gstSkipActive}>
            <View style={kf.gstSkipActiveTextCol}>
              <Text style={kf.gstSkipActiveTitle}>GSTIN</Text>
              <Text style={kf.gstSkipActiveSub}>
                Not registered for GST — skip saved on this organisation
              </Text>
            </View>
            {canEdit && onSetGstNotApplicable ? (
              <Pressable
                style={kf.gstSkipUndo}
                disabled={gstSkipBusy}
                onPress={() => void handleGstSkip(false)}
                accessibilityRole="button"
                accessibilityLabel="Add GSTIN instead"
              >
                <Text style={kf.gstSkipUndoText}>{gstSkipBusy ? '…' : 'Add GSTIN'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <KycFieldRow
              field="gstin"
              value={kyc?.gstin}
              verificationStatus={kyc?.verification_status}
              canEdit={canEdit}
              onSave={onSave}
              onValidateGstin={onValidateGstin}
              required
            />
            {canEdit && onSetGstNotApplicable ? (
              <Pressable
                style={kf.gstSkipRow}
                disabled={gstSkipBusy}
                onPress={() => void handleGstSkip(true)}
                accessibilityRole="button"
                accessibilityLabel="Skip GSTIN — not registered for GST"
              >
                <Text style={kf.gstSkipRowText}>
                  {gstSkipBusy ? 'Saving…' : "I don't have a GSTIN (not registered for GST)"}
                </Text>
              </Pressable>
            ) : null}
          </>
        )
      ) : null}
      {KYC_FIELD_ORDER.filter((field) => field !== 'gstin').map((field) => {
        const fieldCinRequired = field === 'cin' && cinRequired;
        const optionalField =
          field === 'msme_number' ||
          field === 'tan_number' ||
          field === 'iec_number' ||
          (field === 'cin' && !cinRequired);
        if (optionalField && !showOptional) return null;
        if (!optionalField && !showRequired) return null;
        if (
          optionalField &&
          !kyc?.[field]?.trim() &&
          !forceShowOptional.includes(field)
        ) {
          return null;
        }
        return (
          <KycFieldRow
            key={field}
            field={field}
            value={kyc?.[field]}
            verificationStatus={kyc?.verification_status}
            canEdit={canEdit}
            onSave={onSave}
            onValidateGstin={undefined}
            required={field === 'business_pan' || fieldCinRequired}
            optional={optionalField}
            onRemove={
              optionalField && onRemoveOptional
                ? () => onRemoveOptional(field)
                : undefined
            }
          />
        );
      })}
    </>
  );
}

const kf = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  main: { flex: 1, minWidth: 0, gap: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  requiredPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  requiredPillText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: Theme.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  optionalPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
  },
  optionalPillText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  hint: {
    fontSize: 10,
    color: Theme.textMuted,
    lineHeight: 13,
    fontWeight: '400',
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 0,
    maxWidth: '48%',
  },
  trailingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  removeBtn: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    minHeight: 28,
    justifyContent: 'center',
  },
  removeBtnText: { fontSize: 10, fontWeight: '600', color: Theme.textMuted },
  valueLine: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'right',
    flexShrink: 1,
  },
  valueEmpty: {
    color: Theme.textMuted,
    fontStyle: 'normal',
    fontWeight: '400',
    fontFamily: undefined,
    letterSpacing: 0,
  },
  editor: {
    marginLeft: 38,
    gap: 6,
    alignSelf: 'stretch',
    minWidth: 0,
  },
  input: {
    alignSelf: 'stretch',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    color: Theme.textPrimaryDark,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: Theme.screenBackground,
    minHeight: 34,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    flexWrap: 'wrap',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: PURPLE,
    flexShrink: 0,
  },
  saveBtnText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  cancelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexShrink: 0,
  },
  cancelText: { fontSize: 11, color: Theme.textMuted, fontWeight: '500' },
  errText: { fontSize: 10, color: Theme.negative, fontWeight: '500' },
  hintOk: { fontSize: 10, color: GREEN, fontWeight: '500' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    flexShrink: 0,
  },
  editBtnText: { fontSize: 10, fontWeight: '600', color: PURPLE },
  gstSkipRow: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  gstSkipRowText: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.primary,
  },
  gstSkipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    minHeight: 48,
  },
  gstSkipActiveTextCol: { flex: 1, minWidth: 0, gap: 2 },
  gstSkipActiveTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  gstSkipActiveSub: {
    fontSize: 10,
    color: Theme.textMuted,
    fontWeight: '500',
    lineHeight: 14,
  },
  gstSkipUndo: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  gstSkipUndoText: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.primary,
  },
});

const oid = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    minHeight: 40,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.05,
  },
  value: {
    fontSize: 9,
    color: Theme.textMuted,
    fontWeight: '400',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.05,
  },
  hint: { fontSize: 10, fontWeight: '500', color: PURPLE },
});


export const workspacePanelStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.screenBackground },

  // Hero
  hero: { paddingHorizontal: Layout.screenPaddingHorizontal, paddingBottom: 24 },
  heroTopBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, marginBottom: 4 },
  backBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  heroTitleWrap: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.1 },
  heroSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  saveChip: { minWidth: 52, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  saveChipActive: { backgroundColor: 'rgba(255,255,255,0.28)', borderColor: 'rgba(255,255,255,0.45)' },
  saveChipText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  saveChipPlaceholder: { width: 52 },

  heroBody: { alignItems: 'center', paddingTop: 6, gap: 8 },
  logoWrap: { position: 'relative', width: 80, height: 80 },
  logoImage: { width: 80, height: 80, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  logoPlaceholder: { width: 80, height: 80, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  logoInitials: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  logoCameraBadge: { position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 7, backgroundColor: PURPLE_MID, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  heroOrgName: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.2, textAlign: 'center' },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modelBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  modelBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  viewOnlyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  viewOnlyText: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  // Content (legacy full-page panels)
  content: { padding: Layout.screenPaddingHorizontal, gap: 14 },
  /** Detail pane cards — aligned with WorkspaceHubMenu sectionCard */
  detailCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ebf0',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e4e7ef',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },

  // KYC banner — hub insightBanner scale
  kycBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: AMBER_TINT,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(217,119,6,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  kycBannerTitle: { fontSize: 11, fontWeight: '700', color: AMBER, letterSpacing: -0.05 },
  kycBannerSub: { fontSize: 10, fontWeight: '500', color: AMBER, opacity: 0.85, marginTop: 2, lineHeight: 14 },

  // KYC progress
  kycProgressWrap: { paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  kycTrack: { height: 5, borderRadius: 3, backgroundColor: Theme.surfaceGray, overflow: 'hidden' },
  kycFill: { height: '100%', borderRadius: 3 },
  kycPctLabel: { fontSize: 10, fontWeight: '700', color: Theme.textMuted, letterSpacing: 0.4 },
  kycReadonlyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  kycReadonlyText: { fontSize: 10, color: Theme.textMuted, flex: 1, fontWeight: '400', lineHeight: 14 },
  kycStack: { gap: 12, width: '100%' },
  /** Shared vertical stack for workspace detail panes (settings, KYC, etc.). */
  panelStack: { gap: 12, width: '100%' },

  // Hub-aligned form fields (settings, account edit)
  panelFieldGroup: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  panelFieldGroupFirst: { borderTopWidth: 0 },
  panelFieldLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textMuted,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  panelFieldInput: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    color: Theme.textPrimaryDark,
    minHeight: 44,
  },
  panelFieldInputReadonly: {
    backgroundColor: Theme.surface,
    color: Theme.textSecondary,
  },
  panelFieldStatic: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    color: Theme.textSecondary,
    letterSpacing: -0.1,
  },
  panelFieldHint: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: Theme.primary,
  },

  // Org name field
  nameInputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Theme.borderMedium, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: Theme.surface, gap: 10, marginHorizontal: 14, marginBottom: 2 },
  nameInput: { flex: 1, fontSize: 16, fontWeight: '700', color: Theme.textPrimaryDark },
  nameInputReadonly: { color: Theme.textSecondary },
  nameSaveBtn: { borderRadius: 14, overflow: 'hidden', marginHorizontal: 14, marginBottom: 14 },
  nameSaveGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14 },
  nameSaveTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Invoice preview — hub insight scale
  previewPaper: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    overflow: 'hidden',
    paddingVertical: 14,
    paddingHorizontal: 12,
    minHeight: 88,
    justifyContent: 'center',
    position: 'relative',
    marginHorizontal: 14,
    marginBottom: 14,
    marginTop: 4,
  },
  previewWatermark: {
    position: 'absolute',
    transform: [{ rotate: '-30deg' }],
    fontSize: 18,
    fontWeight: '800',
    color: 'rgba(15,23,42,0.05)',
    textTransform: 'uppercase',
    alignSelf: 'center',
  },
  previewLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewLogo: { width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.surfaceGray },
  previewLogoFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PURPLE_TINT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PURPLE_BORDER,
  },
  previewLogoInitials: { fontSize: 12, fontWeight: '800', color: PURPLE },
  previewCompanyName: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: 0.35,
  },
  previewDocType: { fontSize: 10, fontWeight: '500', color: Theme.textMuted, marginTop: 2 },

  // Logo upload row
  logoUploadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight },
  logoThumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: Theme.surfaceGray, borderWidth: 1, borderColor: Theme.borderLight },
  logoThumbFallback: { width: 48, height: 48, borderRadius: 12, backgroundColor: PURPLE_TINT, alignItems: 'center', justifyContent: 'center' },
  logoThumbInitials: { fontSize: 16, fontWeight: '900', color: PURPLE },
  logoUploadInfo: { flex: 1, minWidth: 0, gap: 2 },
  logoUploadTitle: { fontSize: 14, fontWeight: '700', color: Theme.textPrimaryDark },
  logoUploadSub: { fontSize: 11, color: Theme.textSecondary },
  logoUploadChip: { width: 34, height: 34, borderRadius: 10, backgroundColor: PURPLE_TINT, alignItems: 'center', justifyContent: 'center' },

  // Org identity
  copyHint: { fontSize: 12, fontWeight: '600', color: PURPLE },

  // Note card
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: TEAL_TINT, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(15,118,110,0.2)', padding: 14 },
  noteTitle: { fontSize: 12, fontWeight: '700', color: TEAL, marginBottom: 3 },
  noteBody: { fontSize: 11, color: TEAL, opacity: 0.85, lineHeight: 16 },
});
