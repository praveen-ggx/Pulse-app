/**
 * Invite team member modal: phone lookup → role selection → confirm.
 * Matches AddDriverModal / AddClientModal patterns.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { IndiaFlagIcon } from "@/components/party/IndiaFlagIcon";
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import { formatSignupPhoneDisplay } from "@/features/auth/signup/signUpKeypad.util";
import { formatMobileNumber } from "@/lib/format";
import { normalizeIndianPhoneForMetadata } from "@/lib/phoneValidation";
import {
  lookupUserByPhone,
  inviteTeamMemberByContact,
} from "@/features/organization/services/members.service";
import {
  precheckTeamInviteContact,
  precheckToProfile,
  type TeamInvitePrecheckResult,
} from "@/features/organization/services/teamInvitePrecheck.service";
import { platformRoleLabel } from "@/features/organization/utils/teamInviteRoles.util";
import { MemberAccessEditor } from "@/features/organization/components/MemberPermissionsPanel/MemberAccessEditor";
import {
  accessSnapshotFromRole,
  useMemberAccessDraft,
} from "@/features/organization/hooks/useMemberAccessDraft";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import { useOrgCapabilities } from "@/lib/useCapabilities";
import { shareInvite } from "@/features/organization/utils/inviteShare.util";
import type { UserProfileForInvite } from "@/types/organization";
import {
  Check,
  ChevronLeft,
  Search,
  Shield,
  User,
  UserPlus2,
  X,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type InviteMemberLayout = "modal" | "embedded";

const MIN_PHONE_LENGTH_FOR_LIVE_CHECK = 8;
const PHONE_LIVE_CHECK_DEBOUNCE_MS = 500;

const previewStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.positiveMuted,
    backgroundColor: "rgba(21,128,61,0.03)",
    marginBottom: 20,
  },
  cardNew: {
    borderColor: "rgba(217,119,6,0.35)",
    backgroundColor: "rgba(217,119,6,0.05)",
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
  sub: { fontSize: 12, color: Theme.textMuted, marginTop: 2 },
  foundBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Theme.positiveMuted,
  },
  foundBadgeNew: {
    backgroundColor: "rgba(217,119,6,0.12)",
  },
  foundBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.darkGreen,
  },
  foundBadgeTextNew: {
    color: Theme.warning,
  },
});

function UserPreviewCard({
  profile,
  isNewEmployee,
  fallbackName,
  fallbackPhone,
}: {
  profile: UserProfileForInvite | null;
  isNewEmployee: boolean;
  fallbackName: string;
  fallbackPhone: string;
}) {
  if (isNewEmployee) {
    return (
      <View style={[previewStyles.card, previewStyles.cardNew]}>
        <PartyAvatar
          name={fallbackName.toUpperCase()}
          entityType="client"
          size={48}
        />
        <View style={previewStyles.info}>
          <Text style={previewStyles.name} numberOfLines={1}>
            {fallbackName}
          </Text>
          <Text style={previewStyles.sub} numberOfLines={1}>
            {fallbackPhone}
          </Text>
          <Text style={previewStyles.sub}>
            No Pulse account yet — they will join when they sign up with this number.
          </Text>
        </View>
        <View style={[previewStyles.foundBadge, previewStyles.foundBadgeNew]}>
          <User size={11} color={Theme.warning} strokeWidth={2.4} />
          <Text style={[previewStyles.foundBadgeText, previewStyles.foundBadgeTextNew]}>
            New
          </Text>
        </View>
      </View>
    );
  }

  if (!profile) return null;
  const displayName = profile.full_name || profile.phone || profile.email || "Unknown";
  return (
    <View style={previewStyles.card}>
      <PartyAvatar
        name={displayName.toUpperCase()}
        avatarUrl={profile.avatar_url}
        entityType="client"
        size={48}
      />
      <View style={previewStyles.info}>
        <Text style={previewStyles.name} numberOfLines={1}>
          {displayName}
        </Text>
        {!!profile.phone && (
          <Text style={previewStyles.sub} numberOfLines={1}>
            {profile.phone}
          </Text>
        )}
        {!!profile.email && !profile.phone && (
          <Text style={previewStyles.sub} numberOfLines={1}>
            {profile.email}
          </Text>
        )}
      </View>
      <View style={previewStyles.foundBadge}>
        <Check size={11} color={Theme.darkGreen} strokeWidth={2.8} />
        <Text style={previewStyles.foundBadgeText}>On Pulse</Text>
      </View>
    </View>
  );
}

// ─── Main modal ────────────────────────────────────────────────────────────────

type Step = "phone" | "role";

export interface InviteMemberFlowProps {
  orgId: string;
  onClose: () => void;
  onInvited: () => void;
  layout?: InviteMemberLayout;
}

export function InviteMemberFlow({
  orgId,
  onClose,
  onInvited,
  layout = "modal",
}: InviteMemberFlowProps) {
  const embedded = layout === "embedded";
  const insets = useSafeAreaInsets();
  const ui = embedded ? embeddedFlow : modal;
  const [step, setStep] = useState<Step>("phone");
  const [employeeName, setEmployeeName] = useState("");
  const [phone, setPhone] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [foundProfile, setFoundProfile] = useState<UserProfileForInvite | null>(null);
  const [isNewEmployee, setIsNewEmployee] = useState(false);
  const orgCaps = useOrgCapabilities();
  const { isOwner } = useOrgRole();
  // Same draft + editor as Edit member, so invite and edit store identical access.
  const access = useMemberAccessDraft(accessSnapshotFromRole("tripops", orgCaps), orgCaps);
  const { reset: resetAccess } = access;
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successKind, setSuccessKind] = useState<"member" | "pending" | null>(null);
  const [shareStatus, setShareStatus] = useState<"copied" | "shared" | null>(null);
  const [precheck, setPrecheck] = useState<TeamInvitePrecheckResult | null>(null);
  const [liveCheck, setLiveCheck] = useState<TeamInvitePrecheckResult | null>(null);
  const [liveChecking, setLiveChecking] = useState(false);
  const liveCheckIdRef = useRef(0);
  // Live cross-org check as the phone is typed on step 1 — same RPC handleContinue
  // uses, just fired earlier so the admin sees the conflict before pressing Continue.
  useEffect(() => {
    if (step !== "phone") return;
    const trimmedPhone = phone.trim();
    setLiveCheck(null);
    if (trimmedPhone.replace(/\s+/g, "").length < MIN_PHONE_LENGTH_FOR_LIVE_CHECK) {
      setLiveChecking(false);
      return;
    }
    const id = ++liveCheckIdRef.current;
    setLiveChecking(true);
    const t = setTimeout(() => {
      precheckTeamInviteContact(orgId, trimmedPhone, employeeEmail.trim() || null).then(
        ({ error, result }) => {
          if (liveCheckIdRef.current !== id) return;
          setLiveChecking(false);
          if (!error) setLiveCheck(result);
        },
      );
    }, PHONE_LIVE_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [phone, employeeEmail, orgId, step]);

  const canonicalPhone = normalizeIndianPhoneForMetadata(phone);

  const handleContinue = async () => {
    const trimmedName = employeeName.trim();
    if (!trimmedName) {
      setSearchError("Enter the employee's name.");
      return;
    }
    if (!canonicalPhone) {
      setSearchError("Enter a 10-digit Indian mobile number.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setFoundProfile(null);
    setIsNewEmployee(false);
    setPrecheck(null);

    const [{ error, profile }, pre] = await Promise.all([
      lookupUserByPhone(canonicalPhone),
      precheckTeamInviteContact(orgId, canonicalPhone, employeeEmail.trim() || null),
    ]);
    setSearching(false);

    if (error) {
      setSearchError(error.message);
      return;
    }
    if (pre.error) {
      setSearchError(pre.error.message);
      return;
    }

    const check = pre.result;
    setPrecheck(check);

    if (check?.recommendedAction === "already_member") {
      setSearchError("This person is already an active member of your team.");
      return;
    }
    if (check?.recommendedAction === "already_invited") {
      setSearchError("An invitation has already been sent to this person.");
      return;
    }
    if (check?.recommendedAction === "belongs_to_other_org") {
      setSearchError(
        check.message ??
          "This person already belongs to another organization on Pulse and cannot be added here.",
      );
      return;
    }

    const profileFromPrecheck = check ? precheckToProfile(check) : null;
    if (profile) {
      setFoundProfile(profile);
      setIsNewEmployee(false);
    } else if (profileFromPrecheck) {
      setFoundProfile(profileFromPrecheck);
      setIsNewEmployee(false);
    } else if (check?.recommendedAction === "email_registered") {
      setSearchError(
        check.message ??
          "This email already has a Pulse account. Remove the email or ask them to sign in — do not use Awaiting Signup.",
      );
      return;
    } else {
      setIsNewEmployee(true);
    }
    // Start from the TripOps preset under the org's current operating model.
    resetAccess(accessSnapshotFromRole("tripops", orgCaps));
    setStep("role");
  };

  const handleInvite = async () => {
    const trimmedName = employeeName.trim();
    if (!trimmedName || !canonicalPhone) return;
    setSubmitting(true);
    setSubmitError(null);

    const result = await inviteTeamMemberByContact(orgId, {
      phone: canonicalPhone,
      name: trimmedName,
      email: employeeEmail.trim() || null,
      platformRole: access.platformRole,
      access: {
        surfaces: access.surfaces,
        isDepartmentManager: isOwner && access.isDepartmentManager,
        warehouseIds: access.warehouseIds,
      },
      existingUserId: foundProfile?.user_id ?? null,
    });

    setSubmitting(false);

    if (result.alreadyMember) {
      setSubmitError("This person is already an active member of your team.");
      return;
    }
    if (result.alreadyInvited) {
      setSubmitError("An invitation has already been sent to this person.");
      return;
    }
    if (result.precheckAction === "belongs_to_other_org") {
      setSubmitError(
        result.error?.message ??
          "This person already belongs to another organization on Pulse and cannot be added here.",
      );
      return;
    }
    if (result.precheckAction === "invite_existing_user" && result.kind === "member") {
      setSuccessKind("member");
      setSuccess(true);
      setTimeout(() => {
        onInvited();
      }, embedded ? 600 : 900);
      return;
    }
    if (result.error) {
      setSubmitError(result.error.message);
      return;
    }
    if (result.kind) {
      setSuccessKind(result.kind);
      setSuccess(true);
      // Pending invites show a "Share invite" button — give the admin time to
      // use it before the modal auto-closes and refetches the roster.
      const delay = result.kind === "pending" ? 8000 : embedded ? 600 : 900;
      setTimeout(() => {
        onInvited();
      }, delay);
    }
  };

  const goBack = () => {
    if (step === "role") {
      setStep("phone");
      setFoundProfile(null);
      setIsNewEmployee(false);
      setSubmitError(null);
    } else {
      onClose();
    }
  };

  const invitedLabel = isNewEmployee
    ? employeeName.trim() || phone.trim()
    : foundProfile?.full_name || foundProfile?.phone || employeeName.trim();

  const stepContent = (
    <>
      {success ? (
        <View style={ui.successWrap}>
          <View style={ui.successCircle}>
            <Check size={embedded ? 22 : 28} color={Theme.textOnPrimary} strokeWidth={2.8} />
          </View>
          <Text style={ui.successTitle}>
            {successKind === "pending" ? "Employee added" : "Invitation sent"}
          </Text>
          <Text style={ui.successSub}>
            {invitedLabel} has been added as{" "}
            <Text style={{ fontWeight: "700" }}>
              {platformRoleLabel(access.platformRole)}
            </Text>
            {successKind === "pending"
              ? ". They will join when they sign up with this phone (new account only)."
              : ". They sign in with their existing Pulse account to accept."}
          </Text>
          {successKind === "pending" && canonicalPhone && (
            <>
              <Pressable
                onPress={async () => {
                  const result = await shareInvite({
                    inviteePhone: canonicalPhone,
                    inviteeName: invitedLabel,
                    orgName: "your workspace",
                  });
                  if (result.ok) {
                    setShareStatus(result.method === "clipboard" ? "copied" : "shared");
                    setTimeout(() => setShareStatus(null), 2500);
                  }
                }}
                style={({ pressed }) => [
                  ui.secondaryBtn,
                  { marginTop: 12 },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={ui.secondaryBtnText}>Share invite</Text>
              </Pressable>
              {shareStatus === "copied" && (
                <Text style={[ui.successSub, { marginTop: 6, fontWeight: "600" }]}>
                  Invite message copied to clipboard
                </Text>
              )}
            </>
          )}
        </View>
      ) : step === "phone" ? (
        <>
          <View style={ui.sectionHeader}>
            <User size={16} color={Theme.textSecondary} strokeWidth={2} />
            <Text style={ui.sectionTitle}>Employee details</Text>
          </View>
          <Text style={ui.sectionDesc}>
            Add a team member by name and phone. If they do not have a Pulse account
            yet, they are saved as pending and join automatically when they sign up
            with this number.
          </Text>

          <View style={ui.inputWrap}>
            <TextInput
              style={ui.input}
              placeholder="Full name"
              placeholderTextColor={Theme.textMuted}
              value={employeeName}
              onChangeText={(v) => {
                setEmployeeName(v);
                setSearchError(null);
              }}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          <View style={ui.inputWrap}>
            <View style={phoneField.row}>
              <View style={phoneField.ccBlock} accessibilityLabel="India +91">
                <IndiaFlagIcon width={20} height={14} />
                <Text style={phoneField.ccText}>+91</Text>
              </View>
              <TextInput
                style={[ui.input, phoneField.digits]}
                placeholder="000 000 0000"
                placeholderTextColor={Theme.textMuted}
                value={formatSignupPhoneDisplay(phone)}
                onChangeText={(v) => {
                  setPhone(formatMobileNumber(v));
                  setSearchError(null);
                }}
                keyboardType="phone-pad"
                inputMode="tel"
                maxLength={12}
                textContentType="telephoneNumber"
                autoComplete="tel"
                returnKeyType="next"
              />
            </View>
          </View>
          {phone.length > 0 && phone.length < 10 ? (
            <Text style={phoneField.hint}>{phone.length}/10 digits</Text>
          ) : null}

          {liveChecking ? (
            <View style={ui.liveCheckRow}>
              <LoadingIndicator size="small" color={Theme.textMuted} />
              <Text style={ui.liveCheckText}>Checking this number…</Text>
            </View>
          ) : null}

          {!liveChecking && liveCheck?.recommendedAction === "already_member" ? (
            <View style={ui.conflictBannerInfo}>
              <Text style={ui.conflictBody}>
                {liveCheck.userName || "This person"} is already an active member of
                your team.
              </Text>
            </View>
          ) : null}

          {!liveChecking && liveCheck?.recommendedAction === "already_invited" ? (
            <View style={ui.conflictBannerInfo}>
              <Text style={ui.conflictBody}>
                An invitation has already been sent to{" "}
                {liveCheck.userName || "this number"}.
              </Text>
            </View>
          ) : null}

          {!liveChecking && liveCheck?.recommendedAction === "belongs_to_other_org" ? (
            <View style={ui.conflictBanner}>
              <Text style={ui.conflictTitle}>Already on Pulse</Text>
              <Text style={ui.conflictBody}>
                {liveCheck.userName || "This person"} already belongs to{" "}
                {liveCheck.otherOrgs.length > 1
                  ? `${liveCheck.otherOrgs.length} other workspaces`
                  : "another workspace"}{" "}
                on Pulse and cannot be added here.
              </Text>
            </View>
          ) : null}

          <View style={[ui.inputWrap, { marginBottom: 16 }]}>
            <TextInput
              style={ui.input}
              placeholder="Email (optional)"
              placeholderTextColor={Theme.textMuted}
              value={employeeEmail}
              onChangeText={setEmployeeEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />
          </View>

          {!!searchError && (
            <View style={ui.errorRow}>
              <X size={13} color={Theme.destructive} strokeWidth={2.5} />
              <Text style={ui.errorText}>{searchError}</Text>
            </View>
          )}

          <Pressable
            onPress={handleContinue}
            disabled={searching}
            style={({ pressed }) => [
              ui.primaryBtn,
              embedded && ui.primaryBtnEmbedded,
              pressed && { opacity: 0.85 },
            ]}
          >
            {searching ? (
              <LoadingIndicator size="small" color={Theme.textOnPrimary} />
            ) : (
              <>
                <Search size={16} color={Theme.textOnPrimary} strokeWidth={2.4} />
                <Text style={ui.primaryBtnText}>Continue</Text>
              </>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <UserPreviewCard
            profile={foundProfile}
            isNewEmployee={isNewEmployee}
            fallbackName={employeeName.trim()}
            fallbackPhone={
              canonicalPhone
                ? `+91 ${formatSignupPhoneDisplay(phone)}`
                : phone.trim()
            }
          />

          {precheck?.otherOrgs && precheck.otherOrgs.length > 0 ? (
            <View style={ui.conflictBanner}>
              <Text style={ui.conflictTitle}>Already on Pulse</Text>
              <Text style={ui.conflictBody}>
                This person is already active in{" "}
                {precheck.otherOrgs.length > 1
                  ? `${precheck.otherOrgs.length} other workspaces`
                  : "another workspace"}
                . They can join your workspace after signing in — no new account or
                duplicate signup.
              </Text>
            </View>
          ) : null}

          {!isNewEmployee && foundProfile ? (
            <View style={ui.conflictBannerInfo}>
              <Text style={ui.conflictBody}>
                Invitation will be sent to their existing Pulse account. They sign in to
                accept — not through new business signup.
              </Text>
            </View>
          ) : null}

          <View style={ui.sectionHeader}>
            <Shield size={16} color={Theme.textSecondary} strokeWidth={2} />
            <Text style={ui.sectionTitle}>Role & permissions</Text>
          </View>
          <Text style={[ui.sectionDesc, { marginBottom: 14 }]}>
            Same access controls as Edit member. Applied when the invite is
            accepted.
          </Text>

          <View style={{ marginBottom: 16 }}>
            <MemberAccessEditor
              draft={access}
              orgId={orgId}
              orgCaps={orgCaps}
              canEditRole
              canEditSurfaces
              canAssignManager={isOwner}
              busy={submitting}
              onError={setSubmitError}
            />
          </View>

          {!!submitError && (
            <View style={ui.errorRow}>
              <X size={13} color={Theme.destructive} strokeWidth={2.5} />
              <Text style={ui.errorText}>{submitError}</Text>
            </View>
          )}

          <Pressable
            onPress={handleInvite}
            disabled={submitting}
            style={({ pressed }) => [
              ui.primaryBtn,
              embedded && ui.primaryBtnEmbedded,
              { marginTop: 4 },
              pressed && { opacity: 0.85 },
            ]}
          >
            {submitting ? (
              <LoadingIndicator size="small" color={Theme.textOnPrimary} />
            ) : (
              <>
                <UserPlus2 size={16} color={Theme.textOnPrimary} strokeWidth={2.4} />
                <Text style={ui.primaryBtnText}>Send invitation</Text>
              </>
            )}
          </Pressable>
        </>
      )}
    </>
  );

  if (embedded) {
    return (
      <View style={embeddedFlow.root}>
        <View style={embeddedFlow.stepRow}>
          {(["phone", "role"] as const).map((s, i) => {
            const done = (step === "role" && s === "phone") || success;
            const active = step === s;
            return (
              <React.Fragment key={s}>
                <View
                  style={[
                    embeddedFlow.stepDot,
                    active && embeddedFlow.stepDotActive,
                    done && embeddedFlow.stepDotDone,
                  ]}
                >
                  {done ? (
                    <Check size={10} color={Theme.textOnPrimary} strokeWidth={3} />
                  ) : (
                    <Text
                      style={[embeddedFlow.stepNum, active && embeddedFlow.stepNumActive]}
                    >
                      {i + 1}
                    </Text>
                  )}
                </View>
                {i < 1 ? (
                  <View
                    style={[
                      embeddedFlow.stepLine,
                      (active || done) && { backgroundColor: METRONIC.link },
                    ]}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </View>

        {step === "role" && !success ? (
          <Pressable
            onPress={goBack}
            style={embeddedFlow.backLink}
            accessibilityRole="button"
            accessibilityLabel="Back to phone search"
          >
            <ChevronLeft size={14} color={METRONIC.link} strokeWidth={2.4} />
            <Text style={embeddedFlow.backLinkText}>Back to phone search</Text>
          </Pressable>
        ) : null}

        <ScrollView
          style={embeddedFlow.scroll}
          contentContainerStyle={embeddedFlow.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {stepContent}
        </ScrollView>
      </View>
    );
  }

  return (
    <SafeAreaView style={[modal.safe, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={modal.header}>
        <Pressable onPress={goBack} style={modal.backBtn} hitSlop={8}>
          <ChevronLeft size={22} color={Theme.textPrimaryDark} strokeWidth={2.5} />
        </Pressable>
        <View style={modal.headerCenter}>
          <Text style={modal.headerTitle}>
            {step === "phone" ? "Invite Team Member" : "Role & Permissions"}
          </Text>
          <Text style={modal.headerSub}>
            {step === "phone"
              ? "Name and phone — account optional"
              : "Choose platform role and review access"}
          </Text>
        </View>
        <Pressable onPress={onClose} style={modal.closeBtn} hitSlop={8}>
          <X size={20} color={Theme.textSecondary} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Step indicator */}
      <View style={modal.stepRow}>
        {(["phone", "role"] as const).map((s, i) => {
          const done = (step === "role" && s === "phone") || success;
          const active = step === s;
          return (
            <React.Fragment key={s}>
              <View style={[modal.stepDot, active && modal.stepDotActive, done && modal.stepDotDone]}>
                {done ? (
                  <Check size={10} color={Theme.textOnPrimary} strokeWidth={3} />
                ) : (
                  <Text style={[modal.stepNum, active && modal.stepNumActive]}>
                    {i + 1}
                  </Text>
                )}
              </View>
              {i < 1 && (
                <View style={[modal.stepLine, (active || done) && { backgroundColor: Theme.primary }]} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={modal.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {stepContent}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function InviteMemberModal(props: InviteMemberFlowProps) {
  return <InviteMemberFlow {...props} layout="modal" />;
}

const phoneField = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    minWidth: 0,
    minHeight: 22,
  },
  ccBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 12,
    marginRight: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
    flexShrink: 0,
  },
  ccText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  digits: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    letterSpacing: 0.4,
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
      default: {},
    }),
  },
  hint: {
    marginTop: -6,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});

const embeddedFlow = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 320,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingBottom: 20,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 14,
    gap: 0,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F5F8FA",
    borderWidth: 2,
    borderColor: METRONIC.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: METRONIC.link,
    borderColor: METRONIC.link,
  },
  stepDotDone: {
    backgroundColor: METRONIC.heroRing,
    borderColor: METRONIC.heroRing,
  },
  stepNum: {
    fontSize: 10,
    fontWeight: "700",
    color: METRONIC.muted,
  },
  stepNumActive: {
    color: Theme.textOnPrimary,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: METRONIC.border,
    marginHorizontal: 4,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  backLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.link,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: 0.1,
  },
  sectionDesc: {
    fontSize: 12,
    color: METRONIC.muted,
    lineHeight: 17,
    marginBottom: 14,
  },
  inputWrap: {
    borderWidth: 1,
    borderColor: METRONIC.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Theme.cardWhite,
    marginBottom: 12,
  },
  input: {
    fontSize: 15,
    color: METRONIC.text,
    fontWeight: "500",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginBottom: 14,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "rgba(232,33,39,0.06)",
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: Theme.destructive,
    lineHeight: 17,
  },
  liveCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  liveCheckText: {
    fontSize: 12,
    color: METRONIC.muted,
  },
  conflictBanner: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.warningMuted,
    backgroundColor: Theme.warningMuted,
    gap: 4,
  },
  conflictBannerInfo: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  conflictTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.warning,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  conflictBody: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 17,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: "flex-start",
    minWidth: 140,
    backgroundColor: METRONIC.accent,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  primaryBtnEmbedded: {
    alignSelf: "stretch",
    width: "100%",
    minWidth: 0,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: "center",
    minWidth: 140,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  successWrap: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 10,
  },
  successCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: METRONIC.heroRing,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: METRONIC.text,
  },
  successSub: {
    fontSize: 13,
    color: METRONIC.muted,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 320,
  },
});

const modal = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  headerSub: { fontSize: 11, color: Theme.textMuted, marginTop: 1 },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },

  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 0,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 2,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.primary,
  },
  stepDotDone: {
    backgroundColor: Theme.darkGreen,
    borderColor: Theme.darkGreen,
  },
  stepNum: { fontSize: 11, fontWeight: "700", color: Theme.textSecondary },
  stepNumActive: { color: Theme.textOnPrimary },
  stepLine: {
    width: 48,
    height: 2,
    backgroundColor: Theme.borderMedium,
    marginHorizontal: 4,
  },

  body: { padding: 20, paddingBottom: 40 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
  },
  sectionDesc: {
    fontSize: 13,
    color: Theme.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },

  inputWrap: {
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Theme.surface,
    marginBottom: 12,
  },
  input: {
    fontSize: 16,
    color: Theme.textPrimaryDark,
    fontWeight: "500",
  },

  errorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(232,33,39,0.06)",
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: Theme.destructive,
    lineHeight: 18,
  },
  liveCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  liveCheckText: {
    fontSize: 13,
    color: Theme.textMuted,
  },
  conflictBanner: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.warningMuted,
    backgroundColor: Theme.warningMuted,
    gap: 4,
  },
  conflictBannerInfo: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  conflictTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.warning,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  conflictBody: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 18,
  },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    marginTop: 4,
  },
  primaryBtnEmbedded: {},
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.1,
  },

  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimary,
  },

  successWrap: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  successCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Theme.darkGreen,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  successSub: {
    fontSize: 14,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
});
