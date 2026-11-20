/**
 * Driver registration form fields — shared layout with Finance `PartyRegistrationPortal`.
 * Required: name, mobile, driving licence. Optional: email, pay terms.
 */
import { FinanceTxnTypography } from '@/constants/FinanceTxnTypography';
import Theme from '@/constants/Theme';
import { formatMobileNumber } from '@/lib/format';
import { isContactPickerAvailable } from '@/lib/contactPicker';
import type { ExistingDriverMatch } from '@/features/drivers/services/drivers.service';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { BookUser, Key, Mail, UserPlus } from 'lucide-react-native';
import type { ReactNode } from 'react';

export function IndiaFlagIcon({
  width = 20,
  height = 15,
}: {
  width?: number;
  height?: number;
}) {
  const spokes = [...Array(24)].map((_, i) => (
    <Path
      key={i}
      transform={`rotate(${i * 15} 450 300)`}
      d="M450 208L444 300L456 300Z"
      fill="#000080"
    />
  ));
  return (
    <Svg width={width} height={height} viewBox="0 0 900 600">
      <Rect width={900} height={600} fill="#FF9933" />
      <Rect width={900} height={400} y={200} fill="#FFFFFF" />
      <Rect width={900} height={200} y={400} fill="#138808" />
      <Circle cx={450} cy={300} r={92.5} fill="#000080" />
      <Circle cx={450} cy={300} r={80} fill="#FFFFFF" />
      <Circle cx={450} cy={300} r={16} fill="#000080" />
      {spokes}
    </Svg>
  );
}

function Field(props: {
  label: string;
  optionalHint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{props.label}</Text>
        {props.optionalHint ? (
          <Text style={styles.optionalPill}>{props.optionalHint}</Text>
        ) : null}
      </View>
      {props.children}
    </View>
  );
}

export type DriverRegistrationFormValues = {
  name: string;
  phone: string;
  licenseNumber: string;
  email: string;
  payableAmount: number | null;
  commissionPercent: number | null;
  commissionPerKm: number | null;
  /** Invite only: vehicle, route, shift / hours, duties. */
  jobDescription?: string;
  /** Invite only: terms & conditions the driver must agree to. */
  termsText?: string;
};

type Props = {
  values: DriverRegistrationFormValues;
  layoutWide: boolean;
  inviteMode: boolean;
  importLoading: boolean;
  importError: string | null;
  onImportFromContacts: () => void;
  onChangeName: (v: string) => void;
  onChangePhone: (v: string) => void;
  onChangeLicense: (v: string) => void;
  onChangeEmail: (v: string) => void;
  onChangePayableAmount: (v: number | null) => void;
  onChangeCommissionPercent: (v: number | null) => void;
  onChangeCommissionPerKm: (v: number | null) => void;
  /** When given (invite mode), shows the Job description field. */
  onChangeJobDescription?: (v: string) => void;
  /** When given (invite mode), shows the Terms & conditions field. */
  onChangeTermsText?: (v: string) => void;
  phoneLookupLoading?: boolean;
  phoneLookupError?: string | null;
  existingMatches?: ExistingDriverMatch[];
  existingDriverHint?: string;
  existingDriverInFleetDetail?: string;
  existingDriverNotInFleetHint?: string;
  onAddOfflineInstead?: () => void;
  preferOfflineOnly?: boolean;
  submitting?: boolean;
  minPhoneLengthForSearch?: number;
};

export function DriverRegistrationFormFields({
  values,
  layoutWide,
  inviteMode,
  importLoading,
  importError,
  onImportFromContacts,
  onChangeName,
  onChangePhone,
  onChangeLicense,
  onChangeEmail,
  onChangePayableAmount,
  onChangeCommissionPercent,
  onChangeCommissionPerKm,
  onChangeJobDescription,
  onChangeTermsText,
  phoneLookupLoading = false,
  phoneLookupError = null,
  existingMatches = [],
  existingDriverHint,
  existingDriverInFleetDetail,
  existingDriverNotInFleetHint,
  onAddOfflineInstead,
  preferOfflineOnly = false,
  submitting = false,
  minPhoneLengthForSearch = 8,
}: Props) {
  const contactPickerAvailable = isContactPickerAvailable();

  return (
    <View style={styles.fieldsBlock}>
      <View style={styles.importContactsWrap}>
        <Pressable
          style={[
            styles.importContactsBtn,
            (!contactPickerAvailable || importLoading) && styles.importContactsBtnDim,
          ]}
          onPress={onImportFromContacts}
          disabled={importLoading || submitting}
        >
          {importLoading ? (
            <ActivityIndicator size="small" color="#2563eb" />
          ) : (
            <BookUser
              size={16}
              color={contactPickerAvailable ? '#2563eb' : Theme.textMuted}
              strokeWidth={2.2}
            />
          )}
          <Text
            style={[
              styles.importContactsBtnText,
              !contactPickerAvailable && styles.importContactsBtnTextMuted,
            ]}
          >
            {importLoading ? 'Opening contacts…' : 'Import from contacts'}
          </Text>
        </Pressable>
        {importError ? (
          <Text style={styles.importContactsError}>{importError}</Text>
        ) : !contactPickerAvailable ? (
          <Text style={styles.importContactsHint}>
            Open this page on your phone&apos;s Chrome browser to use contact import.
          </Text>
        ) : null}
      </View>

      <Field label="Driver name">
        <View style={styles.inputIconRow}>
          <UserPlus size={18} color={Theme.textMuted} style={styles.inputLeadingIcon} />
          <TextInput
            style={[styles.input, styles.inputPadded]}
            placeholder="Legal name"
            placeholderTextColor={Theme.textMuted}
            value={values.name}
            onChangeText={onChangeName}
            editable={!submitting}
            testID="driver-name-input"
            autoCorrect={false}
            spellCheck={false}
          />
        </View>
      </Field>

      <View style={[styles.row2, layoutWide && styles.row2Web]}>
        <View style={layoutWide ? styles.row2Grow : undefined}>
          <Field label="Mobile">
            <View style={[styles.phoneOuter, styles.inputIconRow]}>
              <View style={styles.phoneCcWrap}>
                <IndiaFlagIcon width={20} height={15} />
                <Text style={styles.phoneCc}>+91</Text>
              </View>
              <TextInput
                style={[styles.input, styles.phoneInput]}
                keyboardType="phone-pad"
                maxLength={inviteMode ? 10 : 14}
                placeholder="10-digit number"
                placeholderTextColor={Theme.textMuted}
                value={values.phone}
                onChangeText={(v) =>
                  onChangePhone(
                    inviteMode
                      ? formatMobileNumber(v.replace(/^\+91/, '').replace(/^\+/, ''))
                      : v.replace(/[^\d+]/g, ''),
                  )
                }
                editable={!submitting}
                testID="driver-phone-input"
              />
            </View>
          </Field>
        </View>
        <View style={layoutWide ? styles.row2Grow : undefined}>
          <Field label="Driving licence No.">
            <View style={styles.inputIconRow}>
              <Key size={18} color={Theme.textMuted} style={styles.inputLeadingIcon} />
              <TextInput
                style={[styles.input, styles.inputPadded]}
                placeholder="TN01 20200001234"
                placeholderTextColor={Theme.textMuted}
                autoCapitalize="characters"
                value={values.licenseNumber}
                onChangeText={(v) => onChangeLicense(v.toUpperCase())}
                editable={!submitting}
                testID="driver-dl-input"
                autoCorrect={false}
              />
            </View>
          </Field>
        </View>
      </View>

      <Field label="Email" optionalHint="optional">
        <View style={styles.inputIconRow}>
          <Mail size={18} color={Theme.textMuted} style={styles.inputLeadingIcon} />
          <TextInput
            style={[styles.input, styles.inputPadded]}
            placeholder="name@example.com"
            placeholderTextColor={Theme.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={values.email}
            onChangeText={onChangeEmail}
            editable={!submitting}
          />
        </View>
      </Field>

      <Field label="Fixed salary (₹)" optionalHint="optional">
        <TextInput
          style={styles.input}
          placeholder="e.g. 25000"
          placeholderTextColor={Theme.textMuted}
          keyboardType="numeric"
          value={
            values.payableAmount != null && values.payableAmount !== 0
              ? String(values.payableAmount)
              : ''
          }
          onChangeText={(v) => {
            const n = v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
            onChangePayableAmount(n != null && !Number.isNaN(n) ? n : null);
          }}
          editable={!submitting}
        />
      </Field>

      <View style={[styles.row2, layoutWide && styles.row2Web]}>
        <View style={layoutWide ? styles.row2Grow : undefined}>
          <Field label="Commission (%)" optionalHint="optional">
            <TextInput
              style={styles.input}
              placeholder="e.g. 10"
              placeholderTextColor={Theme.textMuted}
              keyboardType="numeric"
              value={
                values.commissionPercent != null && values.commissionPercent !== 0
                  ? String(values.commissionPercent)
                  : ''
              }
              onChangeText={(v) => {
                const n = v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                const val =
                  n != null && !Number.isNaN(n) ? Math.min(100, Math.max(0, n)) : null;
                onChangeCommissionPercent(val);
              }}
              editable={!submitting}
            />
          </Field>
        </View>
        <View style={layoutWide ? styles.row2Grow : undefined}>
          <Field label="Per km (₹/km)" optionalHint="optional">
            <TextInput
              style={styles.input}
              placeholder="e.g. 8"
              placeholderTextColor={Theme.textMuted}
              keyboardType="numeric"
              value={
                values.commissionPerKm != null && values.commissionPerKm !== 0
                  ? String(values.commissionPerKm)
                  : ''
              }
              onChangeText={(v) => {
                const n = v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                onChangeCommissionPerKm(
                  n != null && !Number.isNaN(n) && n >= 0 ? n : null,
                );
              }}
              editable={!submitting}
            />
          </Field>
        </View>
      </View>

      {inviteMode && onChangeJobDescription ? (
        <Field label="Job description" optionalHint="optional">
          <TextInput
            style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
            placeholder="Vehicle, route, shift / working hours, duties"
            placeholderTextColor={Theme.textMuted}
            multiline
            value={values.jobDescription ?? ''}
            onChangeText={onChangeJobDescription}
            editable={!submitting}
          />
        </Field>
      ) : null}
      {inviteMode && onChangeTermsText ? (
        <Field label="Terms & conditions" optionalHint="driver must agree">
          <TextInput
            style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
            placeholder="e.g. Notice period, leave, fuel / toll rules, payment day"
            placeholderTextColor={Theme.textMuted}
            multiline
            value={values.termsText ?? ''}
            onChangeText={onChangeTermsText}
            editable={!submitting}
          />
        </Field>
      ) : null}

      {inviteMode ? (
        <>
          {existingDriverHint ? (
            <Text style={styles.lookupHint}>{existingDriverHint}</Text>
          ) : null}
          {values.phone.trim().replace(/\s+/g, '').length >= minPhoneLengthForSearch &&
          phoneLookupLoading ? (
            <View style={styles.lookupLoadingRow}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.lookupLoadingText}>Looking up…</Text>
            </View>
          ) : null}
          {phoneLookupError ? (
            <Text style={styles.importContactsError}>{phoneLookupError}</Text>
          ) : null}
          {existingMatches.length > 0 ? (
            <View style={styles.inviteeCard}>
              <Text style={styles.inviteeLabel}>
                {existingMatches.some((m) => m.is_in_fleet)
                  ? 'Already in your fleet'
                  : 'Driver found on platform'}
              </Text>
              <Text style={styles.inviteeName}>
                {existingMatches[0]?.full_name || existingMatches[0]?.phone || '—'}
              </Text>
              <Text style={styles.inviteeHint}>
                {existingMatches.some((m) => m.is_in_fleet)
                  ? existingDriverInFleetDetail
                  : existingDriverNotInFleetHint}
              </Text>
              {!existingMatches.some((m) => m.is_in_fleet === true) ? (
                preferOfflineOnly ? (
                  <Text style={styles.inviteeHint}>
                    Offline fleet record only — no in-app invite will be sent.
                  </Text>
                ) : onAddOfflineInstead ? (
                  <Pressable
                    onPress={onAddOfflineInstead}
                    disabled={submitting}
                    style={styles.offlineLink}
                    testID="driver-add-offline-btn"
                  >
                    <Text style={styles.offlineLinkText}>Add as offline driver instead</Text>
                  </Pressable>
                ) : null
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export const driverRegistrationFormStyles = StyleSheet.create({
  fieldsBlock: {
    marginBottom: 8,
  },
  fieldWrap: {
    marginBottom: 12,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  fieldLabel: {
    ...FinanceTxnTypography.fieldLabel,
  },
  optionalPill: {
    ...FinanceTxnTypography.noDueChip,
  },
  row2: {
    marginBottom: 0,
  },
  row2Web: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  row2Grow: {
    flex: 1,
    minWidth: 0,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: 12,
    fontWeight: '500',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
    backgroundColor: '#fff',
    ...Platform.select({
      web: { outlineStyle: 'none' } as object,
      default: {},
    }),
  },
  inputIconRow: {
    position: 'relative',
  },
  inputLeadingIcon: {
    position: 'absolute',
    left: 12,
    top: 13,
    zIndex: 1,
  },
  inputPadded: {
    paddingLeft: 38,
  },
  phoneOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingLeft: 10,
    paddingRight: 8,
    gap: 8,
    minHeight: 44,
    position: 'relative',
  },
  phoneCcWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 12,
    marginRight: 4,
    borderRightWidth: 1,
    borderRightColor: '#f1f5f9',
  },
  phoneCc: {
    ...FinanceTxnTypography.dateLine,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
    borderWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '500',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
  },
  importContactsWrap: {
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  importContactsError: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b91c1c',
    marginTop: 8,
    lineHeight: 17,
  },
  importContactsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    minWidth: 180,
  },
  importContactsBtnDim: {
    opacity: 0.55,
  },
  importContactsBtnText: {
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 9,
    fontWeight: '600',
    color: '#2563eb',
    letterSpacing: 0.45,
  },
  importContactsBtnTextMuted: {
    color: Theme.textMuted,
    fontWeight: '500',
  },
  importContactsHint: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    color: Theme.textMuted,
    marginTop: 6,
    marginLeft: 2,
    lineHeight: 16,
  },
  lookupHint: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    color: Theme.textSecondary,
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 17,
  },
  lookupLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  lookupLoadingText: {
    ...FinanceTxnTypography.dateLine,
    color: '#2563eb',
    fontWeight: '600',
  },
  inviteeCard: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  inviteeLabel: {
    ...FinanceTxnTypography.tripId,
    color: '#1d4ed8',
    marginBottom: 4,
  },
  inviteeName: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 12,
    marginBottom: 4,
  },
  inviteeHint: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    color: Theme.textSecondary,
    lineHeight: 17,
    marginBottom: 8,
  },
  offlineLink: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  offlineLinkText: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 10,
    fontWeight: '600',
    color: '#2563eb',
  },
});

const styles = driverRegistrationFormStyles;