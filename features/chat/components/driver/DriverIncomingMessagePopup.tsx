/**
 * Compact in-app toast for a new trip-chat message on the driver shell.
 * WhatsApp-style: read the bubble + reply inline without opening the room.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import type { DriverIncomingAlert } from "@/features/chat/hooks/useDriverIncomingMessageAlerts";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import * as ImagePicker from "expo-image-picker";
import { ArrowUp, Camera, Check, Image as ImageIcon, MessageCircle, X } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const QUICK_REPLIES = ["On my way", "Got it", "I'll update you"] as const;

/** Like / dislike / smile / sad / heart — fill composer; send via arrow. */
const QUICK_SMILES = [
  { emoji: "👍", label: "Like" },
  { emoji: "👎", label: "Dislike" },
  { emoji: "😊", label: "Smile" },
  { emoji: "😢", label: "Sad" },
  { emoji: "❤️", label: "Heart" },
] as const;

type Props = {
  alert: DriverIncomingAlert | null;
  onOpen: (alert: DriverIncomingAlert) => void;
  /** Mark seen / clear (e.g. after send). */
  onDismiss: () => void;
  /** Park as unread floating chip — does not mark seen. */
  onLater: () => void;
  onReply: (alert: DriverIncomingAlert, text: string) => Promise<boolean>;
  /** Compress + upload local photo URI into the trip chat. */
  onSendPhoto: (
    alert: DriverIncomingAlert,
    localUri: string,
  ) => Promise<boolean>;
};

function relativeTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "Just now";
  const delta = Math.max(0, Date.now() - ms);
  const mins = Math.floor(delta / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const DriverIncomingMessagePopup = memo(function DriverIncomingMessagePopup({
  alert,
  onOpen,
  onDismiss,
  onLater,
  onReply,
  onSendPhoto,
}: Props) {
  const insets = useSafeAreaInsets();
  const visible = useSharedValue(0);
  const bubbleIn = useSharedValue(0);
  const sendPulse = useSharedValue(1);
  const camGlow = useSharedValue(0.55);
  const inputRef = useRef<TextInput>(null);
  const frozenAlertRef = useRef<DriverIncomingAlert | null>(null);
  const [draft, setDraft] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentPhoto, setSentPhoto] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const alertKey = alert
    ? `${alert.conversationId}:${alert.at}`
    : null;

  // Keep a frozen copy while sending / showing “Reply sent” so a conversation
  // preview patch (driver role) cannot unmount the toast mid-animation.
  if (alert) frozenAlertRef.current = alert;
  const shown = alert ?? ((sending || sent) ? frozenAlertRef.current : null);

  useEffect(() => {
    visible.value = withSpring(shown ? 1 : 0, {
      damping: 20,
      stiffness: 260,
      mass: 0.65,
    });
  }, [shown, visible]);

  useEffect(() => {
    camGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.45, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [camGlow]);

  // Reset composer when a new alert lands.
  useEffect(() => {
    if (!alertKey) return;
    setDraft("");
    setPhotoUri(null);
    setSending(false);
    setSent(false);
    setSentPhoto(false);
    setSendError(null);
    bubbleIn.value = 0;
    bubbleIn.value = withTiming(1, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [alertKey, bubbleIn]);

  const shellStyle = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [
      { translateY: (1 - visible.value) * -14 },
      { scale: 0.97 + visible.value * 0.03 },
    ],
  }));

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + bubbleIn.value * 0.65,
    transform: [{ translateX: (1 - bubbleIn.value) * 18 }],
  }));

  const sendBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendPulse.value }],
  }));

  const camBtnStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(198,240,53,${0.25 + camGlow.value * 0.45})`,
    shadowOpacity: 0.12 + camGlow.value * 0.22,
  }));

  const finishSent = useCallback((wasPhoto: boolean) => {
    setSentPhoto(wasPhoto);
    setSent(true);
    setDraft("");
    setPhotoUri(null);
    Keyboard.dismiss();
    setTimeout(() => {
      frozenAlertRef.current = null;
      onDismiss();
    }, 650);
  }, [onDismiss]);

  const handleSend = useCallback(
    async (raw: string) => {
      const target = frozenAlertRef.current;
      if (!target || sending || sent) return;
      const text = raw.trim();
      const uri = photoUri;
      if (!text && !uri) return;
      setSending(true);
      setSendError(null);
      sendPulse.value = withSequence(
        withTiming(0.88, { duration: 80 }),
        withSpring(1, { damping: 14, stiffness: 320 }),
      );
      let ok = true;
      if (uri) {
        ok = await onSendPhoto(target, uri);
        if (ok && text) {
          ok = await onReply(target, text);
        }
      } else {
        ok = await onReply(target, text);
      }
      setSending(false);
      if (!ok) {
        setSendError(uri ? "Couldn't send photo — try again" : "Couldn't send — try again");
        return;
      }
      finishSent(Boolean(uri));
    },
    [finishSent, onReply, onSendPhoto, photoUri, sendPulse, sending, sent],
  );

  const pickFromCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera needed", "Allow camera access to snap a quick photo reply.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
      exif: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setPhotoUri(result.assets[0].uri);
    setSendError(null);
  }, []);

  const pickFromLibrary = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Photos needed", "Allow photo library access to attach an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
      exif: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setPhotoUri(result.assets[0].uri);
    setSendError(null);
  }, []);

  const openAttach = useCallback(() => {
    if (sending || sent) return;
    Alert.alert("Attach photo", "Snap a quick update for the shipper", [
      { text: "Take photo", onPress: () => void pickFromCamera() },
      { text: "Photo library", onPress: () => void pickFromLibrary() },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [pickFromCamera, pickFromLibrary, sending, sent]);

  const shipperIdentity = useMemo((): ResolvedPartyAvatarIdentity | null => {
    if (!shown) return null;
    return {
      displayName: shown.partyName,
      entityType: "client",
      organizationImageUrl: shown.partyLogoUrl ?? null,
      organizationAvatarSeed: shown.partyAvatarSeed ?? null,
      // Trip shipper is a commercial peer — use org logo / seed / initials
      // (never the offline building glyph from PartyAvatar).
      isIntegrated: true,
    };
  }, [shown]);

  if (!shown || !shipperIdentity) return null;

  const more =
    shown.unreadInQueue > 1 ? ` · +${shown.unreadInQueue - 1}` : "";
  const metaBits = [
    shown.tripNumber || null,
    shown.routeLabel || null,
  ].filter(Boolean);
  const canSend =
    (draft.trim().length > 0 || !!photoUri) && !sending && !sent;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.host,
        {
          paddingTop: Math.max(insets.top, 10) + 6,
          paddingHorizontal: Layout.screenPaddingHorizontal ?? 16,
        },
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.card, shellStyle]}>
          <View style={styles.body}>
            <Pressable
              onPress={() => onOpen(shown)}
              accessibilityRole="button"
              accessibilityLabel={`Open chat with ${shown.partyName}`}
              style={styles.mainHit}
            >
              <View style={styles.avatarWrap}>
                <ChatPartyAvatar identity={shipperIdentity} size={36} />
                <View style={styles.unreadDot} />
              </View>

              <View style={styles.copy}>
                <View style={styles.titleRow}>
                  <View style={styles.kickerRow}>
                    <MessageCircle
                      size={11}
                      color={Theme.driverLime}
                      strokeWidth={2.6}
                    />
                    <Text style={styles.kicker} numberOfLines={1}>
                      New message{more}
                    </Text>
                  </View>
                  <Text style={styles.time}>{relativeTime(shown.at)}</Text>
                </View>
                <Text style={styles.party} numberOfLines={1}>
                  {shown.partyName}
                </Text>
                {metaBits.length > 0 ? (
                  <Text style={styles.meta} numberOfLines={1}>
                    {metaBits.join(" · ")}
                  </Text>
                ) : null}
              </View>
            </Pressable>

            <Pressable
              onPress={onLater}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Later — keep as unread"
              style={styles.closeBtn}
            >
              <X size={14} color="rgba(255,255,255,0.7)" strokeWidth={2.5} />
            </Pressable>
          </View>

          {/* Shipper avatar + droplet — right rail, tip faces the avatar */}
          <View style={styles.bubbleRow}>
            <Animated.View style={[styles.messageCluster, bubbleStyle]}>
              <View style={styles.bubbleAvatarRing}>
                <ChatPartyAvatar identity={shipperIdentity} size={28} />
                <View style={styles.bubbleAvatarDot} />
              </View>
              <View style={styles.incomingBubbleWrap}>
                <View style={styles.incomingBubble}>
                  <Text style={styles.incomingBubbleText} numberOfLines={5}>
                    {shown.preview}
                  </Text>
                </View>
                <View style={styles.dropletTip} pointerEvents="none" />
              </View>
            </Animated.View>
          </View>

          {sent ? (
            <View style={styles.sentBanner}>
              <View style={styles.sentIcon}>
                <Check size={14} color={Theme.driverLimeInk} strokeWidth={3} />
              </View>
              <Text style={styles.sentText}>
                {sentPhoto ? "Photo sent" : "Reply sent"}
              </Text>
            </View>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
                keyboardShouldPersistTaps="handled"
              >
                {QUICK_REPLIES.map((chip) => {
                  const selected = draft.trim() === chip;
                  return (
                  <Pressable
                    key={chip}
                    onPress={() => {
                      // Fill the composer only — send via the arrow / Open chat.
                      setDraft(chip);
                      if (sendError) setSendError(null);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    disabled={sending}
                    accessibilityRole="button"
                    accessibilityLabel={`Quick reply: ${chip}`}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.chip,
                      selected && styles.chipSelected,
                      pressed && styles.chipPressed,
                      sending && styles.chipDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected && styles.chipTextSelected,
                      ]}
                    >
                      {chip}
                    </Text>
                  </Pressable>
                  );
                })}
                {QUICK_SMILES.map((item) => {
                  const selected = draft.trim() === item.emoji;
                  return (
                    <Pressable
                      key={item.emoji}
                      onPress={() => {
                        setDraft((prev) => {
                          const trimmed = prev.trim();
                          if (!trimmed || trimmed === item.emoji) {
                            return item.emoji;
                          }
                          return `${trimmed} ${item.emoji}`;
                        });
                        if (sendError) setSendError(null);
                        requestAnimationFrame(() => inputRef.current?.focus());
                      }}
                      disabled={sending}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [
                        styles.smileChip,
                        selected && styles.smileChipSelected,
                        pressed && styles.chipPressed,
                        sending && styles.chipDisabled,
                      ]}
                    >
                      <Text style={styles.smileEmoji}>{item.emoji}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {photoUri ? (
                <View style={styles.photoPreviewRow}>
                  <View style={styles.photoPreviewCard}>
                    <Image
                      source={{ uri: photoUri }}
                      style={styles.photoPreviewImg}
                      accessibilityLabel="Attached photo preview"
                    />
                    <View style={styles.photoPreviewMeta}>
                      <Camera size={12} color={Theme.driverLime} strokeWidth={2.4} />
                      <Text style={styles.photoPreviewLabel} numberOfLines={1}>
                        Ready to send
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setPhotoUri(null)}
                      hitSlop={8}
                      disabled={sending}
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                      style={styles.photoPreviewClear}
                    >
                      <X size={12} color="#fff" strokeWidth={2.6} />
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View style={styles.composer}>
                <Animated.View style={[styles.camBtnWrap, camBtnStyle]}>
                  <Pressable
                    onPress={openAttach}
                    disabled={sending}
                    accessibilityRole="button"
                    accessibilityLabel="Attach photo — open camera"
                    style={({ pressed }) => [
                      styles.camBtn,
                      pressed && styles.camBtnPressed,
                      sending && styles.chipDisabled,
                    ]}
                  >
                    {sending && photoUri ? (
                      <ActivityIndicator size="small" color={Theme.driverLime} />
                    ) : photoUri ? (
                      <ImageIcon size={16} color={Theme.driverLime} strokeWidth={2.4} />
                    ) : (
                      <Camera size={16} color={Theme.driverLime} strokeWidth={2.4} />
                    )}
                  </Pressable>
                </Animated.View>
                <View style={styles.inputWrap}>
                  <TextInput
                    ref={inputRef}
                    value={draft}
                    onChangeText={(t) => {
                      setDraft(t);
                      if (sendError) setSendError(null);
                    }}
                    placeholder={photoUri ? "Add a caption…" : "Reply…"}
                    placeholderTextColor="rgba(255,255,255,0.38)"
                    style={styles.input}
                    multiline
                    maxLength={500}
                    editable={!sending}
                    returnKeyType="send"
                    blurOnSubmit={false}
                    onSubmitEditing={() => {
                      if (canSend) void handleSend(draft);
                    }}
                    accessibilityLabel="Reply to message"
                  />
                </View>
                <Animated.View style={sendBtnStyle}>
                  <Pressable
                    onPress={() => void handleSend(draft)}
                    disabled={!canSend}
                    accessibilityRole="button"
                    accessibilityLabel={photoUri ? "Send photo" : "Send reply"}
                    style={[
                      styles.sendBtn,
                      canSend ? styles.sendBtnActive : styles.sendBtnIdle,
                    ]}
                  >
                    {sending ? (
                      <ActivityIndicator
                        size="small"
                        color={Theme.driverLimeInk}
                      />
                    ) : (
                      <ArrowUp
                        size={18}
                        color={
                          canSend
                            ? Theme.driverLimeInk
                            : "rgba(255,255,255,0.35)"
                        }
                        strokeWidth={2.8}
                      />
                    )}
                  </Pressable>
                </Animated.View>
              </View>

              {sendError ? (
                <Text style={styles.errorText}>{sendError}</Text>
              ) : null}
            </>
          )}

          <View style={styles.actions}>
            <Pressable
              onPress={onLater}
              style={styles.secondaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Later — keep unread bubble"
              disabled={sending}
            >
              <Text style={styles.secondaryText}>Later</Text>
            </Pressable>
            <Pressable
              onPress={() => onOpen(shown)}
              style={styles.primaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Open chat"
              disabled={sending}
            >
              <Text style={styles.primaryText}>Open chat</Text>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1200,
    elevation: 24,
  },
  card: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: Theme.driverDock,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(198,240,53,0.22)",
    borderTopWidth: 2,
    borderTopColor: Theme.driverLime,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 14,
  },
  body: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  mainHit: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  avatarWrap: {
    width: 36,
    height: 36,
    flexShrink: 0,
    marginTop: 1,
  },
  unreadDot: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Theme.negative,
    borderWidth: 1.5,
    borderColor: Theme.driverDock,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
    paddingRight: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  kickerRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  kicker: {
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: Theme.driverLime,
  },
  time: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.48)",
  },
  party: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  meta: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.55)",
    lineHeight: 14,
  },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    flexShrink: 0,
  },
  bubbleRow: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 6,
    alignItems: "flex-end",
  },
  messageCluster: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    maxWidth: "94%",
  },
  bubbleAvatarRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(198,240,53,0.45)",
    backgroundColor: "rgba(198,240,53,0.08)",
    flexShrink: 0,
    marginBottom: 2,
  },
  bubbleAvatarDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Theme.driverLime,
    borderWidth: 1.5,
    borderColor: Theme.driverSurface,
  },
  incomingBubbleWrap: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
    position: "relative",
    paddingBottom: 4,
    paddingLeft: 2,
  },
  incomingBubble: {
    backgroundColor: "rgba(255,255,255,0.12)",
    // Droplet: tip faces shipper avatar (bottom-left).
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    borderBottomLeftRadius: 5,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(198,240,53,0.22)",
    shadowColor: Theme.driverLime,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  dropletTip: {
    position: "absolute",
    left: 6,
    bottom: 0,
    width: 11,
    height: 11,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(198,240,53,0.2)",
    transform: [{ rotate: "45deg" }],
    borderBottomRightRadius: 2,
  },
  incomingBubbleText: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
    letterSpacing: -0.2,
    color: "#FFFFFF",
  },
  chipsRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 2,
    gap: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  smileChip: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(198,240,53,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(198,240,53,0.28)",
  },
  smileChipSelected: {
    backgroundColor: Theme.driverLime,
    borderColor: Theme.driverLime,
  },
  smileEmoji: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(198,240,53,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(198,240,53,0.28)",
  },
  chipSelected: {
    backgroundColor: Theme.driverLime,
    borderColor: Theme.driverLime,
  },
  chipPressed: {
    backgroundColor: "rgba(198,240,53,0.22)",
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.driverLime,
    letterSpacing: -0.1,
  },
  chipTextSelected: {
    color: Theme.driverLimeInk,
  },
  photoPreviewRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  photoPreviewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: 14,
    backgroundColor: "rgba(198,240,53,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(198,240,53,0.28)",
  },
  photoPreviewImg: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  photoPreviewMeta: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  photoPreviewLabel: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.driverLime,
    letterSpacing: -0.1,
  },
  photoPreviewClear: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  composer: {
    marginTop: 8,
    marginHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  camBtnWrap: {
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: Theme.driverLime,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    flexShrink: 0,
  },
  camBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(198,240,53,0.12)",
  },
  camBtnPressed: {
    backgroundColor: "rgba(198,240,53,0.22)",
  },
  inputWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  input: {
    width: "100%",
    maxHeight: 88,
    minHeight: 36,
    paddingHorizontal: 4,
    paddingTop: Platform.OS === "ios" ? 8 : 7,
    paddingBottom: Platform.OS === "ios" ? 8 : 7,
    margin: 0,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    color: "#FFFFFF",
    textAlignVertical: "center",
    ...(Platform.OS === "android" ? { includeFontPadding: false as const } : null),
    ...(Platform.OS === "web"
      ? ({ outlineStyle: "none", outlineWidth: 0 } as object)
      : null),
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendBtnActive: {
    backgroundColor: Theme.driverLime,
  },
  sendBtnIdle: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  errorText: {
    marginTop: 6,
    marginHorizontal: 14,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.negative,
  },
  sentBanner: {
    marginTop: 10,
    marginHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(198,240,53,0.14)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(198,240,53,0.3)",
  },
  sentIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.driverLime,
  },
  sentText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.driverLime,
    letterSpacing: -0.1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 8,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  secondaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.78)",
  },
  primaryBtn: {
    flex: 1.15,
    minHeight: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.driverLime,
  },
  primaryText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.driverLimeInk,
    letterSpacing: -0.1,
  },
});
