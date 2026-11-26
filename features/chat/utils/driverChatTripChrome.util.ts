/**
 * Driver chat trip chrome — active / completed tick + feedback star plan for
 * inbox rows and thread headers.
 */
import type {
  TripConversation,
  TripFeedbackLaneStatus,
  TripMessageRow,
} from "@/features/chat/types/chat.types";
import { isFeedbackRequestAlreadyRatedMeta } from "@/features/chat/utils/feedbackRequestMeta.util";
import { parseFeedbackRequestMetadata } from "@/features/chat/utils/feedbackRequestMeta";
import {
  findLatestMissionDebriefMessage,
  isMissionDebriefPreviewText,
} from "@/features/chat/utils/missionDebrief.util";
import {
  isHubActiveTripStatus,
  isTripFeedbackEligibleStatus,
} from "@/features/chat/utils/tripConversationSort";

export type DriverChatTripKind = "active" | "completed" | null;

export type DriverChatFeedbackChrome = {
  /** Show the feedback control (empty or filled star plan). */
  showStar: boolean;
  /** True when a rating is already on file. */
  starFilled: boolean;
  /** 1–5 when known; null when rated without a recoverable score. */
  starScore: number | null;
  /** Trip lifecycle badge for the row / header. */
  tripKind: DriverChatTripKind;
};

function coerceScore(raw: unknown): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

/** Score from feedback / mission-debrief message metadata (any message_type). */
export function extractFeedbackScoreFromMessage(
  message: Pick<TripMessageRow, "message_type" | "metadata"> | null | undefined,
): number | null {
  if (!message) return null;
  const mt = String(message.message_type ?? "")
    .trim()
    .toLowerCase();
  if (mt === "feedback_request" || mt === "feedback") {
    const parsed = parseFeedbackRequestMetadata(message);
    const fromParsed = coerceScore(parsed?.submitted_score ?? parsed?.rating);
    if (fromParsed != null) return fromParsed;
  }
  const raw =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : {};
  return coerceScore(raw.submitted_score ?? raw.rating);
}

export function isFeedbackRatedFromMessage(
  message: Pick<TripMessageRow, "message_type" | "metadata"> | null | undefined,
): boolean {
  if (!message) return false;
  const parsed = parseFeedbackRequestMetadata(message);
  if (isFeedbackRequestAlreadyRatedMeta(parsed)) return true;
  const raw =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : {};
  if (typeof raw.submitted_at === "string" && raw.submitted_at.trim()) return true;
  if (String(raw.rating_status ?? "").trim().toLowerCase() === "rated") return true;
  return extractFeedbackScoreFromMessage(message) != null;
}

/**
 * Derive lane feedback status from bootstrap field + latest debrief message.
 * Prefers explicit `trip_feedback_status` when present.
 */
export function resolveTripFeedbackLaneStatus(
  conv: Pick<TripConversation, "trip_feedback_status" | "messages" | "last_message_preview">,
  debriefMsg?: TripMessageRow | null,
): TripFeedbackLaneStatus {
  const explicit = conv.trip_feedback_status;
  if (explicit === "rated" || explicit === "pending" || explicit === "none") {
    if (explicit === "rated") return "rated";
    if (explicit === "pending") {
      const msg = debriefMsg ?? findLatestMissionDebriefMessage(conv.messages);
      if (isFeedbackRatedFromMessage(msg)) return "rated";
      return "pending";
    }
  }
  const msg = debriefMsg ?? findLatestMissionDebriefMessage(conv.messages);
  if (isFeedbackRatedFromMessage(msg)) return "rated";
  if (msg || isMissionDebriefPreviewText(conv.last_message_preview)) return "pending";
  return "none";
}

export function resolveDriverChatTripKind(
  tripStatus: string | null | undefined,
): DriverChatTripKind {
  if (isTripFeedbackEligibleStatus(tripStatus)) return "completed";
  if (isHubActiveTripStatus(tripStatus)) return "active";
  return null;
}

/** Inbox / thread chrome for a driver trip conversation. */
export function resolveDriverChatFeedbackChrome(
  conv: Pick<
    TripConversation,
    | "trip_status"
    | "trip_feedback_status"
    | "messages"
    | "last_message_preview"
  >,
): DriverChatFeedbackChrome {
  const debriefMsg = findLatestMissionDebriefMessage(conv.messages);
  const lane = resolveTripFeedbackLaneStatus(conv, debriefMsg);
  const tripKind = resolveDriverChatTripKind(conv.trip_status);
  const starScore =
    lane === "rated" ? extractFeedbackScoreFromMessage(debriefMsg) : null;

  // Completed trips always expose the star control (empty = rate, filled = on file).
  const showStar = lane === "pending" || lane === "rated" || tripKind === "completed";

  return {
    showStar,
    starFilled: lane === "rated",
    starScore,
    tripKind,
  };
}
