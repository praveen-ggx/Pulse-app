/**
 * Create story — LOAD (from an existing indent or manual) or VEHICLE AVAILABILITY.
 * Expires in 24h. No social updates.
 */
import Illustration12 from "@/assets/illustrations/12.svg";
import Illustration22 from "@/assets/illustrations/22.svg";
import Illustration24 from "@/assets/illustrations/24.svg";
import Illustration28 from "@/assets/illustrations/28.svg";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { VehicleTypeCatalogField } from "@/features/vehicles/components/VehicleTypeCatalogField";
import { passingTonRange } from "@/features/vehicles/utils/vehicleTypeCatalog.model";
import {
    createIndent,
    getIndentDisplayNumber,
    resolveSupplierTargetDisplayRate,
} from "@/features/indents/services/indents.service";
import { BroadcastPickIndentCard } from "@/features/network/components/BroadcastPickIndentCard";
import { ensureIndentStory } from "@/features/network/services/indentStoryPosts.service";
import { createPost, type PostType } from "@/features/network/services/posts.service";
import { indentCanBroadcastToPulseNetwork } from "@/features/network/utils/indentBroadcastEligibility.util";
import { useDirectQuoteCountsQuery, useIndentsQuery, useInvalidateIndents } from "@/lib/queries/useIndentsQuery";
import { useInvalidatePosts } from "@/lib/queries/usePostsQuery";
import { useVehiclesQuery } from "@/lib/queries/useVehiclesQuery";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import {
    ArrowLeft,
    ArrowRight,
    Car,
    Check,
    CheckCircle2,
    Circle,
    Clock,
    MapPin,
    Package,
    Search,
    Truck,
    Zap,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const STORY_TYPES: PostType[] = ["LOAD", "VEHICLE_AVAILABILITY"];

const LOAD_ILLUS_ASPECT = 600 / 520;
const VEHICLE_ILLUS_ASPECT = 640 / 560;

function fitIllustration(boxW: number, boxH: number, aspect: number) {
  let w = boxW;
  let h = w / aspect;
  if (h > boxH) {
    h = boxH;
    w = h * aspect;
  }
  return { width: w, height: h };
}

function defaultVehicleExpiresAt(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

export default function CreatePostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { currentOrganization: organization } = useOrganization();
  const { profile, status: authStatus } = useAuth();
  const orgId = organization?.id ?? null;
  const invalidatePosts = useInvalidatePosts(orgId);
  const invalidateIndents = useInvalidateIndents();

  const [type, setType] = useState<"LOAD" | "VEHICLE_AVAILABILITY">("LOAD");
  /** Pick an org indent (not awarded) vs type route manually. */
  const [loadEntryMode, setLoadEntryMode] = useState<"pick" | "manual">("pick");
  const [vehicleEntryMode, setVehicleEntryMode] = useState<"idle" | "manual">("idle");
  const [selectedIndentId, setSelectedIndentId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [loadSearch, setLoadSearch] = useState("");

  const [content, setContent] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [weight, setWeight] = useState("");
  const [rate, setRate] = useState("");
  const [material, setMaterial] = useState("");
  const [availability, setAvailability] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: indents = [], isLoading: indentsLoading } = useIndentsQuery(orgId);
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehiclesQuery(orgId);

  const ownedVehicles = useMemo(() => {
    const list = (vehicles ?? []) as Array<{
      id: string;
      vehicle_number: string;
      vehicle_type: string | null;
      capacity?: string | null;
      vehicle_body_type?: string | null;
      vehicle_brand?: string | null;
      vehicle_model?: string | null;
      type?: string | null;
      status?: string | null;
    }>;
    return list.filter((v) => (v.type ?? "owned").toLowerCase() === "owned");
  }, [vehicles]);

  const idleVehicles = useMemo(() => {
    const isIdleStatus = (status: string | null | undefined) => {
      const s = (status ?? "").toLowerCase();
      return s === "idle" || s === "available" || s === "free";
    };
    return ownedVehicles.filter((v) => isIdleStatus(v.status));
  }, [ownedVehicles]);

  const vehicleFleetStatus = useMemo(() => {
    if (vehiclesLoading) return "loading" as const;
    if (ownedVehicles.length === 0) return "empty" as const;
    if (idleVehicles.length === 0) return "no_idle" as const;
    return "ready" as const;
  }, [vehiclesLoading, ownedVehicles.length, idleVehicles.length]);

  const broadcastableIndents = useMemo(() => {
    const q = loadSearch.trim().toLowerCase();
    const list = (indents ?? []).filter(indentCanBroadcastToPulseNetwork);
    const filtered = q
      ? list.filter((i) => {
          const displayNo = getIndentDisplayNumber(i).toLowerCase();
          const hay = [
            displayNo,
            i.pickup_area,
            i.drop_location,
            i.client_name,
            i.trip_number,
            i.load_type,
            i.vehicle_type,
            String(i.id),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
      : list;
    return [...filtered].sort((a, b) => {
      const ta = new Date(a.created_at ?? 0).getTime();
      const tb = new Date(b.created_at ?? 0).getTime();
      return tb - ta;
    });
  }, [indents, loadSearch]);

  const pickIds = useMemo(
    () => (broadcastableIndents.length ? broadcastableIndents.map((i) => i.id) : null),
    [broadcastableIndents],
  );
  const { data: quoteCounts = {} } = useDirectQuoteCountsQuery(pickIds);

  const canSubmitLoadPick =
    type === "LOAD" &&
    loadEntryMode === "pick" &&
    !!selectedIndentId &&
    broadcastableIndents.some((i) => i.id === selectedIndentId);

  const canSubmitLoadManual =
    type === "LOAD" &&
    loadEntryMode === "manual" &&
    origin.trim().length > 0 &&
    destination.trim().length > 0;

  const canSubmitVehicle =
    type === "VEHICLE_AVAILABILITY" &&
    origin.trim().length > 0 &&
    (vehicleEntryMode === "idle" ? !!selectedVehicleId : vehicleType.trim().length > 0) &&
    availability.trim().length > 0;

  const pickColumns = windowWidth >= 720 ? 2 : 1;
  const pickCellWidth = pickColumns === 2 ? "49%" : "100%";
  const isDesktop = windowWidth >= 960;
  const isWideForm = windowWidth >= 720;
  const isCompactMobile = windowWidth < 480;
  const isUltraCompactMobile = windowWidth <= 360;
  const controlIconSize = isUltraCompactMobile ? 13 : 14;
  const idleVehicleCellWidth = windowWidth < 400 ? "100%" : "49%";

  const canSubmit = (canSubmitLoadPick || canSubmitLoadManual || canSubmitVehicle) && !submitting;

  const selectedIndent = useMemo(
    () => broadcastableIndents.find((i) => i.id === selectedIndentId) ?? null,
    [broadcastableIndents, selectedIndentId],
  );

  /** Live preview of the story being composed (desktop side panel). */
  const preview = useMemo(() => {
    if (type === "LOAD" && loadEntryMode === "pick") {
      const w = selectedIndent?.weight != null ? selectedIndent.weight / 1000 : null;
      const r = selectedIndent
        ? resolveSupplierTargetDisplayRate(selectedIndent.supplier_target, selectedIndent.client_price)
        : null;
      return {
        kind: "LOAD" as const,
        origin: selectedIndent?.pickup_area ?? "",
        destination: selectedIndent?.drop_location ?? "",
        vehicleType: selectedIndent?.vehicle_type ?? "",
        material: selectedIndent?.load_type ?? "",
        weight: w != null ? `${w % 1 === 0 ? w : w.toFixed(1)} T` : "",
        rate: r != null ? `₹${Number(r).toLocaleString("en-IN")}` : "",
        availability: "",
      };
    }
    if (type === "LOAD") {
      return {
        kind: "LOAD" as const,
        origin: origin.trim(),
        destination: destination.trim(),
        vehicleType: vehicleType.trim(),
        material: material.trim(),
        weight: weight.trim() ? `${weight.trim()} T` : "",
        rate: rate.trim() ? `₹${rate.trim()}` : "",
        availability: "",
      };
    }
    return {
      kind: "VEHICLE" as const,
      origin: origin.trim(),
      destination: destination.trim(),
      vehicleType: vehicleType.trim(),
      material: "",
      weight: "",
      rate: "",
      availability: availability.trim(),
    };
  }, [type, loadEntryMode, selectedIndent, origin, destination, vehicleType, material, weight, rate, availability]);

  /** Required-field checklist shown on the deploy panel. */
  const readiness = useMemo<{ label: string; done: boolean }[]>(() => {
    if (type === "LOAD" && loadEntryMode === "pick") {
      return [{ label: "Load indent selected", done: !!selectedIndentId }];
    }
    if (type === "LOAD") {
      return [
        { label: "Pickup location", done: origin.trim().length > 0 },
        { label: "Drop location", done: destination.trim().length > 0 },
      ];
    }
    return [
      { label: "Current location", done: origin.trim().length > 0 },
      {
        label: vehicleEntryMode === "idle" ? "Vehicle selected" : "Vehicle type",
        done:
          vehicleEntryMode === "idle" ? !!selectedVehicleId : vehicleType.trim().length > 0,
      },
      { label: "Availability window", done: availability.trim().length > 0 },
    ];
  }, [type, loadEntryMode, selectedIndentId, origin, destination, vehicleEntryMode, selectedVehicleId, vehicleType, availability]);

  const switchToManualVehicleEntry = () => {
    setVehicleEntryMode("manual");
    setSelectedVehicleId(null);
  };

  const switchToIdleVehicleEntry = () => {
    setVehicleEntryMode("idle");
    setSelectedVehicleId(null);
    setVehicleType("");
    setAvailability("");
  };

  const showManualVehicleFields =
    vehicleEntryMode === "manual" || (vehicleEntryMode === "idle" && !selectedVehicleId);
  const isLoadStory = type === "LOAD";
  const previewAccent = Theme.primary;
  /** Solid fills (orange / ink) need white labels; pastel pills keep ink. */
  const onSolidFill = Theme.textOnPrimary;
  /** Pastel blue fills (vehicle / manual) use ink text for contrast. */
  const onPastelFill = Theme.buttonPrimaryText;
  const idleControlFg = Theme.textPrimary;
  const HintIllustration = isLoadStory ? Illustration12 : Illustration24;
  const PreviewIllustration = isLoadStory ? Illustration22 : Illustration28;
  const storyIllusAspect = isLoadStory ? LOAD_ILLUS_ASPECT : VEHICLE_ILLUS_ASPECT;
  const hintIllus = fitIllustration(isDesktop ? 108 : 90, isDesktop ? 92 : 74, storyIllusAspect);
  const previewIllus = fitIllustration(96, 80, storyIllusAspect);

  const renderPreviewPanel = () => (
    <View style={styles.previewCol}>
      <View style={styles.previewHero}>
        <View style={styles.previewHeroCopy}>
          <Text style={styles.previewHeroTitle}>
            {isLoadStory ? "Broadcast a load" : "Share free capacity"}
          </Text>
          <Text style={styles.previewHeroBody}>
            {isLoadStory
              ? "Your network sees the lane, vehicle, and rate for 24 hours."
              : "Partners see where equipment is free and which lanes you prefer."}
          </Text>
        </View>
        <View style={styles.previewHeroIllus}>
          <PreviewIllustration width={previewIllus.width} height={previewIllus.height} />
        </View>
      </View>

      <Text style={styles.previewKicker}>Live preview</Text>
      <View style={styles.previewCard}>
        <View style={[styles.previewAccentBar, { backgroundColor: previewAccent }]} />
        <View style={styles.previewTopRow}>
          <View style={[styles.previewBadge, { backgroundColor: previewAccent + "18" }]}>
            {isLoadStory ? (
              <Truck size={12} color={previewAccent} />
            ) : (
              <MapPin size={12} color={previewAccent} />
            )}
            <Text style={[styles.previewBadgeText, { color: previewAccent }]}>
              {isLoadStory ? "Load" : "Vehicle free"}
            </Text>
          </View>
          <View style={styles.previewExpiry}>
            <Clock size={10} color={Theme.textMuted} />
            <Text style={styles.previewExpiryText}>Expires in 24h</Text>
          </View>
        </View>

        <View style={styles.previewRoute}>
          <Text
            style={[styles.previewCity, !preview.origin && styles.previewCityMuted]}
            numberOfLines={1}
          >
            {preview.origin || (isLoadStory ? "Pickup" : "Current location")}
          </Text>
          <ArrowRight size={13} color={Theme.textMuted} />
          <Text
            style={[styles.previewCity, !preview.destination && styles.previewCityMuted]}
            numberOfLines={1}
          >
            {preview.destination || (isLoadStory ? "Drop" : "Anywhere")}
          </Text>
        </View>

        {Boolean(preview.vehicleType || preview.weight || preview.rate || preview.material) && (
          <View style={styles.previewChips}>
            {preview.vehicleType ? (
              <View style={styles.previewChip}>
                <Text style={styles.previewChipText}>{preview.vehicleType}</Text>
              </View>
            ) : null}
            {preview.weight ? (
              <View style={styles.previewChip}>
                <Text style={styles.previewChipText}>{preview.weight}</Text>
              </View>
            ) : null}
            {preview.material ? (
              <View style={styles.previewChip}>
                <Text style={styles.previewChipText}>{preview.material}</Text>
              </View>
            ) : null}
            {preview.rate ? (
              <View style={[styles.previewChip, styles.previewChipRate]}>
                <Text style={[styles.previewChipText, styles.previewChipRateText]}>
                  {preview.rate}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {preview.availability ? (
          <Text style={styles.previewAvailability} numberOfLines={2}>
            {preview.availability}
          </Text>
        ) : null}

        <View style={styles.previewFooter}>
          <View style={[styles.previewOrgDot, { backgroundColor: previewAccent }]} />
          <Text style={styles.previewFooterText} numberOfLines={1}>
            {organization?.name ?? "Your organization"}
          </Text>
        </View>
      </View>

      <View style={styles.readinessCard}>
        <Text style={styles.readinessTitle}>Before you deploy</Text>
        {readiness.map((item) => (
          <View key={item.label} style={styles.readinessRow}>
            {item.done ? (
              <CheckCircle2 size={15} color="#10b981" />
            ) : (
              <Circle size={15} color={Theme.borderMedium} />
            )}
            <Text style={[styles.readinessLabel, item.done && styles.readinessLabelDone]}>
              {item.label}
            </Text>
          </View>
        ))}
        <View style={styles.readinessDivider} />
        <View style={styles.readinessHintRow}>
          <Clock size={12} color={Theme.textMuted} />
          <Text style={styles.readinessHint}>
            Visible to the Pulse network for 24 hours, then auto-expires.
          </Text>
        </View>
      </View>
    </View>
  );

  const handleSubmit = async () => {
    if (!orgId || !canSubmit || authStatus === "restoring") return;
    if (!STORY_TYPES.includes(type)) {
      Alert.alert("Invalid type", "Only load and vehicle availability stories are allowed.");
      return;
    }
    setSubmitting(true);
    const parsed = parseFloat(rate.replace(/,/g, ""));
    const weightParsed = parseFloat(weight);
    // LOAD + indent: visibility follows indent (P0.1). Vehicle stories keep a soft display TTL.

    let error: Error | null = null;

    if (type === "LOAD" && loadEntryMode === "pick" && selectedIndentId) {
      const indent = broadcastableIndents.find((i) => i.id === selectedIndentId);
      if (!indent) {
        setSubmitting(false);
        Alert.alert("Select a load", "Choose an indent from the list.");
        return;
      }
      const res = await ensureIndentStory(orgId, indent, {
        content: content.trim() || undefined,
        reboost: true,
      });
      error = res.error;
    } else if (type === "LOAD" && loadEntryMode === "manual") {
      const weightTonnes = Number.isNaN(weightParsed) || weightParsed <= 0 ? 6 : weightParsed;
      const weightKg = Math.max(100, weightTonnes * 1000);
      const rateNum = Number.isNaN(parsed) || parsed <= 0 ? 1 : parsed;
      const mat = material.trim() || "General";
      const veh = vehicleType.trim() || "Open Body";
      const { error: indentErr, indent: pulseIndent } = await createIndent(
        orgId,
        {
          pickup_area: origin.trim(),
          drop_location: destination.trim(),
          client_name: mat.slice(0, 200),
          client_price: rateNum,
          supplier_target: rateNum,
          vehicle_type: veh,
          load_type: mat.slice(0, 100),
          weight: weightKg,
          pickup_date: null,
          circulation_target: "both",
          owner_user_id: profile?.uid ?? undefined,
          created_by_user_id: profile?.uid ?? undefined,
        },
        { action: "share" },
      );
      if (indentErr || !pulseIndent) {
        error = indentErr ?? new Error("Could not create indent for this story");
      } else {
        const res = await ensureIndentStory(orgId, pulseIndent, {
          content: content.trim() || undefined,
          reboost: true,
        });
        error = res.error;
      }
    } else {
      const res = await createPost({
        organizationId: orgId,
        type: "VEHICLE_AVAILABILITY",
        content: [availability.trim(), content.trim()].filter(Boolean).join(" · ") || undefined,
        origin: origin.trim() || undefined,
        destination: destination.trim() || undefined,
        vehicleType: vehicleType || undefined,
        expiresAt: defaultVehicleExpiresAt(),
      });
      error = res.error;
    }

    setSubmitting(false);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    invalidatePosts();
    invalidateIndents(orgId);
    router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View
        style={[
          styles.header,
          isDesktop && styles.headerDesktop,
          isUltraCompactMobile && styles.headerUltraCompact,
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, isUltraCompactMobile && styles.backBtnUltraCompact]}
          hitSlop={8}
        >
          <ArrowLeft size={isUltraCompactMobile ? 18 : 20} color={Theme.textPrimary} />
        </Pressable>
        <Text
          style={[styles.headerTitle, isUltraCompactMobile && styles.headerTitleUltraCompact]}
          numberOfLines={1}
        >
          Broadcast story
        </Text>
        <Pressable
          style={[
            styles.publishBtn,
            isUltraCompactMobile && styles.publishBtnUltraCompact,
            canSubmit ? styles.publishBtnActive : styles.publishBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? (
            <LoadingIndicator size={14} color={Theme.textOnPrimary} />
          ) : (
            <View style={styles.publishBtnInner}>
              <Zap
                size={12}
                color={canSubmit ? Theme.textOnPrimary : Theme.textMuted}
                fill={canSubmit ? Theme.textOnPrimary : Theme.textMuted}
              />
              <Text
                style={[
                  styles.publishBtnText,
                  isUltraCompactMobile && styles.publishBtnTextUltraCompact,
                  !canSubmit && styles.publishBtnTextDisabled,
                ]}
              >
                Deploy
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={Platform.OS === "ios"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          style={styles.form}
          contentContainerStyle={[
            styles.formContent,
            isCompactMobile && styles.formContentCompact,
            isUltraCompactMobile && styles.formContentUltraCompact,
            { paddingBottom: insets.bottom + (isUltraCompactMobile ? 48 : 32) },
          ]}
          showsVerticalScrollIndicator={isCompactMobile}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.canvas,
              isDesktop && styles.canvasWide,
              isCompactMobile && styles.canvasCompact,
              isUltraCompactMobile && styles.canvasUltraCompact,
            ]}
          >
           <View style={[styles.workspace, isDesktop && styles.workspaceWide]}>
            <View
              style={[
                styles.formCol,
                isDesktop && styles.formColWide,
                isCompactMobile && styles.formColCompact,
              ]}
            >
            <View
              style={[
                styles.hintBanner,
                isCompactMobile && styles.hintBannerCompact,
                isUltraCompactMobile && styles.hintBannerUltraCompact,
              ]}
            >
              <View style={styles.hintBannerCopy}>
                <Text
                  style={[
                    styles.hintBannerTitle,
                    isUltraCompactMobile && styles.hintBannerTitleUltraCompact,
                  ]}
                >
                  {isLoadStory ? "24-hour load story" : "24-hour vehicle story"}
                </Text>
                <Text
                  style={[styles.hintText, isUltraCompactMobile && styles.hintTextUltraCompact]}
                >
                  Stories expire in 24 hours. Only load and vehicle availability — no personal or
                  generic updates.
                </Text>
              </View>
              {isDesktop ? (
                <View style={styles.hintBannerIllus}>
                  <HintIllustration width={hintIllus.width} height={hintIllus.height} />
                </View>
              ) : null}
            </View>

            <View
              style={[
                styles.typeSelector,
                isDesktop && styles.typeSelectorDesktop,
                isCompactMobile && styles.stackControlsMobile,
              ]}
            >
              <Pressable
                style={[
                  styles.typeBtn,
                  isCompactMobile && styles.typeBtnStacked,
                  isUltraCompactMobile && styles.typeBtnUltraCompact,
                  type === "LOAD" && styles.typeBtnActiveLoad,
                ]}
                onPress={() => {
                  setType("LOAD");
                }}
              >
                <Truck
                  size={controlIconSize}
                  color={type === "LOAD" ? onSolidFill : idleControlFg}
                />
                <Text
                  style={[
                    styles.typeBtnText,
                    isUltraCompactMobile && styles.typeBtnTextUltraCompact,
                    type === "LOAD" && styles.typeBtnTextOnSolid,
                  ]}
                >
                  Load indent
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.typeBtn,
                  isCompactMobile && styles.typeBtnStacked,
                  isUltraCompactMobile && styles.typeBtnUltraCompact,
                  type === "VEHICLE_AVAILABILITY" && styles.typeBtnActiveVehicle,
                ]}
                onPress={() => {
                  setType("VEHICLE_AVAILABILITY");
                  setLoadEntryMode("pick");
                  setSelectedIndentId(null);
                  setVehicleEntryMode("idle");
                }}
              >
                <MapPin
                  size={controlIconSize}
                  color={
                    type === "VEHICLE_AVAILABILITY" ? onPastelFill : idleControlFg
                  }
                />
                <Text
                  style={[
                    styles.typeBtnText,
                    isUltraCompactMobile && styles.typeBtnTextUltraCompact,
                    type === "VEHICLE_AVAILABILITY" && styles.typeBtnTextOnPastel,
                  ]}
                >
                  Vehicle free
                </Text>
              </Pressable>
            </View>

          {type === "LOAD" ? (
            <View
              style={[
                styles.segmentedControl,
                isCompactMobile && styles.segmentedControlCompact,
                isCompactMobile && styles.stackControlsMobile,
              ]}
            >
              <Pressable
                style={[
                  styles.segmentedBtn,
                  isCompactMobile && styles.segmentedBtnStacked,
                  isUltraCompactMobile && styles.segmentedBtnUltraCompact,
                  loadEntryMode === "pick" && styles.segmentedBtnActiveLoad,
                ]}
                onPress={() => {
                  setLoadEntryMode("pick");
                  setOrigin("");
                  setDestination("");
                  setVehicleType("");
                  setWeight("");
                  setRate("");
                  setMaterial("");
                }}
              >
                <Package
                  size={controlIconSize}
                  color={loadEntryMode === "pick" ? onSolidFill : idleControlFg}
                />
                <Text
                  style={[
                    styles.segmentedBtnText,
                    isUltraCompactMobile && styles.segmentedBtnTextUltraCompact,
                    loadEntryMode === "pick" && styles.segmentedBtnTextOnSolid,
                  ]}
                >
                  From open indents
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.segmentedBtn,
                  isCompactMobile && styles.segmentedBtnStacked,
                  isUltraCompactMobile && styles.segmentedBtnUltraCompact,
                  loadEntryMode === "manual" && styles.segmentedBtnActiveManual,
                ]}
                onPress={() => {
                  setLoadEntryMode("manual");
                  setSelectedIndentId(null);
                }}
              >
                <MapPin
                  size={controlIconSize}
                  color={loadEntryMode === "manual" ? onPastelFill : idleControlFg}
                />
                <Text
                  style={[
                    styles.segmentedBtnText,
                    isUltraCompactMobile && styles.segmentedBtnTextUltraCompact,
                    loadEntryMode === "manual" && styles.segmentedBtnTextOnPastel,
                  ]}
                >
                  Enter manually
                </Text>
              </Pressable>
            </View>
          ) : null}

          {type === "LOAD" && loadEntryMode === "pick" && (
            <View
              style={[
                styles.pickSection,
                isCompactMobile && styles.pickSectionCompact,
                isUltraCompactMobile && styles.pickSectionUltraCompact,
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderCopy}>
                  <Text style={styles.sectionKicker}>Open indents</Text>
                  <Text
                    style={[
                      styles.pickSectionTitle,
                      isUltraCompactMobile && styles.pickSectionTitleUltraCompact,
                    ]}
                  >
                    Pick a load to broadcast{" "}
                    <Text style={styles.sectionCount}>({broadcastableIndents.length})</Text>
                  </Text>
                </View>
              </View>
              <Text style={styles.sectionSub}>
                Only indents that are not awarded and not assigned can go to the story reel — same
                as Pulse on Load Center.
              </Text>

              <View style={styles.searchBar}>
                <Search size={16} color={Theme.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search route, client, number…"
                  placeholderTextColor={Theme.textMuted}
                  value={loadSearch}
                  onChangeText={setLoadSearch}
                />
              </View>

              {indentsLoading ? (
                <View style={styles.loadListLoading}>
                  <LoadingIndicator size="small" color={Theme.primary} />
                  <Text style={styles.loadListLoadingText}>Loading your indents…</Text>
                </View>
              ) : broadcastableIndents.length === 0 ? (
                <View style={styles.emptyPick}>
                  <Package size={40} color={Theme.textMuted} />
                  <Text style={styles.emptyTitle}>No indents to broadcast</Text>
                  <Text style={styles.emptySub}>
                    Create a load in Load Center. Once it is open and not yet awarded, it appears
                    here.
                  </Text>
                  <Pressable
                    style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.9 }]}
                    onPress={() =>
                      router.push("/(tabs)/trips?stage=indent" as import("expo-router").Href)
                    }
                  >
                    <Zap size={15} color={Theme.textOnPrimary} fill={Theme.textOnPrimary} />
                    <Text style={styles.emptyCtaText}>Open load center</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.pickGrid}>
                  {broadcastableIndents.map((load) => (
                    <View
                      key={load.id}
                      style={[
                        styles.pickGridCell,
                        { width: pickCellWidth },
                      ]}
                    >
                      <BroadcastPickIndentCard
                        load={load}
                        selected={selectedIndentId === load.id}
                        bidCount={quoteCounts[load.id] ?? 0}
                        onPress={() =>
                          setSelectedIndentId((prev) => (prev === load.id ? null : load.id))
                        }
                      />
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.notesBlock}>
                <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Extra context for partners (conditions, window…)"
                  placeholderTextColor={Theme.textMuted}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          )}

          {type === "LOAD" && loadEntryMode === "manual" && (
            <View
              style={[
                styles.loadForm,
                isCompactMobile && styles.loadFormCompact,
                isUltraCompactMobile && styles.loadFormUltraCompact,
              ]}
            >
              <View style={styles.orgBadge}>
                <Zap size={12} color={Theme.primary} />
                <Text style={styles.orgBadgeText}>{organization?.name}</Text>
              </View>
              <View style={[styles.routeSection, isWideForm && styles.routeSectionWide]}>
                <View style={[styles.fieldGroup, isWideForm && styles.halfField]}>
                  <View style={[styles.fieldDot, { backgroundColor: "#10b981" }]} />
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>PICKUP LOCATION *</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. Chennai, Tamil Nadu"
                      placeholderTextColor={Theme.textSecondary}
                      value={origin}
                      onChangeText={setOrigin}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
                {!isWideForm ? <View style={styles.routeDivider} /> : null}
                <View style={[styles.fieldGroup, isWideForm && styles.halfField]}>
                  <View style={[styles.fieldDot, { backgroundColor: Theme.primary }]} />
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>DROP LOCATION *</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. Delhi, NCR"
                      placeholderTextColor={Theme.textSecondary}
                      value={destination}
                      onChangeText={setDestination}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
              </View>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>VEHICLE TYPE</Text>
                <VehicleTypeCatalogField
                  value={vehicleType}
                  tons={weight}
                  onChange={(value, passingTon) => {
                    setVehicleType(value);
                    // Passing ton → load weight when weight is still empty.
                    const max = passingTonRange(passingTon)?.max;
                    if (max != null && !weight.trim()) setWeight(String(max));
                  }}
                />
              </View>
              <View
                style={[
                  styles.rowFields,
                  isCompactMobile && styles.rowFieldsStacked,
                ]}
              >
                <View style={[styles.fieldGroup, styles.halfField]}>
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>WEIGHT (TONNES)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. 20"
                      placeholderTextColor={Theme.textSecondary}
                      value={weight}
                      onChangeText={setWeight}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View style={[styles.fieldGroup, styles.halfField]}>
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>MATERIAL</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. Steel"
                      placeholderTextColor={Theme.textSecondary}
                      value={material}
                      onChangeText={setMaterial}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
              </View>
              <View style={styles.rateSection}>
                <Text style={styles.fieldLabel}>EXPECTED RATE (₹) — OPTIONAL</Text>
                <View style={styles.rateInputRow}>
                  <Text style={styles.ratePrefix}>₹</Text>
                  <TextInput
                    style={styles.rateInput}
                    placeholder="Leave blank to invite bids"
                    placeholderTextColor={Theme.textSecondary}
                    value={rate}
                    onChangeText={setRate}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View style={styles.section}>
                <Text style={styles.fieldLabel}>NOTES</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Loading conditions, special instructions…"
                  placeholderTextColor={Theme.textSecondary}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          )}

          {type === "VEHICLE_AVAILABILITY" && (
            <View
              style={[
                styles.vehicleForm,
                isCompactMobile && styles.vehicleFormCompact,
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderCopy}>
                  <Text style={styles.sectionKicker}>Fleet availability</Text>
                  <Text style={styles.pickSectionTitle}>Post a vehicle preference</Text>
                </View>
              </View>
              <Text style={styles.sectionSub}>
                Tell the network where equipment is free and what lane you prefer.
              </Text>

              <View style={styles.orgBadge}>
                <Package size={12} color={Theme.primary} />
                <Text style={styles.orgBadgeText}>{organization?.name}</Text>
              </View>

              <View
                style={[
                  styles.segmentedControl,
                  isCompactMobile && styles.segmentedControlCompact,
                  isCompactMobile && styles.stackControlsMobile,
                ]}
              >
                <Pressable
                  style={[
                    styles.segmentedBtn,
                    isCompactMobile && styles.segmentedBtnStacked,
                    isUltraCompactMobile && styles.segmentedBtnUltraCompact,
                    vehicleEntryMode === "idle" && styles.segmentedBtnActive,
                  ]}
                  onPress={switchToIdleVehicleEntry}
                >
                  <Truck
                    size={controlIconSize}
                    color={vehicleEntryMode === "idle" ? onPastelFill : idleControlFg}
                  />
                  <Text
                    style={[
                      styles.segmentedBtnText,
                      isUltraCompactMobile && styles.segmentedBtnTextUltraCompact,
                      vehicleEntryMode === "idle" && styles.segmentedBtnTextOnPastel,
                    ]}
                  >
                    From idle fleet
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.segmentedBtn,
                    isCompactMobile && styles.segmentedBtnStacked,
                    isUltraCompactMobile && styles.segmentedBtnUltraCompact,
                    vehicleEntryMode === "manual" && styles.segmentedBtnActiveManual,
                  ]}
                  onPress={switchToManualVehicleEntry}
                >
                  <MapPin
                    size={controlIconSize}
                    color={vehicleEntryMode === "manual" ? onPastelFill : idleControlFg}
                  />
                  <Text
                    style={[
                      styles.segmentedBtnText,
                      isUltraCompactMobile && styles.segmentedBtnTextUltraCompact,
                      vehicleEntryMode === "manual" && styles.segmentedBtnTextOnPastel,
                    ]}
                  >
                    Enter manually
                  </Text>
                </Pressable>
              </View>

              {vehicleEntryMode === "idle" ? (
                <View style={styles.formSectionCard}>
                  <Text style={styles.sectionTitle}>SELECT IDLE VEHICLE *</Text>
                  {vehicleFleetStatus === "loading" ? (
                    <View style={styles.loadListLoading}>
                      <LoadingIndicator size="small" color={Theme.primary} />
                      <Text style={styles.loadListLoadingText}>Loading your fleet…</Text>
                    </View>
                  ) : vehicleFleetStatus === "empty" ? (
                    <View style={styles.vehicleEmptyState}>
                      <View style={styles.vehicleEmptyIconWrap}>
                        <Truck size={28} color={Theme.primary} />
                      </View>
                      <Text style={styles.emptyTitle}>No vehicles in your fleet</Text>
                      <Text style={styles.emptySub}>
                        Add a vehicle to your garage to post availability from idle fleet, or switch
                        to Enter manually above.
                      </Text>
                      <Pressable
                        style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.9 }]}
                        onPress={() => router.push("/(modals)/add-vehicle" as const)}
                      >
                        <Car size={15} color={Theme.textOnPrimary} />
                        <Text style={styles.emptyCtaText}>Add vehicle</Text>
                      </Pressable>
                    </View>
                  ) : vehicleFleetStatus === "no_idle" ? (
                    <View style={styles.vehicleEmptyState}>
                      <View style={[styles.vehicleEmptyIconWrap, styles.vehicleEmptyIconWrapMuted]}>
                        <Clock size={26} color={Theme.textSecondary} />
                      </View>
                      <Text style={styles.emptyTitle}>No idle vehicles right now</Text>
                      <Text style={styles.emptySub}>
                        All {ownedVehicles.length} fleet vehicle
                        {ownedVehicles.length === 1 ? " is" : "s are"} on trip or unavailable.
                        Switch to Enter manually above to post a preference anyway.
                      </Text>
                      <Pressable
                        onPress={() => router.push(ROUTES.partyDirectory("vehicles"))}
                        style={({ pressed }) => [styles.emptySecondary, pressed && { opacity: 0.8 }]}
                      >
                        <Text style={styles.emptySecondaryText}>View garage</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.vehiclePickHint}>
                        Tap a vehicle to pre-fill type and availability. You can still edit location
                        and lane below.
                      </Text>
                      <View style={styles.idleVehicleGrid}>
                        {idleVehicles.map((v) => {
                          const on = selectedVehicleId === v.id;
                          return (
                            <Pressable
                              key={v.id}
                              style={[
                                styles.idleVehicleCard,
                                { width: idleVehicleCellWidth },
                                on && styles.idleVehicleCardOn,
                              ]}
                              onPress={() => {
                                setSelectedVehicleId((prev) => {
                                  const next = prev === v.id ? null : v.id;
                                  if (next) {
                                    if (v.vehicle_type?.trim()) setVehicleType(v.vehicle_type.trim());
                                    const vehicleBits = [
                                      v.vehicle_type?.trim(),
                                      v.capacity?.trim(),
                                      v.vehicle_body_type?.trim(),
                                      [v.vehicle_brand?.trim(), v.vehicle_model?.trim()]
                                        .filter(Boolean)
                                        .join(" "),
                                    ].filter(Boolean);
                                    setAvailability(
                                      `Vehicle ${v.vehicle_number} available now${vehicleBits.length ? ` · ${vehicleBits.join(" · ")}` : ""}`,
                                    );
                                  } else {
                                    setVehicleType("");
                                    setAvailability("");
                                  }
                                  return next;
                                });
                              }}
                            >
                              <View style={styles.idleVehicleTop}>
                                <Text style={styles.idleVehicleNumber} numberOfLines={1}>
                                  {v.vehicle_number}
                                </Text>
                                {on ? (
                                  <Check size={12} color={Theme.primary} strokeWidth={3} />
                                ) : (
                                  <View style={styles.idleVehicleIdleDot} />
                                )}
                              </View>
                              <Text style={styles.idleVehicleMeta} numberOfLines={1}>
                                {v.vehicle_type || "Vehicle type not set"}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}
                </View>
              ) : null}

              <View style={styles.formSectionCard}>
                <Text style={styles.formSectionCardTitle}>Location & lane</Text>
                <View
                  style={[
                    styles.routeSectionInner,
                    isWideForm && styles.routeSectionInnerWide,
                  ]}
                >
                  <View style={[styles.fieldGroup, isWideForm && styles.halfField]}>
                    <View style={[styles.fieldDot, { backgroundColor: "#10b981" }]} />
                    <View style={styles.fieldContent}>
                      <Text style={styles.fieldLabel}>CURRENT LOCATION *</Text>
                      <TextInput
                        style={styles.borderedFieldInput}
                        placeholder="Where is the equipment now?"
                        placeholderTextColor={Theme.textMuted}
                        value={origin}
                        onChangeText={setOrigin}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>
                  {!isWideForm ? <View style={styles.routeDividerHorizontal} /> : null}
                  <View style={[styles.fieldGroup, isWideForm && styles.halfField]}>
                    <View style={[styles.fieldDot, { backgroundColor: "#b45309" }]} />
                    <View style={styles.fieldContent}>
                      <Text style={styles.fieldLabel}>PREFERRED LANE (OPTIONAL)</Text>
                      <TextInput
                        style={styles.borderedFieldInput}
                        placeholder="e.g. Delhi → Mumbai"
                        placeholderTextColor={Theme.textMuted}
                        value={destination}
                        onChangeText={setDestination}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>
                </View>
              </View>

              {showManualVehicleFields ? (
                <View style={styles.formSectionCard}>
                  <Text style={styles.sectionTitle}>VEHICLE TYPE *</Text>
                  <VehicleTypeCatalogField
                    value={vehicleType}
                    onChange={(value) => setVehicleType(value)}
                  />
                </View>
              ) : selectedVehicleId ? (
                <View style={styles.selectedVehicleSummary}>
                  <CheckCircle2 size={14} color={Theme.primary} />
                  <Text style={styles.selectedVehicleSummaryText} numberOfLines={2}>
                    {vehicleType.trim() || "Vehicle"} · availability pre-filled from fleet selection
                  </Text>
                </View>
              ) : null}

              <View
                style={[
                  styles.formSectionCard,
                  isWideForm && !isCompactMobile && styles.formSectionCardSplit,
                  isCompactMobile && styles.formSectionCardCompact,
                ]}
              >
                <View style={isWideForm ? styles.halfField : undefined}>
                  <Text style={styles.fieldLabel}>AVAILABILITY *</Text>
                  <TextInput
                    style={styles.textareaInput}
                    placeholder="e.g. Free from 6pm today, or 12–15 Apr"
                    placeholderTextColor={Theme.textMuted}
                    value={availability}
                    onChangeText={setAvailability}
                    editable={!(vehicleEntryMode === "idle" && !!selectedVehicleId)}
                  />
                </View>
                <View style={isWideForm ? styles.halfField : undefined}>
                  <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
                  <TextInput
                    style={[styles.textareaInput, styles.notesTextarea]}
                    placeholder="Contact preference, terms…"
                    placeholderTextColor={Theme.textMuted}
                    value={content}
                    onChangeText={setContent}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
            </View>
          )}
            </View>
            {isDesktop ? renderPreviewPanel() : null}
           </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, backgroundColor: Theme.surface },
  canvas: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 12,
  },
  canvasWide: {
    alignSelf: "center",
    maxWidth: Layout.desktopHubMaxWidth,
    width: "100%",
    paddingHorizontal: 28,
  },
  workspace: {
    width: "100%",
  },
  workspaceWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 32,
  },
  formCol: {
    width: "100%",
    gap: 12,
  },
  formColWide: {
    flex: 1.15,
    minWidth: 0,
    maxWidth: "100%",
    gap: 14,
  },
  previewCol: {
    width: 460,
    flexShrink: 0,
    gap: 14,
    paddingTop: 0,
    alignSelf: "stretch",
  },
  previewHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    minHeight: 118,
  },
  previewHeroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  previewHeroTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  previewHeroBody: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textRouteCard,
    lineHeight: 16,
  },
  previewHeroIllus: {
    width: 112,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  previewKicker: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.7,
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginLeft: 2,
  },
  previewCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
    paddingLeft: 18,
    gap: 12,
    overflow: "hidden",
    width: "100%",
    ...Platform.select({
      web: { boxShadow: "0 6px 20px rgba(15, 23, 42, 0.05)" } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
    }),
  },
  previewAccentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  previewTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  previewBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  previewExpiry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  previewExpiryText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  previewRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  previewCity: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  previewCityMuted: {
    color: Theme.textMuted,
    fontWeight: "500",
  },
  previewChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  previewChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Theme.surface,
    borderRadius: 6,
  },
  previewChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textRouteCard,
  },
  previewChipRate: {
    backgroundColor: Theme.primary + "12",
  },
  previewChipRateText: {
    color: Theme.primary,
    fontWeight: "700",
  },
  previewAvailability: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 16,
    color: Theme.textSecondary,
  },
  previewFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
    paddingTop: 10,
  },
  previewOrgDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  previewFooterText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textRouteCard,
  },
  readinessCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
    gap: 8,
    width: "100%",
  },
  readinessTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  readinessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  readinessLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textRouteCard,
  },
  readinessLabelDone: {
    color: Theme.textPrimaryDark,
    fontWeight: "600",
  },
  readinessDivider: {
    height: 1,
    backgroundColor: Theme.surfaceBorder,
    marginVertical: 2,
  },
  readinessHintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  readinessHint: {
    flex: 1,
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
    color: Theme.textMuted,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    gap: 8,
  },
  headerDesktop: {
    paddingHorizontal: 28,
  },
  headerUltraCompact: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  backBtnUltraCompact: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  headerTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 14,
    fontStyle: "normal",
    fontWeight: "600",
    color: Theme.textPrimary,
    textTransform: "capitalize",
    letterSpacing: 0.1,
    flex: 1,
    minWidth: 0,
    textAlign: "center",
  },
  headerTitleUltraCompact: {
    fontSize: 13,
    letterSpacing: 0,
  },
  publishBtn: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 88,
    minHeight: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  publishBtnUltraCompact: {
    minWidth: 72,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  publishBtnActive: {
    backgroundColor: Theme.primary,
    ...Platform.select({
      web: { boxShadow: "0 3px 10px rgba(77, 54, 54, 0.22)" } as object,
      default: {
        shadowColor: Theme.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
    }),
  },
  publishBtnDisabled: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  publishBtnInner: { flexDirection: "row", alignItems: "center", gap: 5 },
  publishBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
  publishBtnTextUltraCompact: {
    fontSize: 11,
  },
  publishBtnTextDisabled: {
    color: Theme.textMuted,
  },
  hintBanner: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    minHeight: 108,
  },
  hintBannerCompact: {
    minHeight: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  hintBannerUltraCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  hintBannerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  hintBannerTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  hintBannerTitleUltraCompact: {
    fontSize: 12,
  },
  hintBannerIllus: {
    width: 96,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  hintBox: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  hintText: {
    fontSize: 12,
    color: Theme.textRouteCard,
    lineHeight: 17,
    fontWeight: "400",
  },
  hintTextUltraCompact: {
    fontSize: 11,
    lineHeight: 16,
  },
  typeSelector: {
    flexDirection: "row",
    marginTop: 2,
    marginBottom: 2,
    gap: 8,
  },
  typeSelectorDesktop: {
    gap: 10,
  },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  typeBtnStacked: {
    flex: 0,
    width: "100%",
  },
  typeBtnUltraCompact: {
    minHeight: 42,
    paddingVertical: 9,
    gap: 6,
  },
  typeBtnActiveLoad: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  typeBtnActiveVehicle: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.buttonPrimaryBorder,
    borderWidth: Theme.buttonPrimaryBorderWidth,
  },
  typeBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimary,
    letterSpacing: 0.1,
    textTransform: "capitalize",
  },
  typeBtnTextUltraCompact: {
    fontSize: 11,
    letterSpacing: 0,
  },
  typeBtnTextOnSolid: { color: Theme.textOnPrimary },
  typeBtnTextOnPastel: { color: Theme.buttonPrimaryText },
  form: { flex: 1, minHeight: 0 },
  formContent: {
    paddingTop: 12,
    paddingHorizontal: 0,
    width: "100%",
    alignItems: "stretch",
    flexGrow: 1,
  },
  formContentCompact: {
    paddingTop: 10,
  },
  formContentUltraCompact: {
    paddingTop: 8,
  },
  canvasCompact: {
    paddingHorizontal: 12,
    gap: 10,
  },
  canvasUltraCompact: {
    paddingHorizontal: 10,
    gap: 8,
  },
  formColCompact: {
    gap: 10,
  },
  stackControlsMobile: {
    flexDirection: "column",
    gap: 8,
  },
  vehicleModeRow: {
    flexDirection: "row",
    gap: 8,
  },
  vehicleForm: {
    gap: 12,
    width: "100%",
  },
  vehicleFormCompact: {
    gap: 10,
  },
  sectionHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  segmentedControl: {
    flexDirection: "row",
    gap: 4,
    padding: 3,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  segmentedControlCompact: {
    padding: 4,
    gap: 6,
  },
  segmentedBtn: {
    flex: 1,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  segmentedBtnStacked: {
    flex: 0,
    width: "100%",
    minHeight: 44,
  },
  segmentedBtnUltraCompact: {
    minHeight: 42,
    paddingHorizontal: 10,
    gap: 5,
  },
  segmentedBtnActive: {
    backgroundColor: Theme.buttonPrimary,
    borderWidth: 1,
    borderColor: Theme.buttonPrimaryBorder,
  },
  segmentedBtnActiveLoad: {
    backgroundColor: Theme.primary,
    borderWidth: 1,
    borderColor: Theme.primary,
  },
  segmentedBtnActiveManual: {
    backgroundColor: Theme.buttonPrimary,
    borderWidth: 1,
    borderColor: Theme.buttonPrimaryBorder,
  },
  segmentedBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimary,
    textAlign: "center",
  },
  segmentedBtnTextUltraCompact: {
    fontSize: 11,
  },
  segmentedBtnTextOnSolid: {
    color: Theme.textOnPrimary,
  },
  segmentedBtnTextOnPastel: {
    color: Theme.buttonPrimaryText,
  },  formSectionCard: {
    gap: 10,
    padding: 16,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  formSectionCardCompact: {
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  formSectionCardSplit: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  formSectionCardTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  routeSectionInner: {
    gap: 0,
  },
  routeSectionInnerWide: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  borderedFieldInput: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 20,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  vehicleEmptyState: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  vehicleEmptyIconWrap: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary + "12",
    marginBottom: 2,
  },
  vehicleEmptyIconWrapMuted: {
    backgroundColor: Theme.surface,
  },
  vehiclePickHint: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
    color: Theme.textSecondary,
    marginBottom: 2,
  },
  selectedVehicleSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.primary + "30",
  },
  selectedVehicleSummaryText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 17,
  },
  idleVehicleIdleDot: {
    width: 7,
    height: 7,
    backgroundColor: "#10b981",
  },
  notesTextarea: {
    minHeight: 88,
  },
  vehicleModeBtn: {
    flex: 1,
    minHeight: 36,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  vehicleModeBtnActive: {
    backgroundColor: Theme.screenBackground,
  },
  vehicleModeBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  vehicleModeBtnTextActive: {
    color: Theme.textPrimaryDark,
  },
  pickSection: {
    gap: 12,
    width: "100%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 18,
  },
  pickSectionCompact: {
    padding: 14,
    gap: 10,
    borderRadius: 12,
  },
  pickSectionUltraCompact: {
    padding: 12,
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionKicker: {
    ...FinanceTxnTypography.columnTitle,
    marginBottom: 2,
  },
  pickSectionTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 14,
    fontStyle: "normal",
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
    textTransform: "none",
  },
  pickSectionTitleUltraCompact: {
    fontSize: 13,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textRouteCard,
  },
  sectionSub: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: "normal",
    color: Theme.textRouteCard,
    marginTop: 2,
    marginBottom: 4,
  },
  secondaryLink: { paddingVertical: 4, paddingHorizontal: 2 },
  secondaryLinkText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.primaryText,
    textDecorationLine: "underline",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimary,
    padding: 0,
  },
  loadListLoading: { paddingVertical: 32, alignItems: "center", gap: 10 },
  loadListLoadingText: { fontSize: 12, color: Theme.textSecondary, fontWeight: "600" },
  pickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 10,
    width: "100%",
  },
  pickGridCell: {
    minWidth: 0,
    alignSelf: "stretch",
  },
  idleVehicleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  idleVehicleCard: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 5,
    minHeight: 64,
    justifyContent: "center",
  },
  idleVehicleCardOn: {
    backgroundColor: Theme.primary + "10",
    borderColor: Theme.primary + "40",
  },
  idleVehicleTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  idleVehicleNumber: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  idleVehicleMeta: {
    fontSize: 10,
    color: Theme.textSecondary,
    fontStyle: "italic",
  },
  emptyPick: {
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 12,
    gap: 8,
  },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: Theme.textPrimary, marginTop: 6 },
  emptySub: { fontSize: 12, color: Theme.textRouteCard, textAlign: "center", lineHeight: 18 },
  emptyCta: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  emptyCtaText: { fontSize: 12, fontWeight: "700", color: Theme.textOnPrimary },
  emptySecondary: { marginTop: 8, padding: 8 },
  emptySecondaryText: { fontSize: 12, fontWeight: "700", color: Theme.primary },
  notesBlock: { marginTop: 8, gap: 8 },
  modeBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.surface,
    padding: 12,
    marginBottom: 8,
    borderRadius: 10,
  },
  modeBannerText: { fontSize: 12, fontWeight: "800", color: Theme.textPrimary },
  modeBannerAction: { paddingVertical: 4 },
  modeBannerActionText: { fontSize: 12, fontWeight: "800", color: Theme.primary },
  loadForm: {
    gap: 14,
    width: "100%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
  },
  loadFormCompact: {
    padding: 14,
    gap: 12,
    borderRadius: 12,
  },
  loadFormUltraCompact: {
    padding: 12,
    gap: 10,
  },
  orgBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.primary + "10",
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 4,
  },
  orgBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
  },
  routeSection: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 0,
  },
  routeSectionWide: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  fieldGroup: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  routeFieldRow: {
    minHeight: 40,
    justifyContent: "center",
  },
  routeDividerHorizontal: {
    height: 1,
    backgroundColor: Theme.surfaceBorder,
    marginVertical: 10,
  },
  fieldDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 26,
    flexShrink: 0,
  },
  fieldContent: { flex: 1, minWidth: 0, gap: 6 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  fieldInput: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  routeDivider: {
    width: 1,
    height: 20,
    backgroundColor: Theme.borderMedium,
    marginLeft: 4,
    marginVertical: 6,
  },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textMuted,
    letterSpacing: 1,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  chipActive: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.buttonPrimary,
  },
  chipActiveVehicleType: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.buttonPrimary,
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  chipTextActive: { color: Theme.buttonPrimaryText },
  chipTextActiveVehicle: { color: Theme.buttonPrimaryText },
  rowFields: {
    flexDirection: "row",
    gap: 12,
  },
  rowFieldsStacked: {
    flexDirection: "column",
    gap: 10,
  },
  halfField: { flex: 1, minWidth: 0 },
  rateSection: {
    backgroundColor: Theme.primary + "08",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.primary + "18",
    padding: 14,
    gap: 8,
  },
  rateInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ratePrefix: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.primary,
  },
  rateInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimary,
    letterSpacing: -0.2,
  },
  notesInput: {
    fontSize: 13,
    color: Theme.textPrimary,
    fontWeight: "500",
    lineHeight: 19,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    textAlignVertical: "top",
    minHeight: 72,
  },
  textareaInput: {
    fontSize: 13,
    color: Theme.textPrimary,
    fontWeight: "500",
    lineHeight: 19,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 11,
    textAlignVertical: "top",
    minHeight: 64,
  },
});
