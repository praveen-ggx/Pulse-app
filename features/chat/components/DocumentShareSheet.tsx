import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { CHAT_ACCENT, CHAT_TEXT_MUTED, CHAT_TEXT_SECONDARY } from "@/features/chat/chatTheme";
import { ChatImage } from "@/features/chat/components/ChatImage";
import { SLACK_TYPE } from "@/features/chat/components/mobile/chatSlackMobile.styles";
import {
  listChatHubDocuments,
  uploadChatHubTripDocument,
  type ChatHubDocument,
  type ChatHubEntityType,
} from "@/features/chat/services/chatDocumentHub.service";
import { pickChatDocumentFile } from "@/features/chat/utils/chatDocumentPick.util";
import {
  documentExtensionAccent,
  isHubDocumentImage,
} from "@/features/chat/utils/documentShareDisplay.util";
import { formatChatDocumentUploadedAt } from "@/features/chat/utils/formatChatInboxTime.util";
import { normalizeTripDocumentsStoragePath } from "@/features/chat/utils/resolveChatDocumentUrl.util";
import {
  CheckCircle,
  FileText,
  Plus,
  RefreshCw,
  Send,
  Truck,
  User,
  X,
} from "lucide-react-native";
import {
  Alert,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type DocumentSharePayload = {
  key: string;
  label: string;
  storage_path: string;
  entity_type: ChatHubEntityType;
  entity_id: string;
  mime_type?: string | null;
  document_type?: string;
};

interface DocumentShareSheetProps {
  visible: boolean;
  tripId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  orgId: string | null;
  userId: string | null;
  onClose: () => void;
  onShare: (doc: DocumentSharePayload) => void | Promise<void>;
  alreadySentPaths?: string[];
}

type HubSection = {
  title: string;
  entity: ChatHubEntityType;
  data: ChatHubDocument[];
};

const SECTION_META: Record<
  ChatHubEntityType,
  { title: string; empty: string; Icon: typeof Truck }
> = {
  trip: {
    title: "Trip documents",
    empty: "No trip files yet — add POD, manifest, or receipts.",
    Icon: FileText,
  },
  vehicle: {
    title: "Vehicle documents",
    empty: "RC, insurance, fitness, and PUC appear here when uploaded.",
    Icon: Truck,
  },
  driver: {
    title: "Driver documents",
    empty: "Driver licence and ID docs from the driver profile.",
    Icon: User,
  },
};

const THUMB_SIZE = 40;

function pathAlreadySent(storagePath: string, alreadySentPaths: string[]): boolean {
  const normalized = normalizeTripDocumentsStoragePath(storagePath);
  if (!normalized) return false;
  return alreadySentPaths.some(
    (p) => normalizeTripDocumentsStoragePath(p) === normalized,
  );
}

function DocHubThumb({ item }: { item: ChatHubDocument }) {
  const ext =
    item.label.split(".").pop()?.toUpperCase().slice(0, 4) ||
    (item.document_type ?? "DOC").slice(0, 4).toUpperCase();
  const accent = documentExtensionAccent(ext);
  const isImage = isHubDocumentImage(item);

  if (isImage && item.storage_path) {
    return (
      <View style={s.docThumb}>
        <ChatImage
          storagePath={item.storage_path}
          thumbnail
          style={s.docThumbImage}
        />
      </View>
    );
  }

  return (
    <View style={[s.docThumb, s.docThumbIcon, { backgroundColor: `${accent}12` }]}>
      <FileText size={15} color={accent} strokeWidth={2.1} />
      {ext ? (
        <Text style={[s.docThumbExt, { color: accent }]} numberOfLines={1}>
          {ext}
        </Text>
      ) : null}
    </View>
  );
}

function DocRowActions({
  alreadySent,
  isSharing,
  isConfirming,
  isResendConfirm,
  disabled,
  onSend,
  onSendAgain,
  onConfirmSend,
  onCancelConfirm,
}: {
  alreadySent: boolean;
  isSharing: boolean;
  isConfirming: boolean;
  isResendConfirm: boolean;
  disabled: boolean;
  onSend: () => void;
  onSendAgain: () => void;
  onConfirmSend: () => void;
  onCancelConfirm: () => void;
}) {
  // Inline confirm — Alert.alert multi-button is unreliable on web and left
  // rows stuck on "Confirm…" with Send permanently disabled.
  if (isConfirming && !isSharing) {
    return (
      <View style={s.actionsCol}>
        <Text style={s.actionMeta} numberOfLines={1}>
          {isResendConfirm ? "Send again?" : "Send now?"}
        </Text>
        <View style={s.confirmRow}>
          <Pressable
            style={({ pressed }) => [s.cancelConfirmBtn, pressed && s.actionPressed]}
            onPress={onCancelConfirm}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Cancel send"
          >
            <Text style={s.cancelConfirmText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.confirmSendBtn, pressed && s.actionPressed]}
            onPress={onConfirmSend}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={isResendConfirm ? "Confirm send again" : "Confirm send"}
          >
            <Send size={11} color="#fff" strokeWidth={2.3} />
            <Text style={s.confirmSendText}>
              {isResendConfirm ? "Send again" : "Send"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (isSharing) {
    return (
      <View style={s.actionsCol}>
        <LoadingIndicator size="small" color={CHAT_ACCENT} />
        <Text style={s.actionMeta}>Sending…</Text>
      </View>
    );
  }

  if (alreadySent) {
    return (
      <View style={s.actionsCol}>
        <View style={s.sentPill}>
          <CheckCircle size={10} color="#16a34a" strokeWidth={2.4} />
          <Text style={s.sentPillText}>Sent</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            s.sendAgainBtn,
            pressed && !disabled && s.actionPressed,
            disabled && s.actionDisabled,
          ]}
          onPress={onSendAgain}
          disabled={disabled}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Send document again"
        >
          <RefreshCw size={10} color={CHAT_ACCENT} strokeWidth={2.3} />
          <Text style={s.sendAgainText}>Send again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        s.sendPill,
        pressed && !disabled && s.actionPressed,
        disabled && s.actionDisabled,
      ]}
      onPress={onSend}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel="Send document"
    >
      <Send size={11} color={CHAT_ACCENT} strokeWidth={2.3} />
      <Text style={s.sendPillText}>Send</Text>
    </Pressable>
  );
}

function DocRow({
  item,
  onRequestShare,
  onConfirmShare,
  onCancelConfirm,
  alreadySentPaths = [],
  sharingPath,
  confirmingPath,
  confirmingResend,
}: {
  item: ChatHubDocument;
  onRequestShare: (doc: DocumentSharePayload, resend: boolean) => void;
  onConfirmShare: () => void;
  onCancelConfirm: () => void;
  alreadySentPaths?: string[];
  sharingPath: string | null;
  confirmingPath: string | null;
  confirmingResend: boolean;
}) {
  const uploaded = formatChatDocumentUploadedAt(item.uploaded_at);
  const normalizedPath = normalizeTripDocumentsStoragePath(item.storage_path);
  const alreadySent = pathAlreadySent(item.storage_path, alreadySentPaths);
  const isSharing =
    sharingPath != null &&
    normalizeTripDocumentsStoragePath(sharingPath) === normalizedPath;
  const isConfirming =
    confirmingPath != null &&
    normalizeTripDocumentsStoragePath(confirmingPath) === normalizedPath;
  const actionsDisabled =
    (sharingPath != null && !isSharing) ||
    (confirmingPath != null && !isConfirming);

  const payload: DocumentSharePayload = {
    key: item.key,
    label: item.label,
    storage_path: item.storage_path,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    mime_type: item.mime_type,
    document_type: item.document_type,
  };

  const handleSend = () => {
    if (sharingPath || confirmingPath) return;
    onRequestShare(payload, false);
  };

  const handleSendAgain = () => {
    if (sharingPath || confirmingPath) return;
    onRequestShare(payload, true);
  };

  return (
    <View style={s.docRow}>
      <DocHubThumb item={item} />
      <View style={s.docTextCol}>
        <Text style={s.docLabel} numberOfLines={1}>
          {item.label}
        </Text>
        <View style={s.docMetaRow}>
          <View style={s.docEntityPill}>
            <Text style={s.docEntity}>{item.entity_type}</Text>
          </View>
          {uploaded ? (
            <>
              <Text style={s.docMetaDot}>·</Text>
              <Text style={s.docMeta} numberOfLines={1}>
                {uploaded}
              </Text>
            </>
          ) : null}
        </View>
      </View>
      <DocRowActions
        alreadySent={alreadySent}
        isSharing={isSharing}
        isConfirming={isConfirming}
        isResendConfirm={isConfirming && confirmingResend}
        disabled={actionsDisabled}
        onSend={handleSend}
        onSendAgain={handleSendAgain}
        onConfirmSend={onConfirmShare}
        onCancelConfirm={onCancelConfirm}
      />
    </View>
  );
}

export function DocumentShareSheet({
  visible,
  tripId,
  vehicleId,
  driverId,
  orgId,
  userId,
  onClose,
  onShare,
  alreadySentPaths = [],
}: DocumentShareSheetProps) {
  const [docs, setDocs] = useState<ChatHubDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sharingPath, setSharingPath] = useState<string | null>(null);
  const [confirmingPath, setConfirmingPath] = useState<string | null>(null);
  const [confirmingResend, setConfirmingResend] = useState(false);
  const [pendingShare, setPendingShare] = useState<DocumentSharePayload | null>(
    null,
  );
  const [sessionSentPaths, setSessionSentPaths] = useState<string[]>([]);
  const shareInFlightRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    try {
      const result = await listChatHubDocuments({
        tripId,
        vehicleId,
        driverId,
        orgId,
      });
      setDocs(result);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [visible, tripId, vehicleId, driverId, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!visible) {
      setSharingPath(null);
      setConfirmingPath(null);
      setConfirmingResend(false);
      setPendingShare(null);
      shareInFlightRef.current = null;
    }
  }, [visible]);

  const mergedSentPaths = useMemo(
    () => [...alreadySentPaths, ...sessionSentPaths],
    [alreadySentPaths, sessionSentPaths],
  );

  const clearConfirm = useCallback(() => {
    setConfirmingPath(null);
    setConfirmingResend(false);
    setPendingShare(null);
  }, []);

  const handleShare = useCallback(
    async (doc: DocumentSharePayload) => {
      const pathKey = normalizeTripDocumentsStoragePath(doc.storage_path);
      if (!pathKey || shareInFlightRef.current === pathKey) return;

      shareInFlightRef.current = pathKey;
      setSharingPath(doc.storage_path);
      clearConfirm();
      try {
        await Promise.resolve(onShare(doc));
        setSessionSentPaths((prev) =>
          prev.some((p) => normalizeTripDocumentsStoragePath(p) === pathKey)
            ? prev
            : [...prev, doc.storage_path],
        );
      } catch (e) {
        Alert.alert(
          "Could not send",
          e instanceof Error ? e.message : "Document was not shared in chat.",
        );
      } finally {
        shareInFlightRef.current = null;
        setSharingPath(null);
      }
    },
    [onShare, clearConfirm],
  );

  const requestShare = useCallback(
    (doc: DocumentSharePayload, resend: boolean) => {
      const pathKey = normalizeTripDocumentsStoragePath(doc.storage_path);
      if (!pathKey) return;
      if (
        shareInFlightRef.current === pathKey ||
        sharingPath != null ||
        confirmingPath != null
      ) {
        return;
      }

      setPendingShare(doc);
      setConfirmingResend(resend);
      setConfirmingPath(doc.storage_path);
    },
    [confirmingPath, sharingPath],
  );

  const confirmPendingShare = useCallback(() => {
    if (!pendingShare) {
      clearConfirm();
      return;
    }
    void handleShare(pendingShare);
  }, [pendingShare, handleShare, clearConfirm]);

  const sections = useMemo((): HubSection[] => {
    const grouped: Record<ChatHubEntityType, ChatHubDocument[]> = {
      trip: [],
      vehicle: [],
      driver: [],
    };
    for (const doc of docs) {
      grouped[doc.entity_type].push(doc);
    }
    return (["trip", "vehicle", "driver"] as ChatHubEntityType[]).map(
      (entity) => ({
        title: SECTION_META[entity].title,
        entity,
        data: grouped[entity],
      }),
    );
  }, [docs]);

  const showStructuredList = Boolean(tripId) || docs.length > 0;

  const handleUploadTripDoc = async () => {
    if (!tripId || !userId) {
      Alert.alert(
        "Cannot upload",
        "Open a trip conversation to attach trip documents.",
      );
      return;
    }
    try {
      const picked = await pickChatDocumentFile();
      if (!picked) return;
      setUploading(true);
      const { doc, error } = await uploadChatHubTripDocument({
        tripId,
        uploadedBy: userId,
        file: picked,
      });
      if (error || !doc) {
        Alert.alert("Upload failed", error?.message ?? "Could not upload file.");
        return;
      }
      await load();
      Alert.alert(
        "Document uploaded",
        "Tap Send when you are ready to share it in chat.",
      );
    } catch (e) {
      Alert.alert(
        "Upload failed",
        e instanceof Error ? e.message : "Something went wrong.",
      );
    } finally {
      setUploading(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={s.overlay} pointerEvents="box-none">
      <Pressable style={s.backdrop} onPress={onClose} accessibilityRole="button" />
      <View style={s.sheet}>
        <View style={s.handle} />

        <View style={s.header}>
          <View style={s.headerTextCol}>
            <Text style={s.title}>Documents</Text>
            <Text style={s.subtitle}>Share trip, vehicle, or driver files in chat</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={s.closeBtn}>
            <X size={18} color={CHAT_TEXT_MUTED} strokeWidth={2} />
          </Pressable>
        </View>

        {tripId ? (
          <View style={s.addWrap}>
            <Pressable
              style={({ pressed }) => [s.addRow, pressed && s.addRowPressed]}
              onPress={() => void handleUploadTripDoc()}
              disabled={uploading || sharingPath != null || confirmingPath != null}
            >
              <View style={s.addIcon}>
                {uploading ? (
                  <LoadingIndicator size="small" color={CHAT_ACCENT} />
                ) : (
                  <Plus size={16} color={CHAT_ACCENT} strokeWidth={2.4} />
                )}
              </View>
              <View style={s.addTextCol}>
                <Text style={s.addTitle}>Add trip document</Text>
                <Text style={s.addHint}>PDF or image · shared in this chat</Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={s.center}>
            <LoadingIndicator color={CHAT_ACCENT} />
          </View>
        ) : !showStructuredList ? (
          <View style={s.center}>
            <FileText size={28} color="#e2e8f0" />
            <Text style={s.emptyText}>No documents yet</Text>
            <Text style={s.emptyHint}>
              Select a trip thread to manage and share documents.
            </Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            style={s.list}
            contentContainerStyle={s.listContent}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => {
              const meta = SECTION_META[section.entity];
              const Icon = meta.Icon;
              return (
                <View style={s.sectionHeader}>
                  <View style={s.sectionTitleRow}>
                    <Icon size={12} color={CHAT_TEXT_MUTED} strokeWidth={2.2} />
                    <Text style={s.sectionTitle}>{section.title}</Text>
                  </View>
                  <View style={s.sectionCountPill}>
                    <Text style={s.sectionCount}>{section.data.length}</Text>
                  </View>
                </View>
              );
            }}
            renderSectionFooter={({ section }) =>
              section.data.length === 0 ? (
                <Text style={s.sectionEmpty}>
                  {section.entity === "vehicle" && !vehicleId
                    ? "No vehicle assigned to this trip."
                    : section.entity === "driver" && !driverId
                      ? "No driver assigned to this trip."
                      : SECTION_META[section.entity].empty}
                </Text>
              ) : null
            }
            renderItem={({ item }) => (
              <DocRow
                item={item}
                onRequestShare={requestShare}
                onConfirmShare={confirmPendingShare}
                onCancelConfirm={clearConfirm}
                alreadySentPaths={mergedSentPaths}
                sharingPath={sharingPath}
                confirmingPath={confirmingPath}
                confirmingResend={confirmingResend}
              />
            )}
            ListFooterComponent={<View style={{ height: 12 }} />}
          />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    justifyContent: "flex-end",
    ...(Platform.OS === "web"
      ? ({ alignItems: "center" } as object)
      : null),
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingHorizontal: 0,
    paddingBottom: 28,
    maxHeight: "78%",
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148, 163, 184, 0.28)",
    ...(Platform.OS === "web"
      ? ({
          maxWidth: 440,
          boxShadow: "0 -12px 40px rgba(15, 23, 42, 0.14)",
        } as object)
      : {
          shadowColor: "#0f172a",
          shadowOpacity: 0.12,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: -8 },
          elevation: 14,
        }),
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 10,
    paddingHorizontal: 16,
  },
  headerTextCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.35,
  },
  subtitle: {
    fontSize: 12,
    color: CHAT_TEXT_SECONDARY,
    marginTop: 3,
    lineHeight: 16,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  addWrap: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(91, 94, 244, 0.35)",
    backgroundColor: "rgba(91, 94, 244, 0.04)",
  },
  addRowPressed: { backgroundColor: "rgba(91, 94, 244, 0.08)" },
  addIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(91, 94, 244, 0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  addTextCol: { flex: 1, minWidth: 0 },
  addTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1d1c1d",
    letterSpacing: -0.1,
  },
  addHint: {
    fontSize: 11,
    color: CHAT_TEXT_MUTED,
    marginTop: 2,
  },
  center: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 8,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: SLACK_TYPE.listTitle,
    color: CHAT_TEXT_SECONDARY,
    fontWeight: "600",
  },
  emptyHint: {
    fontSize: SLACK_TYPE.listPreview,
    color: CHAT_TEXT_MUTED,
    textAlign: "center",
    lineHeight: 16,
  },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: 4, paddingHorizontal: 8 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 6,
    marginHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.55,
    textTransform: "uppercase",
  },
  sectionCountPill: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
  },
  sectionEmpty: {
    fontSize: 12,
    color: CHAT_TEXT_MUTED,
    lineHeight: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 8,
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#eef2f7",
    minHeight: 58,
  },
  docThumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    overflow: "hidden",
    flexShrink: 0,
    backgroundColor: "#f1f5f9",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  docThumbImage: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
  },
  docThumbIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  docThumbExt: {
    position: "absolute",
    bottom: 2,
    fontSize: 6,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  docTextCol: { flex: 1, minWidth: 0, gap: 4, justifyContent: "center" },
  docMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "nowrap",
  },
  docEntityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: "rgba(91, 94, 244, 0.08)",
  },
  docEntity: {
    fontSize: 9,
    fontWeight: "800",
    color: CHAT_ACCENT,
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  docLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
    lineHeight: 16,
    letterSpacing: -0.1,
  },
  docMetaDot: {
    fontSize: 11,
    color: "#cbd5e1",
    fontWeight: "700",
  },
  docMeta: {
    fontSize: 11,
    color: CHAT_TEXT_MUTED,
    flexShrink: 1,
    minWidth: 0,
  },
  actionsCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 5,
    flexShrink: 0,
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cancelConfirmBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  cancelConfirmText: {
    fontSize: 11,
    fontWeight: "700",
    color: CHAT_TEXT_MUTED,
  },
  confirmSendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: CHAT_ACCENT,
  },
  confirmSendText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  sentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(22, 163, 74, 0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(22, 163, 74, 0.22)",
  },
  sentPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#16a34a",
  },
  sendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: "rgba(91, 94, 244, 0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(91, 94, 244, 0.22)",
  },
  sendPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: CHAT_ACCENT,
  },
  sendAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(91, 94, 244, 0.24)",
  },
  sendAgainText: {
    fontSize: 10,
    fontWeight: "700",
    color: CHAT_ACCENT,
  },
  actionMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: CHAT_TEXT_MUTED,
  },
  actionPressed: { opacity: 0.82 },
  actionDisabled: { opacity: 0.45 },
});
