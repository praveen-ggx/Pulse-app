/**
 * Global driver shell host — pops a toast when the shipper / commercial side
 * sends a new trip-chat message (never for the driver’s own sends).
 *
 * “Later” parks the toast as a floating unread chip (mild motion) until tapped.
 * Also responds to shipper “Ping location” and shows a shared-location toast.
 * Exposes unreadTotal for chrome (e.g. DriverHeader badge).
 */
import { DriverIncomingMessageFab } from "@/features/chat/components/driver/DriverIncomingMessageFab";
import { DriverIncomingMessagePopup } from "@/features/chat/components/driver/DriverIncomingMessagePopup";
import { DriverLocationSharedToast } from "@/features/chat/components/driver/DriverLocationSharedToast";
import {
  useDriverIncomingMessageAlerts,
  type DriverIncomingAlert,
} from "@/features/chat/hooks/useDriverIncomingMessageAlerts";
import { useOptionalDriverChat } from "@/features/chat/contexts/DriverChatContext";
import * as chatService from "@/features/chat/services/chat.service";
import { compressAndUploadChatImage } from "@/features/chat/utils/chatImageUpload.util";
import { useAuth } from "@/contexts/AuthContext";
import { useDriverRespondToShipperLocationPing } from "@/features/driver/hooks/useDriverRespondToShipperLocationPing";
import { usePathname, useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

type IncomingMessageCtx = {
  unreadTotal: number;
};

const Ctx = createContext<IncomingMessageCtx>({ unreadTotal: 0 });

export function useDriverIncomingMessageUnread(): number {
  return useContext(Ctx).unreadTotal;
}

export function DriverIncomingMessageProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useAuth();
  const driverChat = useOptionalDriverChat();
  const {
    alert,
    unreadTotal,
    snoozedCount,
    parkedAlert,
    snooze,
    restoreSnoozed,
    acknowledge,
  } = useDriverIncomingMessageAlerts();

  const onChatRoute =
    typeof pathname === "string" && pathname.includes("/chat");

  const pingTrips = useMemo(
    () =>
      (driverChat?.conversations ?? []).map((c) => ({
        tripId: c.trip_id,
        conversationId: c.id,
        organizationId: c.organization_id,
        driverId: c.driver_id ?? null,
        tripStatus: c.trip_status ?? null,
      })),
    [driverChat?.conversations],
  );

  const { sharedToast, dismissSharedToast } =
    useDriverRespondToShipperLocationPing({
      trips: pingTrips,
      ownerUserId: profile?.uid ?? null,
      enabled: Boolean(driverChat),
      driverDisplayName:
        profile?.full_name ?? profile?.displayName ?? null,
    });

  const handleOpen = useCallback(
    (next: DriverIncomingAlert) => {
      void acknowledge(next.conversationId, next.at);
      if (next.tripId) {
        router.push({
          pathname: "/(driver)/chat",
          params: { tripId: next.tripId },
        } as Parameters<typeof router.push>[0]);
        return;
      }
      router.push("/(driver)/chat" as Parameters<typeof router.push>[0]);
    },
    [acknowledge, router],
  );

  const handleReply = useCallback(
    async (next: DriverIncomingAlert, text: string) => {
      if (!driverChat?.sendMessage) return false;
      const orgId = next.organizationId.trim();
      if (!orgId || !next.conversationId) return false;
      const ok = await driverChat.sendMessage(
        next.conversationId,
        orgId,
        text,
      );
      if (ok) {
        // Mark inbound seen; popup keeps a frozen copy for the “Sent” beat.
        void acknowledge(next.conversationId, next.at);
      }
      return ok;
    },
    [acknowledge, driverChat],
  );

  const handleSendPhoto = useCallback(
    async (next: DriverIncomingAlert, localUri: string) => {
      const orgId = next.organizationId.trim();
      if (!orgId || !next.conversationId || !localUri.trim()) return false;
      try {
        const { storagePath, thumbUrl } = await compressAndUploadChatImage(
          localUri,
          next.conversationId,
        );
        const senderName =
          profile?.full_name?.trim() ||
          profile?.displayName?.trim() ||
          "Driver";
        await chatService.sendChatMessage({
          conversationId: next.conversationId,
          organizationId: orgId,
          content: "Photo",
          senderRole: "driver",
          senderName,
          senderUserId: profile?.uid ?? null,
          messageType: "document_share",
          metadata: {
            document_name: "Photo",
            document_type: "Photo",
            storage_path: storagePath,
            mime_type: "image/jpeg",
            ...(thumbUrl ? { thumb_url: thumbUrl } : {}),
          },
        });
        void acknowledge(next.conversationId, next.at);
        void driverChat?.refreshConversations?.();
        return true;
      } catch {
        return false;
      }
    },
    [acknowledge, driverChat, profile],
  );

  const showFab = !onChatRoute && !alert && snoozedCount > 0;

  return (
    <Ctx.Provider value={{ unreadTotal }}>
      {children}
      <DriverLocationSharedToast
        toast={sharedToast}
        onDismiss={dismissSharedToast}
      />
      {!onChatRoute ? (
        <DriverIncomingMessagePopup
          alert={alert}
          onOpen={handleOpen}
          onDismiss={snooze}
          onLater={snooze}
          onReply={handleReply}
          onSendPhoto={handleSendPhoto}
        />
      ) : null}
      {showFab ? (
        <DriverIncomingMessageFab
          count={snoozedCount}
          preview={parkedAlert}
          onPress={restoreSnoozed}
        />
      ) : null}
    </Ctx.Provider>
  );
}
