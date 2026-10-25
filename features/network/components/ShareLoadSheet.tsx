/**
 * ShareLoadSheet — broadcast an indent to the Pulse story reel (24h).
 * Preview card mirrors Load Center hub indent card (PICKUP/DROP + chips + offer).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import {
  type IndentRow,
  getIndentDisplayNumber,
  resolveSupplierTargetDisplayRate,
} from "@/features/indents";
import { MarketplaceRouteGrid } from "@/features/network/components/MarketplaceLoadCardChrome";
import { ensureIndentStory } from "@/features/network/services/indentStoryPosts.service";
import { indentDisplayOriginDest } from "@/features/network/utils/executionPlanRouteSummary";
import { useExecutionPlanRouteSummaries } from "@/features/network/hooks/useExecutionPlanRouteSummaries";
import { formatStoryDate } from "@/features/network/utils/storyDisplay";
import { formatINR } from "@/lib/format";
import { buildPulseStoryPublicUrl } from "@/lib/routes";
import { platformShadow } from "@/lib/platformShadow";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import * as Sharing from "expo-sharing";
import {
  CheckCircle2,
  Clock,
  Copy,
  TrendingUp,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const IS_WEB = Platform.OS === "web";
const SHEET_MAX_WIDTH = 440;
const INK = Theme.textPrimaryDark;
const MUTED = Theme.textMuted;
const BORDER = Theme.borderLight;
const CARD_EDGE = Theme.borderMedium;

function formatWeightChip(weightKg: number | null | undefined): string | null {
  const kg = Number(weightKg);
  if (!Number.isFinite(kg) || kg <= 0) return null;
  const tonnes = kg / 1000;
  if (tonnes >= 0.1) {
    const rounded = Math.round(tonnes * 10) / 10;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded} t`;
  }
  return `${Math.round(kg)} kg`;
}

function LoadPreviewCard({
  indent,
  statusChipText = "STORY",
}: {
  indent: IndentRow;
  statusChipText?: string;
}) {
  const planId =
    typeof indent.execution_plan_id === "string"
      ? indent.execution_plan_id.trim()
      : "";
  const { data: planRouteById } = useExecutionPlanRouteSummaries(
    indent.organization_id,
    planId ? [planId] : [],
  );
  const route = indentDisplayOriginDest(indent, planRouteById);
  const displayRate =
    resolveSupplierTargetDisplayRate(indent.supplier_target, indent.client_price) ??
    indent.client_price;

  const loadDateLabel = indent.pickup_date
    ? formatStoryDate(indent.pickup_date)
    : null;

  const specChips = useMemo(() => {
    const chips: string[] = [];
    const vehicle = (indent.vehicle_type ?? "").trim();
    if (vehicle) chips.push(vehicle);
    const weight = formatWeightChip(indent.weight);
    if (weight) chips.push(weight);
    const loadType = (indent.load_type ?? "").trim();
    if (loadType) chips.push(loadType);
    return chips;
  }, [indent.vehicle_type, indent.weight, indent.load_type]);

  const indentId = getIndentDisplayNumber(indent);

  return (
    <View style={styles.previewCard}>
      <View style={styles.cardTop}>
        <View style={styles.cardTopIcon}>
          <Zap size={14} color={Theme.textOnPrimary} fill={Theme.textOnPrimary} />
        </View>
        <View style={styles.cardTopText}>
          <Text style={styles.cardTopTitle} numberOfLines={1}>
            Broadcast load
          </Text>
          <Text style={styles.cardTopMeta} numberOfLines={1}>
            {indentId} · Pulse network
          </Text>
        </View>
        <View style={styles.statusChip}>
          <Text style={styles.statusChipText}>{statusChipText}</Text>
        </View>
      </View>

      <MarketplaceRouteGrid
        pickup={route.origin}
        drop={route.dest}
        pickupLabel="PICKUP"
        dropLabel="DROP"
      />

      {specChips.length > 0 || loadDateLabel ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          style={styles.specScroll}
          contentContainerStyle={styles.specRow}
        >
          {specChips.map((chip) => (
            <View key={chip} style={styles.specChip}>
              <Text style={styles.specChipText} numberOfLines={1}>
                {chip}
              </Text>
            </View>
          ))}
          {loadDateLabel ? (
            <View style={[styles.specChip, styles.specChipDate]}>
              <Text style={styles.specChipDateText} numberOfLines={1}>
                {loadDateLabel}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      <View style={styles.priceRow}>
        <View style={styles.priceCol}>
          <Text style={styles.priceHint}>OFFER</Text>
          <Text style={styles.priceValue} numberOfLines={1}>
            {displayRate ? formatINR(Number(displayRate)) : "—"}
          </Text>
        </View>
        <View style={styles.expiryInline}>
          <Clock size={11} color={Theme.brandBlueInk} strokeWidth={2.4} />
          <Text style={styles.expiryInlineText}>24h story</Text>
        </View>
      </View>
    </View>
  );
}

function SuccessView({
  indent,
  orgId,
  postId,
  onShareWhatsApp,
  onBoostReach,
  onDone,
}: {
  indent: IndentRow;
  orgId: string;
  postId: string;
  onShareWhatsApp: () => void;
  onBoostReach?: () => void;
  onDone: () => void;
}) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale]);

  const storyUrl = buildPulseStoryPublicUrl(postId, orgId, "LOAD");
  const hasWebBase =
    (process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "") || "") !==
    "";

  const handleCopyLink = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(storyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [storyUrl]);

  return (
    <Animated.View
      style={[styles.successView, { opacity, transform: [{ scale }] }]}
    >
      <LoadPreviewCard indent={indent} statusChipText="LIVE" />

      <View style={styles.successHero}>
        <View style={styles.successIcon}>
          <CheckCircle2 size={28} color={Theme.darkGreen} strokeWidth={2.2} />
        </View>
        <Text style={styles.successTitle}>Story live</Text>
        <Text style={styles.successSub}>
          Partners in your network can bid and message until it expires. Boost
          with Pulse Boost to amplify visibility.
        </Text>
      </View>

      {onBoostReach ? (
        <Pressable
          style={({ pressed }) => [
            styles.boostBtn,
            pressed && styles.boostBtnPressed,
          ]}
          onPress={onBoostReach}
          accessibilityRole="button"
          accessibilityLabel="Boost with Pulse Boost"
        >
          <TrendingUp size={16} color={Theme.accentBrown} strokeWidth={2.4} />
          <Text style={styles.boostBtnText}>Boost with Pulse Boost</Text>
        </Pressable>
      ) : null}

      {!hasWebBase ? (
        <View style={styles.devHintBanner}>
          <Text style={styles.devHintText}>
            Set EXPO_PUBLIC_WEB_BASE_URL for a public https link when sharing
            outside the app.
          </Text>
        </View>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.waBtn, pressed && styles.waBtnPressed]}
        onPress={onShareWhatsApp}
        accessibilityRole="button"
        accessibilityLabel="Share story bidding link on WhatsApp"
      >
        <FontAwesome name="whatsapp" size={18} color={Theme.textOnPrimary} />
        <Text style={styles.waBtnText}>Share link on WhatsApp</Text>
      </Pressable>
      <Text style={styles.waHint}>
        Opens WhatsApp with your bidding page link — paste to Status or send to
        a chat.
      </Text>

      <View style={styles.linkCard}>
        <Text style={styles.linkCardLabel}>Bidding page</Text>
        <Text style={styles.linkPreview} numberOfLines={2} selectable>
          {storyUrl}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.copyBtn,
            pressed && styles.copyBtnPressed,
          ]}
          onPress={handleCopyLink}
          accessibilityRole="button"
          accessibilityLabel="Copy bidding link"
        >
          <Copy size={13} color={Theme.brandBlueInk} strokeWidth={2.2} />
          <Text style={styles.copyBtnText}>
            {copied ? "Copied" : "Copy link"}
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.doneBtn,
          pressed && styles.doneBtnPressed,
        ]}
        onPress={onDone}
        accessibilityRole="button"
        accessibilityLabel="Done"
      >
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>
    </Animated.View>
  );
}

interface ShareLoadSheetProps {
  visible: boolean;
  indent: IndentRow | null;
  orgId: string;
  onClose: () => void;
  onSuccess?: (type: "feed" | "story") => void;
  /** After story broadcast — open Pulse Boost boost for this post. */
  onBoostAfterBroadcast?: (postId: string) => void;
}

export function ShareLoadSheet({
  visible,
  indent,
  orgId,
  onClose,
  onSuccess,
  onBoostAfterBroadcast,
}: ShareLoadSheetProps) {
  const insets = useSafeAreaInsets();
  const { status: authStatus } = useAuth();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successPostId, setSuccessPostId] = useState<string | null>(null);
  const translateY = useRef(new Animated.Value(IS_WEB ? 0 : 500)).current;
  const sheetOpacity = useRef(new Animated.Value(IS_WEB ? 0 : 1)).current;

  useEffect(() => {
    if (visible) {
      setNote("");
      setError(null);
      setSuccess(false);
      setSuccessPostId(null);
      setLoading(false);
      if (IS_WEB) {
        Animated.timing(sheetOpacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      } else {
        Animated.spring(translateY, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }).start();
      }
    } else if (IS_WEB) {
      sheetOpacity.setValue(0);
    } else {
      Animated.timing(translateY, {
        toValue: 500,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, sheetOpacity, translateY]);

  const shareStoryLinkOnWhatsApp = useCallback(async () => {
    if (!indent || !successPostId) return;
    const storyUrl = buildPulseStoryPublicUrl(successPostId, orgId, "LOAD");
    const routeLabel = `${(indent.pickup_area || "—").toUpperCase()} → ${(indent.drop_location || "—").toUpperCase()}`;
    const message = `Load broadcast · ${routeLabel}\n\nView & bid:\n${storyUrl}`;
    const encoded = encodeURIComponent(message);
    const waWeb = `https://wa.me/?text=${encoded}`;
    const waNative = `whatsapp://send?text=${encoded}`;
    try {
      if (Platform.OS === "web") {
        await Linking.openURL(waWeb);
        return;
      }
      const canNative = await Linking.canOpenURL(waNative);
      await Linking.openURL(canNative ? waNative : waWeb);
    } catch {
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(storyUrl, { dialogTitle: message });
        }
      } catch {
        // ignore
      }
    }
  }, [indent, successPostId, orgId]);

  const handleBroadcast = async () => {
    if (!indent || loading || authStatus === "restoring") return;
    setLoading(true);
    setError(null);

    const { error: err, postId: newPostId } = await ensureIndentStory(
      orgId,
      indent,
      {
        content: note.trim() || undefined,
        reboost: true,
      },
    );

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }
    if (!newPostId) {
      setError("Story posted but could not build share link. Try again.");
      return;
    }

    setSuccessPostId(newPostId);
    setSuccess(true);
    onSuccess?.("story");
  };

  if (!indent) return null;

  const sheetBody = (
    <>
      {!IS_WEB ? <View style={styles.handle} /> : null}

      <View style={styles.header}>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>Broadcast load</Text>
          <Text style={styles.headerSub}>
            Share this load to your Pulse story reel
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={16} color={Theme.textMuted} strokeWidth={2.2} />
        </Pressable>
      </View>

      {success && indent && successPostId ? (
        <SuccessView
          indent={indent}
          orgId={orgId}
          postId={successPostId}
          onShareWhatsApp={shareStoryLinkOnWhatsApp}
          onBoostReach={
            onBoostAfterBroadcast
              ? () => onBoostAfterBroadcast(successPostId)
              : undefined
          }
          onDone={onClose}
        />
      ) : !success ? (
        <>
          <LoadPreviewCard indent={indent} />

          <View style={styles.hintRow}>
            <View style={styles.hintChip}>
              <Text style={styles.hintChipText}>Story reel only</Text>
            </View>
            <View style={styles.hintChip}>
              <Text style={styles.hintChipText}>24h expiry</Text>
            </View>
            <View style={styles.hintChip}>
              <Text style={styles.hintChipText}>No public timeline</Text>
            </View>
          </View>

          <View style={styles.noteSection}>
            <Text style={styles.sectionLabel}>Add a note (optional)</Text>
            <View style={styles.noteBox}>
              <TextInput
                style={styles.noteInput}
                placeholder="Add context for your partners..."
                placeholderTextColor={Theme.textMuted}
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={2}
                returnKeyType="done"
                blurOnSubmit
              />
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.broadcastBtn,
              loading && styles.broadcastBtnDisabled,
              pressed && !loading && styles.broadcastBtnPressed,
            ]}
            onPress={handleBroadcast}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Broadcast to story for 24 hours"
          >
            {loading ? (
              <LoadingIndicator color={Theme.textOnPrimary} />
            ) : (
              <>
                <Zap
                  size={15}
                  color={Theme.textOnPrimary}
                  fill={Theme.textOnPrimary}
                />
                <Text style={styles.broadcastBtnText}>
                  Broadcast to story (24h)
                </Text>
              </>
            )}
          </Pressable>
        </>
      ) : null}
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, IS_WEB && styles.backdropWeb]}>
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close broadcast sheet"
        />

        <Animated.View
          style={[
            styles.sheet,
            IS_WEB && styles.sheetWeb,
            {
              paddingBottom: insets.bottom + (IS_WEB ? 20 : 16),
              opacity: IS_WEB ? sheetOpacity : 1,
            },
            !IS_WEB ? { transform: [{ translateY }] } : null,
          ]}
        >
          {IS_WEB ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScrollContent}
            >
              {sheetBody}
            </ScrollView>
          ) : (
            <KeyboardAvoidingView
              behavior="padding"
              enabled
              style={styles.sheetInner}
            >
              {sheetBody}
            </KeyboardAvoidingView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.driverOverlay,
    justifyContent: "flex-end",
  },
  backdropWeb: {
    position: "fixed" as "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100000,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
    ...Platform.select({
      web: { cursor: "pointer" as const },
      default: {},
    }),
  },

  sheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    alignSelf: "stretch",
    position: "relative",
    maxHeight: IS_WEB ? "92%" : "88%",
    ...(IS_WEB
      ? {
          width: "100%",
          maxWidth: SHEET_MAX_WIDTH,
          borderRadius: 20,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: BORDER,
          ...platformShadow("0 16px 48px rgba(15, 23, 42, 0.14)", {
            color: Theme.shadow,
            opacity: 0.14,
            radius: 24,
            offsetY: 12,
            elevation: 12,
          }),
        }
      : {}),
  },
  sheetWeb: {
    overflow: "hidden",
  },
  sheetInner: {
    width: "100%",
    gap: 14,
  },
  sheetScrollContent: {
    gap: 14,
    paddingBottom: 4,
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
    alignSelf: "center",
    marginBottom: 8,
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 2,
  },
  headerTextCol: { flex: 1, minWidth: 0, gap: 2 },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: INK,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: "500",
    color: MUTED,
    lineHeight: 16,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  previewCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_EDGE,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    ...platformShadow("0 4px 14px rgba(15, 23, 42, 0.06)", {
      color: Theme.shadow,
      opacity: 0.06,
      radius: 10,
      offsetY: 3,
      elevation: 2,
    }),
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardTopIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.brandBlueInk,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardTopText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  cardTopTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: INK,
    letterSpacing: -0.1,
  },
  cardTopMeta: {
    fontSize: 11,
    fontWeight: "500",
    color: MUTED,
    lineHeight: 14,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.brandBlueRing,
    flexShrink: 0,
  },
  statusChipText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.45,
    color: Theme.brandBlueInk,
  },

  routeGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
    gap: 4,
  },
  routeCol: {
    flex: 1,
    minWidth: 0,
  },
  routeColEnd: {
    alignItems: "flex-end",
  },
  routeSep: {
    paddingTop: 16,
    width: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    flexShrink: 0,
  },
  routeSepLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: CARD_EDGE,
  },
  routeLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: MUTED,
    letterSpacing: 0.45,
    textTransform: "uppercase",
    marginBottom: 3,
    lineHeight: 12,
  },
  routeLabelEnd: {
    textAlign: "right",
    width: "100%",
  },
  routeCity: {
    fontSize: 12,
    fontWeight: "600",
    color: INK,
    lineHeight: 15,
    letterSpacing: -0.1,
    textTransform: "uppercase",
  },
  routeCityEnd: {
    textAlign: "right",
    width: "100%",
  },
  routeState: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "400",
    color: MUTED,
    lineHeight: 12,
  },
  routeStateEnd: {
    textAlign: "right",
    width: "100%",
  },
  routeStateSpacer: {
    marginTop: 1,
    fontSize: 9,
    lineHeight: 12,
    color: "transparent",
  },

  specScroll: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "stretch",
    marginTop: 2,
  },
  specRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
    paddingRight: 8,
  },
  specChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: Theme.surfaceGray,
  },
  specChipText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  specChipDate: {
    backgroundColor: Theme.brandBlueSoft,
    borderColor: Theme.brandBlueRing,
  },
  specChipDateText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.brandBlueInk,
  },

  priceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    marginTop: 2,
  },
  priceCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  priceHint: {
    fontSize: 9,
    fontWeight: "600",
    color: MUTED,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  priceValue: {
    fontSize: 20,
    fontWeight: "700",
    color: INK,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  expiryInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Theme.brandBlueSoft,
    flexShrink: 0,
    marginBottom: 2,
  },
  expiryInlineText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.brandBlueInk,
    letterSpacing: 0.2,
  },

  hintRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 2,
  },
  hintChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  hintChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: MUTED,
  },

  noteSection: { gap: 8, paddingHorizontal: 2 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  noteBox: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteInput: {
    fontSize: 14,
    fontWeight: "400",
    color: INK,
    lineHeight: 20,
    textAlignVertical: "top",
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
      default: {},
    }),
  },

  errorText: {
    fontSize: 12,
    color: Theme.teslaRed,
    fontWeight: "500",
    textAlign: "center",
  },

  broadcastBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Theme.brandBlueInk,
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 48,
    marginHorizontal: 2,
  },
  broadcastBtnPressed: { opacity: 0.92 },
  broadcastBtnDisabled: { opacity: 0.6 },
  broadcastBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },

  successView: {
    alignItems: "stretch",
    paddingVertical: 4,
    gap: 12,
  },
  successHero: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  successIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.positiveMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(21, 128, 61, 0.18)",
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.2,
  },
  successSub: {
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  devHintBanner: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  devHintText: {
    fontSize: 11,
    fontWeight: "500",
    color: MUTED,
    textAlign: "center",
    lineHeight: 16,
  },
  boostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Theme.accentBrownWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.accentBrownBorder,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: "100%",
    minHeight: 46,
  },
  boostBtnPressed: { opacity: 0.9 },
  boostBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.accentBrown,
    letterSpacing: 0.2,
  },
  waBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#25D366",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: "100%",
    minHeight: 46,
  },
  waBtnPressed: { opacity: 0.9 },
  waBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
  waHint: {
    fontSize: 11,
    fontWeight: "500",
    color: MUTED,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 6,
    marginTop: -4,
  },
  linkCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    padding: 12,
    gap: 6,
    alignItems: "stretch",
  },
  linkCardLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  linkPreview: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Theme.brandBlueSoft,
  },
  copyBtnPressed: { opacity: 0.85 },
  copyBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.brandBlueInk,
  },
  doneBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: Theme.screenBackground,
    marginTop: 2,
  },
  doneBtnPressed: { backgroundColor: Theme.surfaceGray },
  doneBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
});
