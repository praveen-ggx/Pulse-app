/**
 * Add Client modal — mobile quick-add: organization name, contact person, phone.
 * When visible is true, presents as bottom-sheet popup (same style as Add Transaction); when visible is undefined, full-screen (e.g. route).
 * When searchInviteeByPhone and onSendInvitation are provided, phone is auto-fetched (debounced)
 * like Add Driver: match auto-fills contact person/phone and shows "Found on platform".
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickContactForNameAndPhone } from "@/lib/contactPicker";
import { validatePhone } from "@/lib/phoneValidation";
import { formatMobileNumber } from "@/lib/format";
import {
  PARTY_LOOKUP_ERROR_MESSAGE,
  classifyNullInviteeResult,
  sameOrgPartyMessage,
} from "@/features/connections/hooks/usePartyPhoneLookupState";
import {
  inviteeProfileIsDriver,
  inviteeSuggestedCompanyName,
} from "@/features/connections/services/connectionRequests.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import { partyAddModalChromeStyles } from "@/components/PartyAddModalChrome";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface AddClientFormData {
  organizationName: string;
  contactPerson: string;
  phone: string;
}

export interface ConnectionInviteeMatch {
  organization_id: string;
  full_name: string;
  phone: string;
  /** Invitee org display name (organizations.name). */
  organization_name?: string;
  /** Invitee profile company (profiles.company_name). */
  profile_company_name?: string | null;
  /** From `get_invitee_by_phone` (profiles.role, lowercase). */
  profile_role?: string;
}

interface AddClientModalProps {
  onClose: () => void;
  onComplete: (data: AddClientFormData) => void;
  /** When true, show as bottom-sheet popup (like Add Transaction). When undefined, full-screen (e.g. add-client route). */
  visible?: boolean;
  /**
   * Active workspace org. Used for the same-org membership probe that
   * disambiguates a null invitee lookup (and shown in dev for RLS debugging).
   */
  organizationId?: string | null;
  /** When set, shown at top of form and submit is disabled (e.g. no organization loaded). */
  noOrganizationMessage?: string | null;
  /** Called when user taps Refresh to retry loading organization. */
  onRefreshOrganization?: () => void;
  /** When provided, enables "Search by phone" to find an existing org and send connection invite. */
  searchInviteeByPhone?: (
    phone: string,
  ) => Promise<ConnectionInviteeMatch | null>;
  /** When provided and search found someone, "Send invitation" calls this with their org id. */
  onSendInvitation?: (toOrgId: string) => Promise<void>;
  /** "customer" (Customers tab) vs "client" (finance, indents) — success dialog copy. */
  successEntity?: "customer" | "client";
  initialOrganizationName?: string;
  initialContactPerson?: string;
  initialPhone?: string;
  /** Saved DCO / org clients — tap to reuse instead of creating another offline party. */
  existingParties?: Array<{ id: string; name: string; phone?: string | null }>;
  onSelectExistingParty?: (party: { id: string; name: string }) => void | Promise<void>;
  existingPartyBusyId?: string | null;
  /** When false, parent owns the success UI after create. */
  showSuccessOnComplete?: boolean;
  /** DCO Self only. User App / Finance still require both company and contact. */
  allowSinglePartyName?: boolean;
}

const MIN_PHONE_LENGTH_FOR_SEARCH = 8;
const PHONE_DEBOUNCE_MS = 400;

export function AddClientModal({
  onClose,
  onComplete,
  visible,
  organizationId,
  noOrganizationMessage,
  onRefreshOrganization,
  searchInviteeByPhone,
  onSendInvitation,
  successEntity = "client",
  initialOrganizationName = "",
  initialContactPerson = "",
  initialPhone = "",
  existingParties = [],
  onSelectExistingParty,
  existingPartyBusyId = null,
  showSuccessOnComplete = true,
  allowSinglePartyName = false,
}: AddClientModalProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [showCreateSuccess, setShowCreateSuccess] = useState(false);
  const [organizationName, setOrganizationName] = useState(initialOrganizationName);
  const [contactPerson, setContactPerson] = useState(initialContactPerson);
  const [phone, setPhone] = useState(initialPhone);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inviteeMatch, setInviteeMatch] =
    useState<ConnectionInviteeMatch | null>(null);
  const [phoneSearchLoading, setPhoneSearchLoading] = useState(false);
  const [searchedNoResult, setSearchedNoResult] = useState(false);
  /** Stays true for this phone after lookup found a driver (blocks offline add if user cleared the match via "add as offline" for org users only). */
  const [driverRegisteredAtPhone, setDriverRegisteredAtPhone] = useState(false);
  /**
   * Phone belongs to an ACTIVE member of this org. The invitee RPC hides them,
   * so a null result alone cannot be read as "no account" — see
   * classifyNullInviteeResult. Blocks the offline path entirely.
   */
  const [sameOrgMemberAtPhone, setSameOrgMemberAtPhone] = useState(false);
  /** Membership could not be determined; block submit and let the user retry. */
  const [lookupFailed, setLookupFailed] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const searchIdRef = useRef(0);
  const orgInputRef = useRef<TextInput>(null);
  const contactInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const { width: windowWidth } = useWindowDimensions();
  const inviteeIsDriver = inviteeProfileIsDriver(inviteeMatch?.profile_role);

  const handleImportFromContacts = async () => {
    setError(null);
    setImportLoading(true);
    try {
      const result = await pickContactForNameAndPhone();
      if (result.ok) {
        setContactPerson(result.contact.name);
        setPhone(result.contact.phone);
        setInviteeMatch(null);
        setSearchedNoResult(false);
        setDriverRegisteredAtPhone(false);
      } else if (
        result.reason === "no_phone" ||
        result.reason === "permission_denied" ||
        result.reason === "unavailable"
      ) {
        setError(
          result.message ??
            (result.reason === "permission_denied"
              ? t("contactAccessDenied")
              : t("couldNotLoadContact")),
        );
      }
      // cancelled: do nothing
    } finally {
      setImportLoading(false);
    }
  };

  const blockedByNoOrg = noOrganizationMessage != null;
  const phoneError = phone.trim() ? validatePhone(phone.trim()) : null;
  const hasOfflineName =
    organizationName.trim().length > 0 || contactPerson.trim().length > 0;
  const hasRequiredNames = allowSinglePartyName
    ? hasOfflineName
    : organizationName.trim().length > 0 && contactPerson.trim().length > 0;
  const canSubmit =
    !blockedByNoOrg &&
    !driverRegisteredAtPhone &&
    !sameOrgMemberAtPhone &&
    !lookupFailed &&
    hasRequiredNames &&
    phone.trim().length > 0 &&
    !phoneError &&
    !submitting;
  const hasInviteSearch = Boolean(searchInviteeByPhone && onSendInvitation);
  const useInvitePrimaryAction = Boolean(
    inviteeMatch && onSendInvitation,
  );
  const hidePrimaryActionForDriverMatch = Boolean(inviteeMatch && inviteeIsDriver);

  const existingPartyPicker =
    existingParties.length > 0 && onSelectExistingParty ? (
      <View style={styles.existingWrap}>
        <Text style={styles.existingTitle}>Your shippers</Text>
        <Text style={styles.existingHint}>
          Select a saved client, or add a new offline shipper below. You can
          fill GST and address later.
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.existingRow}
        >
          {existingParties.map((row) => (
            <TouchableOpacity
              key={row.id}
              style={styles.existingChip}
              onPress={() => void onSelectExistingParty({ id: row.id, name: row.name })}
              disabled={!!existingPartyBusyId}
              accessibilityRole="button"
              accessibilityLabel={`Use ${row.name}`}
            >
              {existingPartyBusyId === row.id ? (
                <ActivityIndicator size="small" color={Theme.primary} />
              ) : (
                <>
                  <Text style={styles.existingChipName} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={styles.existingChipMeta} numberOfLines={1}>
                    {row.phone?.trim() || "Offline"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    ) : null;

  // Reset form when modal opens so each open shows empty fields (not previous submission).
  useEffect(() => {
    if (visible === true) {
      setOrganizationName(initialOrganizationName);
      setContactPerson(initialContactPerson);
      setPhone(initialPhone);
      setError(null);
      setSubmitting(false);
      setInviteeMatch(null);
      setPhoneSearchLoading(false);
      setSearchedNoResult(false);
      setDriverRegisteredAtPhone(false);
      setSameOrgMemberAtPhone(false);
      setLookupFailed(false);
    }
  }, [visible]);

  // Debounced auto-fetch by phone (same pattern as Add Driver): single RPC, O(1) result; auto-fill contactPerson/phone when match found.
  useEffect(() => {
    if (!searchInviteeByPhone || !onSendInvitation) return;
    const normalized = phone.trim().replace(/\s+/g, "");
    setInviteeMatch(null);
    setSearchedNoResult(false);
    setDriverRegisteredAtPhone(false);
    setSameOrgMemberAtPhone(false);
    setLookupFailed(false);
    if (normalized.length < MIN_PHONE_LENGTH_FOR_SEARCH) {
      setPhoneSearchLoading(false);
      return;
    }
    const id = ++searchIdRef.current;
    setPhoneSearchLoading(true);
    const t = setTimeout(() => {
      searchInviteeByPhone(normalized).then(async (result) => {
        if (searchIdRef.current !== id) return;
        if (!result) {
          // Null is ambiguous: genuinely absent, or an active same-org member
          // the RPC hid. Resolve before offering the offline path.
          const status = organizationId
            ? await classifyNullInviteeResult(normalized, organizationId)
            : "not_found";
          // Phone changed (or workspace switched) while the probe was in flight.
          if (searchIdRef.current !== id) return;
          setPhoneSearchLoading(false);
          setSameOrgMemberAtPhone(status === "same_org");
          setLookupFailed(status === "error");
          setSearchedNoResult(status === "not_found");
          return;
        }
        setPhoneSearchLoading(false);
        setInviteeMatch(result);
        setSearchedNoResult(false);
        setDriverRegisteredAtPhone(
          inviteeProfileIsDriver(result.profile_role),
        );
        if (result) {
          setContactPerson((prev) => (prev.trim() ? prev : result.full_name));
          const suggested = inviteeSuggestedCompanyName(result);
          if (suggested) {
            setOrganizationName((prev) => (prev.trim() ? prev : suggested));
          }
          // Do not set phone from result to avoid effect re-run loop; lookup already used current phone.
        }
      });
    }, PHONE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [phone, searchInviteeByPhone, onSendInvitation, organizationId]);

  /** Clearing/editing phone after a lookup match should drop auto-filled contact + org (same as invalidating the search). */
  const handlePhoneChangeText = (text: string) => {
    const hadInviteeMatch = inviteeMatch != null;
    setPhone(formatMobileNumber(text));
    setInviteeMatch(null);
    setSearchedNoResult(false);
    setDriverRegisteredAtPhone(false);
    setSameOrgMemberAtPhone(false);
    setLookupFailed(false);
    if (hadInviteeMatch) {
      setContactPerson("");
      setOrganizationName("");
    }
  };

  const handleSendInvitation = async () => {
    if (!inviteeMatch || !onSendInvitation) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSendInvitation(inviteeMatch.organization_id);
      setSubmitting(false);
      onClose();
    } catch (err: unknown) {
      setSubmitting(false);
      setError(
        err instanceof Error ? err.message : "Failed to send invitation",
      );
    }
  };

  const handleAddAsOfflineInstead = () => {
    setInviteeMatch(null);
    setSearchedNoResult(false);
    setError(null);
    setDriverRegisteredAtPhone(false);
    // sameOrgMemberAtPhone / lookupFailed intentionally NOT cleared: this link
    // is never rendered in those states, and clearing them here would reopen
    // the offline path the guard exists to close.
  };

  const createSuccessTitle =
    successEntity === "customer"
      ? "Customer added successfully"
      : "Client added successfully";

  const handleCreateSuccessOk = () => {
    setShowCreateSuccess(false);
    onClose();
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (driverRegisteredAtPhone) {
      setError(t("errorDriverCannotAddAsClient"));
      return;
    }
    if (sameOrgMemberAtPhone) {
      setError(sameOrgPartyMessage("client"));
      return;
    }
    if (lookupFailed) {
      setError(PARTY_LOOKUP_ERROR_MESSAGE);
      return;
    }
    setError(null);
    setSubmitting(true);
    const orgName = organizationName.trim() || contactPerson.trim();
    const person = contactPerson.trim() || organizationName.trim();
    const result = onComplete({
      organizationName: orgName,
      contactPerson: person,
      phone: phone.trim(),
    });
    const p = result as void | Promise<unknown>;
    if (typeof p?.then === "function") {
      p.then(() => {
        setSubmitting(false);
        if (showSuccessOnComplete) setShowCreateSuccess(true);
        else onClose();
      }).catch((err: Error) => {
        setSubmitting(false);
        setError(err?.message ?? "Failed to add client");
      });
    } else {
      setSubmitting(false);
      if (showSuccessOnComplete) setShowCreateSuccess(true);
      else onClose();
    }
  };

  const useSingleColumnFields = windowWidth < 390;

  /** Popup: exact Ledger (Add Entry) layout — header row, field blocks, submit. */
  const ledgerFormContent = (
    <>
      <View style={styles.ledgerHeaderRow}>
        <Text style={styles.ledgerTitle}>ADD CLIENT</Text>
        <TouchableOpacity
          style={styles.ledgerCloseBtn}
          onPress={onClose}
          accessibilityLabel="Close"
        >
          <FontAwesome name="times" size={10} color={Theme.textPrimaryDark} />
        </TouchableOpacity>
      </View>
      {noOrganizationMessage ? (
        <View style={styles.ledgerNoOrgBanner}>
          <Text style={[styles.ledgerErrorText, { color: Theme.negative }]}>
            {noOrganizationMessage}
          </Text>
          {onRefreshOrganization ? (
            <TouchableOpacity
              style={styles.ledgerRefreshBtn}
              onPress={() => onRefreshOrganization()}
            >
              <Text style={styles.ledgerRefreshBtnText}>Refresh</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {existingPartyPicker}
      {/* First block: same layout as Ledger amount block (label on top, input row). Tappable so label/block focuses input. */}
      <Pressable
        style={styles.ledgerAmountBlock}
        onPress={() => phoneInputRef.current?.focus()}
      >
        <Text style={styles.ledgerAmountLabel}>PHONE</Text>
        <View style={styles.ledgerAmountRow}>
          <TextInput
            ref={phoneInputRef}
            style={styles.ledgerAmountInput}
            placeholder="+91 …"
            placeholderTextColor={Theme.textMutedDemo}
            value={phone}
            onChangeText={handlePhoneChangeText}
            keyboardType="phone-pad"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
        </View>
      </Pressable>
      {/* Two-col row: same as Ledger PARTY + LINK MSN. Tappable so label/block focuses input. */}
      <View style={styles.ledgerTwoCol}>
        <Pressable
          style={[styles.ledgerFieldBlock, styles.ledgerFieldBlockCol]}
          onPress={() => contactInputRef.current?.focus()}
        >
          <Text style={styles.ledgerFieldLabelCol}>CONTACT</Text>
          <TextInput
            ref={contactInputRef}
            style={styles.ledgerFieldInput}
            placeholder="Name"
            placeholderTextColor={Theme.textMutedDemo}
            value={contactPerson}
            onChangeText={setContactPerson}
            autoCapitalize="words"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
        </Pressable>
        <Pressable
          style={[styles.ledgerFieldBlock, styles.ledgerFieldBlockCol]}
          onPress={() => orgInputRef.current?.focus()}
        >
          <Text style={styles.ledgerFieldLabelCol}>ORGANIZATION *</Text>
          <TextInput
            ref={orgInputRef}
            style={styles.ledgerFieldInput}
            placeholder="Company or organization"
            placeholderTextColor={Theme.textMutedDemo}
            value={organizationName}
            onChangeText={setOrganizationName}
            autoCapitalize="words"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
        </Pressable>
      </View>
      {phoneError && (
        <Text style={[styles.ledgerErrorText, { color: Theme.negative }]}>
          {phoneError}
        </Text>
      )}
      <TouchableOpacity
        style={styles.importFromContactsRow}
        onPress={handleImportFromContacts}
        disabled={importLoading}
        activeOpacity={0.7}
      >
        {importLoading ? (
          <ActivityIndicator size="small" color={Theme.primary} />
        ) : (
          <FontAwesome name="address-book-o" size={14} color={Theme.primary} />
        )}
        <Text style={[styles.importFromContactsText, { color: Theme.primary }]}>
          {importLoading ? "Opening contacts…" : "Import from contacts"}
        </Text>
      </TouchableOpacity>
      {hasInviteSearch && phone.trim().length > 0 ? (
        <Text style={styles.ledgerPhoneHint}>
          Search by number to find someone on the platform and invite their
          organization.
        </Text>
      ) : null}
      {hasInviteSearch &&
      phone.trim().replace(/\s+/g, "").length >= MIN_PHONE_LENGTH_FOR_SEARCH &&
      phoneSearchLoading ? (
        <View style={styles.ledgerAutoFetchRow}>
          <ActivityIndicator size="small" color={Theme.primary} />
          <Text style={styles.ledgerAutoFetchText}>Looking up…</Text>
        </View>
      ) : null}
      {inviteeMatch ? (
        <View style={styles.ledgerInviteeCard}>
          <Text style={styles.ledgerInviteeLabel}>
            {inviteeIsDriver
              ? t("inviteeRegisteredDriver")
              : t("inviteeFoundOnPlatform")}
          </Text>
          <Text style={styles.ledgerInviteeName}>
            {inviteeMatch.full_name || inviteeMatch.phone}
          </Text>
          <Text style={styles.ledgerInviteeFooterHint}>
            {inviteeIsDriver
              ? t("addClientInviteeHintDriver")
              : t("addClientInviteeHintDefault")}
          </Text>
          {!inviteeIsDriver ? (
            <TouchableOpacity
              style={styles.ledgerAddOfflineLink}
              onPress={handleAddAsOfflineInstead}
              disabled={submitting}
            >
              <Text style={styles.ledgerAddOfflineLinkText}>
                Add as offline instead
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : sameOrgMemberAtPhone ? (
        <Text style={[styles.ledgerHintText, { color: Theme.negative }]}>
          {sameOrgPartyMessage("client")}
        </Text>
      ) : lookupFailed ? (
        <Text style={[styles.ledgerHintText, { color: Theme.negative }]}>
          {PARTY_LOOKUP_ERROR_MESSAGE}
        </Text>
      ) : searchedNoResult ? (
        <Text style={[styles.ledgerHintText, { color: Theme.textSecondary }]}>
          No account with this number. Add as offline below.
        </Text>
      ) : null}
      {error ? (
        <Text style={[styles.ledgerErrorText, { color: Theme.negative }]}>
          {error}
        </Text>
      ) : null}
      {!hidePrimaryActionForDriverMatch ? (
        <TouchableOpacity
          style={[
            styles.ledgerSubmitBtn,
            !canSubmit && styles.ledgerSubmitBtnDisabled,
          ]}
          onPress={useInvitePrimaryAction ? handleSendInvitation : handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.9}
        >
          <Text style={styles.ledgerSubmitBtnText}>
            {submitting
              ? useInvitePrimaryAction
                ? t("sending")
                : "Adding…"
              : useInvitePrimaryAction
                ? t("sendInvitation")
                : "ADD CLIENT"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  if (visible === false) return null;

  if (visible === true) {
    const windowHeight = Dimensions.get("window").height;
    const windowWidth = Dimensions.get("window").width;
    const shellMaxH = Math.min(
      windowHeight * Layout.ledgerPanelHeightRatio,
      Layout.ledgerPanelMaxHeight,
      windowHeight * 0.92,
    );
    const shellMaxW = Math.min(540, Math.max(280, windowWidth - 36));
    return (
      <>
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={onClose}
          presentationStyle="overFullScreen"
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "padding"}
            keyboardVerticalOffset={insets.top + 16}
          >
            <View style={partyAddModalChromeStyles.overlay}>
              <Pressable
                style={partyAddModalChromeStyles.overlayDismissHit}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              />
              <View
                style={[
                  partyAddModalChromeStyles.shell,
                  {
                    maxWidth: shellMaxW,
                    maxHeight: shellMaxH,
                  },
                ]}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={{ maxHeight: shellMaxH }}
                  contentContainerStyle={[
                    styles.ledgerPanelScrollContent,
                    {
                      paddingHorizontal: 24,
                      paddingTop: 24,
                      paddingBottom: insets.bottom + Layout.modalBottomPadding,
                    },
                  ]}
                >
                  {ledgerFormContent}
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
        <ThemedAlertModal
          visible={showCreateSuccess}
          title={createSuccessTitle}
          message=""
          okText="OK"
          onOk={handleCreateSuccessOk}
          onRequestClose={handleCreateSuccessOk}
          variant="neutral"
          okVariant="primary"
        />
      </>
    );
  }

  return (
    <>
    <KeyboardAvoidingView
      style={styles.screenRoot}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.screenRoot, { backgroundColor: Theme.surface }]}>
        <View style={[styles.screenHeader, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity
            style={styles.screenHeaderButton}
            onPress={onClose}
            accessibilityLabel="Go back"
            activeOpacity={0.8}
          >
            <FontAwesome
              name="chevron-left"
              size={16}
              color={Theme.textPrimaryDark}
            />
          </TouchableOpacity>
          <View style={styles.screenHeaderTitleWrap}>
            <Text style={styles.screenTitle}>Add Client</Text>
          </View>
        </View>
        <ScrollView
          style={styles.screenScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.screenScrollContent,
            { paddingBottom: insets.bottom + 140 },
          ]}
        >
          <View style={styles.screenSection}>
            <Text style={styles.screenSectionLabel}>CLIENT DETAILS</Text>

            {noOrganizationMessage ? (
              <View style={styles.screenStatusCard}>
                <Text style={[styles.screenStatusText, { color: Theme.negative }]}>
                  {noOrganizationMessage}
                </Text>
                {onRefreshOrganization ? (
                  <TouchableOpacity
                    style={styles.screenRefreshButton}
                    onPress={() => onRefreshOrganization()}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.screenRefreshButtonText}>Refresh</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {existingPartyPicker}

            <Pressable
              onPress={() => phoneInputRef.current?.focus()}
              style={styles.screenInputCard}
            >
              <Text style={styles.screenInputLabel}>
                Phone number <Text style={styles.screenRequiredMark}>*</Text>
              </Text>
              <TextInput
                ref={phoneInputRef}
                style={styles.screenInput}
                placeholder="+91 98765 43210"
                placeholderTextColor={Theme.textMutedDemo}
                value={phone}
                onChangeText={handlePhoneChangeText}
                keyboardType="phone-pad"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
            </Pressable>

            <View
              style={[
                styles.screenTwoCol,
                useSingleColumnFields && styles.screenTwoColStack,
              ]}
            >
              <Pressable
                onPress={() => contactInputRef.current?.focus()}
                style={styles.screenFieldCard}
              >
                <Text style={styles.screenInputLabel}>
                  Contact person name <Text style={styles.screenRequiredMark}>*</Text>
                </Text>
                <TextInput
                  ref={contactInputRef}
                  style={styles.screenInput}
                  placeholder={t("nameLabel")}
                  placeholderTextColor={Theme.textMutedDemo}
                  value={contactPerson}
                  onChangeText={setContactPerson}
                  autoCapitalize="words"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                />
              </Pressable>

              <Pressable
                onPress={() => orgInputRef.current?.focus()}
                style={styles.screenFieldCard}
              >
                <Text style={styles.screenInputLabel}>
                  {t("organizationName")}{" "}
                  <Text style={styles.screenRequiredMark}>*</Text>
                </Text>
                <TextInput
                  ref={orgInputRef}
                  style={styles.screenInput}
                  placeholder={t("company")}
                  placeholderTextColor={Theme.textMutedDemo}
                  value={organizationName}
                  onChangeText={setOrganizationName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                />
              </Pressable>
            </View>

            {phoneError && (
              <View style={styles.screenErrorCard}>
                <Text style={styles.screenErrorText}>{phoneError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.screenActionCard}
              onPress={handleImportFromContacts}
              disabled={importLoading}
              activeOpacity={0.8}
            >
              <View style={styles.screenActionIconWrap}>
                {importLoading ? (
                  <ActivityIndicator size="small" color={Theme.buttonMatteBlackText} />
                ) : (
                  <FontAwesome
                    name="address-book-o"
                    size={16}
                    color={Theme.buttonMatteBlackText}
                  />
                )}
              </View>
              <View style={styles.screenActionTextWrap}>
                <Text style={styles.screenActionTitle}>
                  {importLoading ? "Opening contacts..." : t("importFromContacts")}
                </Text>
                <Text style={styles.screenActionSubtitle}>
                  Fill contact name and phone from your address book.
                </Text>
              </View>
            </TouchableOpacity>

            {hasInviteSearch && phone.trim().length > 0 ? (
              <Text style={styles.screenHintText}>
                Search by this number to find a person on the platform and invite
                their organization.
              </Text>
            ) : null}

            {hasInviteSearch &&
            phone.trim().replace(/\s+/g, "").length >=
              MIN_PHONE_LENGTH_FOR_SEARCH &&
            phoneSearchLoading ? (
              <View style={styles.screenLookupCard}>
                <ActivityIndicator size="small" color={Theme.primary} />
                <Text style={styles.screenLookupText}>Looking up...</Text>
              </View>
            ) : null}

            {inviteeMatch ? (
              <View style={styles.screenInviteeCard}>
                <Text style={styles.screenInviteeLabel}>
                  {inviteeIsDriver
                    ? t("inviteeRegisteredDriver").toUpperCase()
                    : t("inviteeFoundOnPlatform").toUpperCase()}
                </Text>
                <Text style={styles.screenInviteeName}>
                  {inviteeMatch.full_name || inviteeMatch.phone}
                </Text>
                <Text style={styles.screenInviteeSubtext}>
                  {inviteeIsDriver
                    ? t("addClientInviteeHintDriver")
                    : t("addClientInviteeHintDefault")}
                </Text>
                {!inviteeIsDriver ? (
                  <TouchableOpacity
                    style={styles.screenAddOfflineLink}
                    onPress={handleAddAsOfflineInstead}
                    disabled={submitting}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.screenAddOfflineLinkText}>
                      Add as offline instead
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : sameOrgMemberAtPhone ? (
              <View style={styles.screenStatusCard}>
                <Text style={[styles.screenStatusText, { color: Theme.negative }]}>
                  {sameOrgPartyMessage("client")}
                </Text>
              </View>
            ) : lookupFailed ? (
              <View style={styles.screenStatusCard}>
                <Text style={[styles.screenStatusText, { color: Theme.negative }]}>
                  {PARTY_LOOKUP_ERROR_MESSAGE}
                </Text>
              </View>
            ) : searchedNoResult ? (
              <View style={styles.screenStatusCard}>
                <Text style={styles.screenStatusText}>
                  No account with this number. You can add this client as offline.
                </Text>
              </View>
            ) : null}

            {error ? (
              <View style={styles.screenErrorCard}>
                <Text style={styles.screenErrorText}>{error}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View
          style={[
            styles.screenFooter,
            { paddingBottom: insets.bottom + 12 },
          ]}
        >
          {!hidePrimaryActionForDriverMatch ? (
            <TouchableOpacity
              style={[
                styles.screenSubmitButton,
                (!canSubmit || submitting) && styles.screenButtonDisabled,
              ]}
              onPress={
                useInvitePrimaryAction ? handleSendInvitation : handleSubmit
              }
              disabled={!canSubmit || submitting}
              activeOpacity={0.9}
            >
              <Text style={styles.screenSubmitButtonText}>
                {submitting
                  ? useInvitePrimaryAction
                    ? t("sending")
                    : "Saving..."
                  : useInvitePrimaryAction
                    ? t("sendInvitation")
                    : "ADD CLIENT"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
    <ThemedAlertModal
      visible={showCreateSuccess}
      title={createSuccessTitle}
      message=""
      okText="OK"
      onOk={handleCreateSuccessOk}
      onRequestClose={handleCreateSuccessOk}
      variant="neutral"
      okVariant="primary"
    />
    </>
  );
}

const styles = StyleSheet.create({
  /* Ledger (Add Entry) field layout — used inside centered party-add shell */
  ledgerPanelScrollContent: {
    gap: 24,
    paddingBottom: 8,
  },
  ledgerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ledgerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 3,
  },
  ledgerCloseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerAmountBlock: {
    backgroundColor: Theme.surfaceLight,
    padding: 16,
  },
  ledgerAmountLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  ledgerAmountRow: { flexDirection: "row", alignItems: "center" },
  ledgerAmountInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  ledgerFieldBlock: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderInput,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  ledgerTwoCol: { flexDirection: "row", gap: 16 },
  ledgerFieldBlockCol: { flex: 1, minWidth: 0 },
  ledgerFieldLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginRight: 8,
  },
  ledgerFieldLabelCol: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginRight: 8,
  },
  ledgerFieldInput: {
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  ledgerSubmitBtn: {
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: Theme.buttonPrimary,
  },
  ledgerSubmitBtnDisabled: { opacity: 0.5 },
  ledgerSubmitBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 3,
  },
  ledgerNoOrgBanner: {
    padding: 12,
    backgroundColor: Theme.surfaceLight,
  },
  ledgerErrorText: { fontSize: 10, marginTop: 4 },
  ledgerRefreshBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Theme.buttonPrimary,
    alignSelf: "flex-start",
  },
  ledgerRefreshBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
  },
  importFromContactsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 4,
  },
  importFromContactsText: {
    fontSize: 13,
  },
  ledgerPhoneHint: {
    fontSize: 9,
    color: Theme.textMuted,
    marginTop: -4,
    marginBottom: 4,
  },
  ledgerAutoFetchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  ledgerAutoFetchText: {
    fontSize: 10,
    color: Theme.textSecondary,
  },
  ledgerInviteeCard: {
    padding: 12,
    marginBottom: 12,
    backgroundColor: Theme.surfaceLight,
  },
  ledgerInviteeLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  ledgerInviteeName: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  ledgerInviteeFooterHint: {
    fontSize: 9,
    color: Theme.textSecondary,
    marginBottom: 8,
    lineHeight: 13,
  },
  ledgerAddOfflineLink: {
    paddingVertical: 6,
    alignItems: "center",
  },
  ledgerAddOfflineLinkText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  ledgerHintText: { fontSize: 10, marginBottom: 8 },
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  iconBtn: {
    width: 44,
    height: 44,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  body: {
    flex: 1,
  },
  fieldRowWrap: {
    marginBottom: 20,
  },
  noOrgBanner: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: Theme.surfaceLight,
  },
  refreshBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 16,
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 44,
  },
  footer: {
    paddingTop: 16,
  },
  submitBtn: {
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  autoFetchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  autoFetchText: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
  searchBtn: {
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  searchBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inviteeCard: {
    padding: 16,
    marginBottom: 16,
    backgroundColor: Theme.surfaceLight,
  },
  inviteeLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  inviteeName: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 12,
  },
  inviteeActions: {
    gap: 8,
  },
  inviteBtn: {
    marginBottom: 0,
  },
  addOfflineLink: {
    paddingVertical: 8,
    alignItems: "center",
  },
  addOfflineLinkText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  hintText: {
    fontSize: 11,
    marginBottom: 12,
  },
  phoneLookupHint: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: -8,
    marginBottom: 8,
  },
  submitBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  screenRoot: {
    flex: 1,
  },
  screenScroll: {
    flex: 1,
  },
  screenScrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    gap: 12,
  },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  screenHeaderButton: {
    width: 40,
    height: 40,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  screenHeaderTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  screenTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  screenSection: {
    gap: 10,
  },
  screenSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 4,
  },
  screenInputCard: {
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 64,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  screenTwoCol: {
    flexDirection: "row",
    gap: 12,
  },
  screenTwoColStack: {
    flexDirection: "column",
  },
  screenFieldCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 88,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  screenInputLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  screenRequiredMark: {
    color: Theme.negative,
  },
  screenInput: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    minHeight: 28,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  screenActionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  screenActionIconWrap: {
    width: 38,
    height: 38,
    backgroundColor: Theme.buttonMatteBlack,
    alignItems: "center",
    justifyContent: "center",
  },
  screenActionTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  screenActionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  screenActionSubtitle: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  screenHintText: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 18,
    marginTop: -2,
  },
  screenLookupCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  screenLookupText: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  screenInviteeCard: {
    backgroundColor: Theme.screenBackground,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  screenInviteeLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  screenInviteeName: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  screenInviteeSubtext: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  screenAddOfflineLink: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  screenAddOfflineLinkText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
    textDecorationLine: "underline",
  },
  existingWrap: {
    marginBottom: 12,
    gap: 4,
  },
  existingTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  existingHint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  existingRow: {
    gap: 8,
    paddingVertical: 10,
    paddingRight: 8,
  },
  existingChip: {
    minWidth: 132,
    maxWidth: 180,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
  },
  existingChipName: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  existingChipMeta: {
    marginTop: 2,
    fontSize: 11,
    color: Theme.textMuted,
  },
  screenStatusCard: {
    backgroundColor: Theme.screenBackground,
    padding: 16,
    gap: 12,
  },
  screenStatusText: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 19,
  },
  screenRefreshButton: {
    alignSelf: "flex-start",
    minHeight: Layout.minTouchTargetSize,
    backgroundColor: Theme.buttonPrimary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "center",
  },
  screenRefreshButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  screenErrorCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.negative + "30",
    padding: 16,
  },
  screenErrorText: {
    fontSize: 13,
    color: Theme.negative,
    lineHeight: 19,
  },
  screenFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 4,
  },
  screenSubmitButton: {
    minHeight: Layout.minTouchTargetSize + 12,
    borderRadius: 16,
    backgroundColor: Theme.buttonMatteBlack,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: Theme.buttonMatteBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  screenSubmitButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonMatteBlackText,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  screenButtonDisabled: {
    opacity: 0.5,
  },
});
