/**
 * Smart system card when a driver rolls a trip stage back (undo).
 * Matches the TripProgressEventCard shell used for accept / transit updates.
 */
import Theme from "@/constants/Theme";
import {
  formatTripEventSheetDate,
  TripProgressEventCard,
} from "@/features/chat/components/ChatEventCard";
import type { TripMessageRow } from "@/features/chat/types/chat.types";
import {
  parseStageRevokeDisplay,
} from "@/features/chat/utils/stageRevokeChat.util";
import {
  resolveSystemUpdateDriverAvatar,
  type SystemUpdateDriverContext,
} from "@/features/chat/utils/chatAvatar.util";
import { Undo2 } from "lucide-react-native";

type Props = {
  message: TripMessageRow;
  composeTrip?: SystemUpdateDriverContext["composeTrip"];
  /** Lightweight path for notes-only rows (no TripMessageRow). */
  noteFallback?: {
    message: string;
    at: string;
    driverName?: string | null;
  } | null;
};

const REVOKE_VISUAL = {
  Icon: Undo2,
  color: Theme.warning,
  bg: Theme.warningMuted,
  sheetLabel: "Rolled back",
  rightWord: "UNDO",
  rightColor: Theme.warning,
} as const;

export function ChatStageRevokeCard({
  message,
  composeTrip,
  noteFallback = null,
}: Props) {
  const parsed = noteFallback
    ? (() => {
        const raw = noteFallback.message.trim();
        const reason =
          raw.match(/—\s*(.+)$/)?.[1]?.trim() ||
          raw.replace(/^stage revoked\s*[—\-:]?\s*/i, "").trim() ||
          null;
        return {
          title: raw.replace(
            /^stage revoked\s*[—\-:]?\s*/i,
            "Stepped back — ",
          ),
          reason,
          toLabel: null as string | null,
          driverName: noteFallback.driverName ?? null,
        };
      })()
    : parseStageRevokeDisplay(message);

  const createdAt = noteFallback?.at ?? message.created_at;
  let displayTime = "";
  try {
    displayTime = new Date(createdAt).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    displayTime = "";
  }

  const dateUpper = formatTripEventSheetDate(createdAt);
  const driverAvatar = noteFallback
    ? null
    : resolveSystemUpdateDriverAvatar(message, { composeTrip });
  const seed =
    driverAvatar?.displayName?.trim() ||
    parsed.driverName?.trim() ||
    composeTrip?.driver_display_name?.trim() ||
    "Driver";

  const subBits = [
    parsed.reason ? `Reason: ${parsed.reason}` : null,
    parsed.toLabel ? `Now at ${parsed.toLabel}` : null,
  ].filter(Boolean);

  return (
    <TripProgressEventCard
      avatarSeed={seed}
      avatarIdentity={driverAvatar}
      eventKind="status"
      statusVisual={REVOKE_VISUAL}
      kicker="STAGE UPDATE"
      title={parsed.title}
      subLine={subBits.length ? subBits.join(" · ") : "Driver undid the last stage"}
      metaLine={`${dateUpper} · ROLLED BACK`}
      rightPrimary="UNDO"
      rightPrimaryColor={Theme.warning}
      time={displayTime}
    />
  );
}
