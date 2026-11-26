/**
 * SystemEventCard — unified renderer for all non-text message_type variants.
 *
 * Acts as the single routing layer between a TripMessageRow and the correct
 * visual component.  The chat screen's render function calls this for every
 * message that is NOT a plain "text" bubble; it never inspects message_type
 * directly.
 *
 * Routing table:
 *   status_change    → payment-style row (TripProgressEventCard; same shell as ledger)
 *   image            → ImageMessageCard  (Supabase Image Transformations thumbnail + full-size modal)
 *   document_share   → DocumentShareCard (delegated)
 *   feedback_request → hidden in chat (trip-detail TripFeedbackModal handles ratings)
 *   ledger_event     → ChatLedgerEventCard (delegated)
 *   system / update  → ChatSystemEventCard (content-based fallback)
 *   text / other     → null (rendered as a normal chat bubble)
 */
import React from 'react';
import {
  StyleSheet,
  View,
} from 'react-native';
import type {
  ImageMessageMetadata,
  StatusChangeMetadata,
  TrackingMetadata,
  TripMessageRow,
} from '../types/chat.types';
import { OptimizedChatImage } from './OptimizedChatImage';
import { CHAT_ACCENT } from '@/features/chat/chatTheme';
import {
  ChatSystemEventCard,
  TripProgressEventCard,
  formatTripEventSheetDate,
  getStatusEventSheetVisuals,
} from './ChatEventCard';
import type { TripForCompose } from '../services/chat.service';
import { resolveSystemUpdateDriverAvatar } from '../utils/chatAvatar.util';

// ── StatusChangeCard ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  at_drop: 'At Drop',
  completed: 'Completed',
  cancelled: 'Cancelled',
  started: 'Started',
  delivered: 'Delivered',
};

function isGenericStatusActor(name: string | null | undefined): boolean {
  const n = (name ?? '').trim().toLowerCase();
  return !n || n === 'system' || n === 'dispatcher';
}

/** Human line for trip lane (reference: one narrative + timestamp). */
function statusChangeNarrative(message: TripMessageRow, statusKey: string): string {
  const meta = message.metadata as StatusChangeMetadata | null;
  const content = (message.content ?? '').trim();

  if (content.length > 0 && /accepted the trip|heading to pickup/i.test(content)) {
    return content;
  }

  const rawName = meta?.changed_by_name?.trim();
  const actor = isGenericStatusActor(rawName) ? null : rawName;
  const who = actor ?? 'The driver';

  switch (statusKey) {
    case 'in_progress':
      return actor
        ? `${actor} has accepted the trip and is heading to pickup.`
        : 'The trip was accepted and the driver is heading to pickup.';
    case 'assigned':
      return actor
        ? `${actor} was assigned to this trip.`
        : 'A driver was assigned to this trip.';
    case 'picked_up':
      return `${who} picked up the load.`;
    case 'in_transit':
      return `${who} is in transit.`;
    case 'at_drop':
      return `${who} arrived at drop-off.`;
    case 'completed':
      return actor ? `Trip completed. Confirmed by ${actor}.` : 'Trip completed.';
    case 'cancelled':
      return actor ? `Trip cancelled by ${actor}.` : 'Trip was cancelled.';
    case 'started':
      return actor
        ? `${actor} started the trip.`
        : 'The trip was started.';
    case 'delivered':
      return actor ? `${actor} confirmed delivery.` : 'Delivery was confirmed.';
    case 'pending':
      return 'Trip is pending assignment.';
    default:
      return content || 'Trip status was updated.';
  }
}

function StatusChangeCard({
  message,
  composeTrip,
}: {
  message: TripMessageRow;
  isMobile?: boolean;
  routeContext?: string | null;
  composeTrip?: Pick<TripForCompose, "driver_id" | "driver_display_name"> | null;
}) {
  const meta = message.metadata as StatusChangeMetadata | null;

  const statusKey = meta?.new_status ?? "default";
  const statusLabel = STATUS_LABELS[statusKey] ?? statusKey;
  const sheet = getStatusEventSheetVisuals(statusKey);

  const bodyText = statusChangeNarrative(message, statusKey);

  let displayTime = "";
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    /* keep empty */
  }

  const dateUpper = formatTripEventSheetDate(message.created_at);
  const metaLine = `${dateUpper} · ${statusLabel.toUpperCase()}`;
  const driverAvatar = resolveSystemUpdateDriverAvatar(message, { composeTrip });
  const seed =
    driverAvatar?.displayName?.trim() ||
    composeTrip?.driver_display_name?.trim() ||
    bodyText.match(/\b(TRP[-A-Z0-9]+)\b/i)?.[1]?.toUpperCase() ||
    "Trip";

  return (
    <TripProgressEventCard
      avatarSeed={seed}
      avatarIdentity={driverAvatar}
      eventKind="status"
      statusVisual={sheet}
      kicker="SYSTEM UPDATE"
      title={bodyText}
      metaLine={metaLine}
      rightPrimary={sheet.rightWord}
      rightPrimaryColor={sheet.rightColor}
      time={displayTime}
    />
  );
}

// ── ImageMessageCard ──────────────────────────────────────────────────────────

function ImageMessageCard({ message, isOwn }: { message: TripMessageRow; isOwn: boolean }) {
  // Image storage path may be in metadata.storage_path or in message.content.
  const meta = message.metadata as ImageMessageMetadata | null;
  const storagePath = meta?.storage_path || message.content;
  if (!storagePath) return null;

  return (
    <View style={sc.imageWrap}>
      {/* OptimizedChatImage: signed URL for RLS-gated trip-documents (no public CDN). */}
      <OptimizedChatImage message={message} storagePath={storagePath} isOwn={isOwn} />
    </View>
  );
}

// ── TrackingCard ──────────────────────────────────────────────────────────────

function TrackingCard({
  message,
  composeTrip,
}: {
  message: TripMessageRow;
  isMobile?: boolean;
  routeContext?: string | null;
  composeTrip?: Pick<TripForCompose, "driver_id" | "driver_display_name"> | null;
}) {
  let rawMeta: unknown = message.metadata;
  if (typeof rawMeta === "string") {
    try {
      rawMeta = JSON.parse(rawMeta) as unknown;
    } catch {
      return null;
    }
  }
  const meta = rawMeta as TrackingMetadata | null;
  const lat = Number(meta?.lat);
  const lng = Number(meta?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  let displayTime = "";
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    /* keep empty */
  }

  const eta =
    meta?.eta_label ?? (meta?.eta_minutes != null ? `${meta.eta_minutes} min` : null);
  const dateUpper = formatTripEventSheetDate(message.created_at);
  const title = (meta?.address_hint ?? "Driver location update").trim();
  const metaLine = `${dateUpper} · DRIVER LOCATION`;
  const driverAvatar = resolveSystemUpdateDriverAvatar(message, { composeTrip });

  const avatarSeed =
    driverAvatar?.displayName?.trim() ||
    composeTrip?.driver_display_name?.trim() ||
    "Location";

  return (
    <TripProgressEventCard
      avatarSeed={avatarSeed}
      avatarIdentity={driverAvatar}
      eventKind="tracking"
      kicker="SYSTEM UPDATE"
      title={title}
      metaLine={metaLine}
      rightPrimary={(eta ?? "TRACK").toUpperCase()}
      rightPrimaryColor={CHAT_ACCENT}
      time={displayTime}
    />
  );
}

// ── SystemEventCard (public) ──────────────────────────────────────────────────

interface SystemEventCardProps {
  message: TripMessageRow;
  /** Whether this message was sent by the current user (affects image styling). */
  isOwn?: boolean;
  /** For ledger and feedback cards that need the caller's org context. */
  currentOrgId?: string;
  conversationPartyName?: string | null;
  // Ledger card callbacks
  onAddToBook?: (msg: TripMessageRow) => void;
  onDispute?:   (msg: TripMessageRow) => void;
  readOnly?: boolean;
  /** When true, ledger/payment rows are hidden (e.g. driver financial shield). */
  financialViewerBlocked?: boolean;
  /** When true, ledger card renders without Add to book / Dispute (indent-lane-only actions). */
  hideLedgerActions?: boolean;
  /** Compact full-width layout for native / narrow chat threads. */
  isMobile?: boolean;
  routeContext?: string | null;
  composeTrip?: Pick<TripForCompose, "driver_id" | "driver_display_name"> | null;
  // Feedback card callback
  onFeedbackSubmit?: (score: number, tags: string[]) => Promise<void>;
}

export const SystemEventCard = React.memo(function SystemEventCard({
  message,
  isOwn = false,
  currentOrgId,
  conversationPartyName,
  onAddToBook,
  onDispute,
  readOnly,
  financialViewerBlocked,
  hideLedgerActions,
  isMobile = false,
  routeContext,
  composeTrip,
}: SystemEventCardProps) {
  switch (message.message_type) {
    case 'status_change':
      return (
        <StatusChangeCard
          message={message}
          isMobile={isMobile}
          routeContext={routeContext}
          composeTrip={composeTrip}
        />
      );

    case 'tracking':
      return (
        <TrackingCard
          message={message}
          isMobile={isMobile}
          routeContext={routeContext}
          composeTrip={composeTrip}
        />
      );

    case 'image':
      return <ImageMessageCard message={message} isOwn={isOwn} />;

    case 'document_share': {
      // DocumentShareCard is a heavier component with its own lazy imports.
      // Import it lazily only when needed to avoid bundling its deps upfront.
      // We render a placeholder if the component is not yet loaded — the card
      // handles its own async resolution internally.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require for bundle splitting
      const DocumentShareCard = require('./DocumentShareCard').DocumentShareCard;
      return <DocumentShareCard message={message} />;
    }

    case 'ledger_event':
    case 'ledger': {
      if (financialViewerBlocked) return null;
      if (!currentOrgId || !onAddToBook || !onDispute) return null;
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require for bundle splitting
      const { ChatLedgerEventCard } = require('./ChatEventCard');
      return (
        <ChatLedgerEventCard
          message={message}
          currentOrgId={currentOrgId}
          conversationPartyName={conversationPartyName}
          onAddToBook={onAddToBook}
          onDispute={onDispute}
          readOnly={readOnly}
          hideLedgerActions={hideLedgerActions}
          isMobile={isMobile}
        />
      );
    }

    case 'system':
    case 'update': {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- keep SystemEventCard light
      const { isStageRevokeChatMessage } = require('../utils/stageRevokeChat.util') as {
        isStageRevokeChatMessage: (m: TripMessageRow) => boolean;
      };
      if (isStageRevokeChatMessage(message)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy card
        const { ChatStageRevokeCard } = require('./ChatStageRevokeCard') as {
          ChatStageRevokeCard: React.ComponentType<{
            message: TripMessageRow;
            composeTrip?: SystemEventCardProps['composeTrip'];
          }>;
        };
        return (
          <ChatStageRevokeCard message={message} composeTrip={composeTrip} />
        );
      }
      return (
        <ChatSystemEventCard
          message={message}
          isMobile={isMobile}
          routeContext={routeContext}
          composeTrip={composeTrip}
        />
      );
    }

    default:
      // text, question, challenge, feedback_request — rendered as chat bubbles elsewhere
      return null;
  }
});

// ── Styles ────────────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
  imageWrap: {
    borderRadius: 14,
    overflow: "hidden",
    maxWidth: 260,
  },
});
