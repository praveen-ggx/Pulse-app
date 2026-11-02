/**
 * Driver chat — Slack-style trip threads (aligned with business Command Hub chat).
 */
import { AppLoadingSplash } from "@/components/AppLoadingSplash";
import { DriverChatSlackInbox } from "@/features/chat/components/driver/DriverChatSlackInbox";
import { DriverChatSlackThread } from "@/features/chat/components/driver/DriverChatSlackThread";
import { useDriverChat } from "@/features/chat/contexts/DriverChatContext";
import { useLoadingStuck } from "@/lib/hooks/useLoadingStuck";
import { preloadDriverChatThread } from "@/lib/preloadDriverChatWarmup";
import type { TripConversation } from "@/features/chat/types/chat.types";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalSearchParams, useRouter, useSegments } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import Layout from "@/constants/Layout";
import { WEB_APP_VIEWPORT_STYLE } from "@/lib/webViewportHeight";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { MessageSquare } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function DriverChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const segments = useSegments();
  const isDriverChatRoute = segments[segments.length - 1] === "chat";

  // "chat" is a Tabs.Screen (see app/(driver)/_layout.tsx) — React Navigation tabs
  // never unmount on tab-switch, so this screen stays mounted after its first open.
  // Re-opening the same trip pushes the same tripId param again, so normalizedTripId
  // never changes value and the trip-resolution effect below has no dependency
  // change to react to. onBack (below) clears selectedId on the way out; without a
  // focus-driven re-trigger, nothing restores it on the next open and the render
  // falls into its terminal loading branch forever. focusTick forces that effect to
  // re-evaluate on every re-focus regardless of whether the route params changed.
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusTick((t) => t + 1);
    }, []),
  );

  const driverTabBarClearance = useMemo(() => {
    if (isDriverChatRoute) return 0;
    const footerPadTop = 4;
    const footerPadBottom = Math.max(Math.round(insets.bottom * 0.35), 10);
    return Layout.tabBarDockHeight + footerPadTop + footerPadBottom;
  }, [insets.bottom, isDriverChatRoute]);

  const screenPadding = useMemo(
    () => ({
      paddingTop: 0,
      paddingBottom: isDriverChatRoute ? 0 : driverTabBarClearance,
    }),
    [driverTabBarClearance, isDriverChatRoute],
  );

  const params = useLocalSearchParams<{ tripId?: string | string[] }>();
  const normalizedTripId = useMemo(() => {
    const raw = params.tripId;
    const v = typeof raw === "string" ? raw : raw?.[0];
    const t = v?.trim();
    return t ? t : null;
  }, [params.tripId]);

  const {
    conversations,
    isLoading,
    sendMessage,
    ensureDriverTripConversation,
  } = useDriverChat();

  const ensureConvRef = useRef(ensureDriverTripConversation);
  ensureConvRef.current = ensureDriverTripConversation;
  // `${tripId}:${focusTick}` of the deep link already opened. `conversations` stays a
  // dependency so the first open can wait for the inbox, but every later list update
  // (each send patches the preview) must not re-select the thread or clear the draft.
  const openedTripKeyRef = useRef<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingConvOrgId, setPendingConvOrgId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [openingTripThread, setOpeningTripThread] = useState(false);
  const [tripThreadError, setTripThreadError] = useState<string | null>(null);

  useEffect(() => {
    if (!normalizedTripId) {
      openedTripKeyRef.current = null;
      setOpeningTripThread(false);
      setTripThreadError(null);
      return;
    }

    const openKey = `${normalizedTripId}:${focusTick}`;
    if (openedTripKeyRef.current === openKey) return;

    const cached = conversations.find(
      (c) => String(c.trip_id) === normalizedTripId,
    );
    if (cached) {
      openedTripKeyRef.current = openKey;
      setOpeningTripThread(false);
      setTripThreadError(null);
      setSelectedId(cached.id);
      setPendingConvOrgId(cached.organization_id);
      setMessageInput("");
      preloadDriverChatThread(queryClient, cached.id);
      return;
    }

    // Wait for inbox bootstrap before hitting ensure RPC (avoids duplicate work).
    if (isLoading) {
      return;
    }

    let cancelled = false;
    setOpeningTripThread(true);
    setTripThreadError(null);
    setSelectedId(null);
    setPendingConvOrgId(null);
    setMessageInput("");
    void ensureConvRef.current(normalizedTripId)
      .then((result) => {
        if (cancelled) return;
        setOpeningTripThread(false);
        if (result) {
          openedTripKeyRef.current = openKey;
          setPendingConvOrgId(result.orgId);
          setSelectedId(result.convId);
          preloadDriverChatThread(queryClient, result.convId);
        } else {
          setTripThreadError("Could not open chat for this trip.");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setOpeningTripThread(false);
        setTripThreadError("Could not open chat for this trip.");
      });
    return () => {
      cancelled = true;
    };
    // focusTick: re-run on every re-focus of this (permanently-mounted tab) screen —
    // see the comment above the useFocusEffect that drives it.
  }, [normalizedTripId, conversations, isLoading, queryClient, focusTick]);

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;
  const resolvedOrgId = selectedConv?.organization_id ?? pendingConvOrgId;

  // A deep-linked trip that has produced neither a thread nor an error is still
  // resolving. If that never completes, the render below would splash forever.
  const awaitingTripThread = Boolean(
    normalizedTripId && !tripThreadError && !(selectedId && resolvedOrgId),
  );
  const tripThreadStuck = useLoadingStuck(awaitingTripThread);

  // TEMP PROBE — remove once the back->reopen hang is confirmed fixed.
  if (__DEV__) {
    console.log('[probe:driverChat]', {
      normalizedTripId,
      isLoading,
      convCount: conversations.length,
      hasTripInConvs: conversations.some(
        (c) => String(c.trip_id) === normalizedTripId,
      ),
      selectedId,
      resolvedOrgId,
      openingTripThread,
      tripThreadError,
      awaitingTripThread,
      tripThreadStuck,
    });
  }

  const handleSend = async () => {
    const text = messageInput.trim();
    if (!text || !selectedId || !resolvedOrgId) return;
    setMessageInput("");
    await sendMessage(selectedId, resolvedOrgId, text);
  };

  const openConv = (conv: TripConversation) => {
    setSelectedId(conv.id);
    setPendingConvOrgId(conv.organization_id);
    setMessageInput("");
    preloadDriverChatThread(queryClient, conv.id);
  };

  const renderThread = (conv: Partial<TripConversation> & {
    id: string;
    organization_id?: string;
    trip_id: string;
  }) => (
    <DriverChatSlackThread
      conversationId={conv.id}
      organizationId={conv.organization_id ?? resolvedOrgId ?? ""}
      tripId={conv.trip_id}
      tripNumber={conv.trip_number ?? ""}
      pickupArea={conv.pickup_area ?? ""}
      dropLocation={conv.drop_location ?? ""}
      fleetName={conv.party_name ?? conv.trip_organization_name}
      messageInput={messageInput}
      setMessageInput={setMessageInput}
      onSend={() => void handleSend()}
      onSendTripChat={(text) =>
        sendMessage(conv.id, conv.organization_id ?? resolvedOrgId ?? "", text)
      }
      onBack={() => {
        setSelectedId(null);
        setPendingConvOrgId(null);
        setMessageInput("");
        if (normalizedTripId) router.back();
      }}
      bottomTabClearance={isDriverChatRoute ? 0 : driverTabBarClearance}
    />
  );

  const rootStyle = [
    { flex: 1, backgroundColor: "#FFFFFF" },
    Platform.OS === "web" ? (WEB_APP_VIEWPORT_STYLE as object) : null,
    screenPadding,
  ];

  const renderDeadEnd = (message: string) => (
    <View style={[...rootStyle, { paddingHorizontal: 24 }]}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }}>
        <MessageSquare size={40} color="#e2e8f0" />
        <Text style={{ fontSize: 15, color: "#475569", textAlign: "center" }}>
          {message}
        </Text>
        <TouchableOpacity
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(driver)/chat")
          }
          style={{
            marginTop: 4,
            backgroundColor: "#0f172a",
            paddingHorizontal: 22,
            paddingVertical: 12,
            borderRadius: 12,
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Go back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (normalizedTripId) {
    if (openingTripThread) {
      return (
        <View style={rootStyle}>
          <AppLoadingSplash variant="preparing" style={{ flex: 1 }} />
        </View>
      );
    }
    if (tripThreadError) return renderDeadEnd(tripThreadError);

    if (selectedId && resolvedOrgId) {
      return (
        <View style={rootStyle}>
          {renderThread({
            id: selectedId,
            organization_id: resolvedOrgId,
            trip_id: selectedConv?.trip_id ?? normalizedTripId,
            trip_number: selectedConv?.trip_number,
            pickup_area: selectedConv?.pickup_area,
            drop_location: selectedConv?.drop_location,
            party_name: selectedConv?.party_name,
            trip_organization_name: selectedConv?.trip_organization_name,
          })}
        </View>
      );
    }

    // Last-resort wait: no thread, no error, nothing in flight. Reachable only
    // if an upstream state never settles. Never leave the driver here silently —
    // surface an exit rather than an endless splash.
    if (tripThreadStuck) {
      return renderDeadEnd("Could not open chat for this trip.");
    }

    return (
      <View style={rootStyle}>
        <AppLoadingSplash variant="preparing" style={{ flex: 1 }} />
      </View>
    );
  }

  return (
    <View style={rootStyle}>
      {!selectedConv ? (
        <DriverChatSlackInbox
          conversations={conversations}
          isLoading={isLoading}
          selectedId={selectedId}
          profileName={profile?.full_name ?? profile?.displayName ?? undefined}
          profileAvatarUrl={profile?.avatar_url ?? null}
          profileAvatarSeed={profile?.avatar_seed ?? null}
          bottomInset={isDriverChatRoute ? insets.bottom : driverTabBarClearance}
          onBack={() =>
            router.canGoBack() ? router.back() : router.replace("/(driver)")
          }
          onOpenConv={openConv}
        />
      ) : (
        renderThread(selectedConv)
      )}
    </View>
  );
}
