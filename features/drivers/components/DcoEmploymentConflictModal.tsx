/**
 * Shown as soon as a DCO session is active and an employer link is still open.
 * Marketplace stays locked until that connection is unlinked.
 */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Check } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalDriverInviteModal } from "@/contexts/DriverInviteModalContext";
import { resolveDriverOrgAvatarUri } from "@/features/drivers/utils/resolveDriverOrgAvatar.util";
import * as driversService from "@/features/drivers/services/drivers.service";
import { fetchOrgBrandingByIds, type OrgBrandingRow } from "@/lib/orgBrandingFetch";
import { useDriverOperatingModeQuery } from "@/lib/queries/useDriverOperatingModeQuery";
import { queryKeys } from "@/lib/queryKeys";

type EmployerLink = { orgId: string; orgName: string; since: string };

function employmentDuration(from: string): string {
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date();
  const totalMonths =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (totalMonths < 1) return "Less than a month";
  if (totalMonths < 12) return `${totalMonths} month${totalMonths === 1 ? "" : "s"}`;
  const years = Math.floor(totalMonths / 12);
  const rem = totalMonths % 12;
  return rem > 0 ? `${years}y ${rem}m` : `${years} year${years === 1 ? "" : "s"}`;
}

function activeEmployerLinks(
  drivers: driversService.DriverRow[] | null | undefined,
): EmployerLink[] {
  const byOrg = new Map<string, EmployerLink>();
  for (const row of drivers ?? []) {
    if (row.left_at || row.tracking_only === true) continue;
    if (String(row.relationship_origin ?? "").trim().toLowerCase() === "market_award") continue;
    if (row.relationship_status !== "active_employee") continue;
    const orgId = String(row.organization_id ?? "").trim();
    if (!orgId || byOrg.has(orgId)) continue;
    byOrg.set(orgId, {
      orgId,
      orgName: row.organizations?.name?.trim() || "your fleet",
      since: row.created_at ?? "",
    });
  }
  return Array.from(byOrg.values());
}

function UnlinkConfirmed() {
  const ring = useRef(new Animated.Value(0)).current;
  const mark = useRef(new Animated.Value(0)).current;
  const copy = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(ring, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
      Animated.timing(mark, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(copy, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [copy, mark, ring]);

  return (
    <View style={styles.successCard}>
      <Animated.View
        style={[
          styles.successRing,
          {
            opacity: ring,
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }],
          },
        ]}
      >
        <Animated.View style={{ opacity: mark, transform: [{ scale: mark }] }}>
          <Check size={28} color={Theme.driverEmerald} strokeWidth={2.6} />
        </Animated.View>
      </Animated.View>
      <Animated.View style={{ opacity: copy, alignItems: "center", gap: 6 }}>
        <Text style={styles.title}>Unlinked</Text>
        <Text style={styles.message}>You can continue as a DCO.</Text>
      </Animated.View>
    </View>
  );
}

export function DcoEmploymentConflictModal() {
  const { profile } = useAuth();
  const { operatingMode, modeLoading } = useDriverOperatingModeQuery(profile?.uid);
  const queryClient = useQueryClient();
  const bumpFleetConnection = useOptionalDriverInviteModal()?.bumpFleetConnectionRevision;
  const conflict = !modeLoading && operatingMode.mode === "DCO_EMPLOYMENT_CONFLICT";
  const [employers, setEmployers] = useState<EmployerLink[]>([]);
  const [brandingById, setBrandingById] = useState<Record<string, OrgBrandingRow>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!confirmed) return;
    const timer = setTimeout(() => setConfirmed(false), 1700);
    return () => clearTimeout(timer);
  }, [confirmed]);

  useEffect(() => {
    if (!conflict || !profile?.uid) {
      setEmployers([]);
      setBrandingById({});
      return;
    }
    let cancelled = false;
    void driversService.getLinkedDriversForCurrentUser(profile.uid).then(async (res) => {
      if (cancelled) return;
      const links = activeEmployerLinks(res.drivers);
      setEmployers(links);
      const branding = await fetchOrgBrandingByIds(links.map((link) => link.orgId));
      if (!cancelled) setBrandingById(branding);
    });
    return () => {
      cancelled = true;
    };
  }, [conflict, profile?.uid]);

  const unlink = async () => {
    if (busy || employers.length === 0) return;
    setBusy(true);
    setError(null);
    for (const employer of employers) {
      const { error: leaveError } = await driversService.leaveFleet(employer.orgId);
      if (leaveError) {
        setError(leaveError.message);
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setConfirmed(true);
    bumpFleetConnection?.();
    if (profile?.uid) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.driverApp.driverOperatingMode(profile.uid),
      });
    }
  };

  if (!conflict && !confirmed) return null;

  const primary = employers[0];
  const extra = employers.slice(1);
  const primaryName = primary?.orgName ?? "your fleet";
  const duration = primary?.since ? employmentDuration(primary.since) : "";
  const avatarUri = primary
    ? resolveDriverOrgAvatarUri({
        orgId: primary.orgId,
        orgName: primary.orgName,
        branding: brandingById[primary.orgId],
      })
    : "";

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (confirmed) setConfirmed(false);
      }}
    >
      <View style={styles.overlay}>
        {confirmed ? (
          <UnlinkConfirmed />
        ) : (
        <View style={styles.card}>
          <LinearGradient
            colors={[Theme.driverEmeraldDark, Theme.driverEmerald]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.kicker}>DCO approved</Text>
            <View style={styles.avatarRing}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" />
              ) : (
                <View style={styles.avatar} />
              )}
            </View>
            <Text style={styles.fleetName} numberOfLines={1}>
              {primaryName}
            </Text>
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                Employee driver{duration ? ` · ${duration}` : ""}
              </Text>
            </View>
          </LinearGradient>

          <View style={styles.body}>
            <Text style={styles.title}>Your DCO request has been approved</Text>
            <Text style={styles.message}>
              Unlink {primaryName} first to continue as a DCO.
            </Text>
            {extra.length > 0 ? (
              <View style={styles.extraList}>
                {extra.map((employer) => {
                  const uri = resolveDriverOrgAvatarUri({
                    orgId: employer.orgId,
                    orgName: employer.orgName,
                    branding: brandingById[employer.orgId],
                  });
                  return (
                    <View key={employer.orgId} style={styles.extraRow}>
                      <Image source={{ uri }} style={styles.extraAvatar} resizeMode="cover" />
                      <Text style={styles.extraName} numberOfLines={1}>
                        {employer.orgName}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={[styles.button, (busy || employers.length === 0) && styles.buttonDisabled]}
              onPress={() => void unlink()}
              disabled={busy || employers.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Unlink fleet and continue"
            >
              {busy ? (
                <ActivityIndicator color={Theme.textOnPrimary} />
              ) : (
                <Text style={styles.buttonText}>Unlink first</Text>
              )}
            </Pressable>
          </View>
        </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Theme.cardWhite,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  hero: {
    alignItems: "center",
    paddingTop: 22,
    paddingBottom: 22,
    paddingHorizontal: 20,
  },
  kicker: {
    color: "rgba(236,253,245,0.86)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 28,
    padding: 3,
    backgroundColor: "rgba(255,255,255,0.92)",
    shadowColor: "#022c22",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 25,
    backgroundColor: Theme.cardWhite,
  },
  fleetName: {
    marginTop: 14,
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  pill: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  pillText: {
    color: "#ecfdf5",
    fontSize: 12,
    fontWeight: "700",
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    color: Theme.textRouteCard,
    textAlign: "center",
  },
  extraList: {
    gap: 8,
    marginTop: 2,
  },
  extraRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
  },
  extraAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
  },
  extraName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  error: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.negative,
    textAlign: "center",
  },
  button: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.negative,
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: Theme.textOnPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  successCard: {
    width: "100%",
    maxWidth: 300,
    backgroundColor: Theme.cardWhite,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: "center",
    gap: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  successRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(4,120,87,0.10)",
    borderWidth: 1.5,
    borderColor: "rgba(4,120,87,0.28)",
  },
});
