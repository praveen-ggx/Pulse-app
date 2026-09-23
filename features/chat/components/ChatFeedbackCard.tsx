import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Building2, CheckCircle, Send, Star } from "lucide-react-native";
import Theme from "@/constants/Theme";
import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import { formatChatPartyName } from "@/features/chat/utils/partyDisplay";
import { submitDriverShipperFeedback } from "@/features/ratings/services/ratings.service";
import { useChatStore } from "../store/useChatStore";
import type { TripMessageRow } from "../types/chat.types";
import { parseFeedbackRequestMetadata } from "../utils/feedbackRequestMeta";
import { isFeedbackRequestAlreadyRatedMeta } from "../utils/feedbackRequestMeta.util";

/** Five stars → 1–5 scale; persisted via `confirm_trip_feedback` / `submit_atomic_feedback`. */
const STAR_OPTIONS = [
  { score: 1, label: "Terrible", a11y: "Terrible, 1 of 5" },
  { score: 2, label: "Poor", a11y: "Poor, 2 of 5" },
  { score: 3, label: "Fair", a11y: "Average, 3 of 5" },
  { score: 4, label: "Good", a11y: "Good, 4 of 5" },
  { score: 5, label: "Excellent", a11y: "Excellent, 5 of 5" },
] as const;

type FeedbackCardPhase =
  | "pick"
  | "confirm"
  | "submitting"
  | "success"
  | "already_rated";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function isAlreadySubmittedMessage(s: string): boolean {
  return /already_submitted|feedback already submitted/i.test(s);
}

function labelForScore(score: number): string {
  const row = STAR_OPTIONS.find((o) => o.score === score);
  return row?.label ?? "Rated";
}

export function ChatFeedbackCard({
  message = null,
  tripId,
  ratingOrganizationId = "",
  currentOrgId = "",
  onSubmitted,
  audience = "org",
  targetNameOverride,
  presentation = "thread",
}: {
  message?: TripMessageRow | null;
  tripId: string;
  /** Fleet org that owns the trip (`trips.organization_id`); must match viewer to submit. */
  ratingOrganizationId?: string;
  currentOrgId?: string;
  onSubmitted: () => void;
  /** Driver thread rates the shipper; org thread uses trip-owner confirm_trip_feedback. */
  audience?: "org" | "driver";
  targetNameOverride?: string;
  /** `modal` flattens chrome for TripFeedbackModal. */
  presentation?: "thread" | "modal";
}) {
  const meta = useMemo(
    () => (message ? parseFeedbackRequestMetadata(message) : null),
    [message],
  );

  const [phase, setPhase] = useState<FeedbackCardPhase>(() => {
    if (isFeedbackRequestAlreadyRatedMeta(meta)) return "already_rated";
    const raw = (message?.metadata ?? {}) as Record<string, unknown>;
    if (typeof raw.submitted_at === "string" && raw.submitted_at.trim()) {
      return "already_rated";
    }
    return "pick";
  });
  const [pickedScore, setPickedScore] = useState<number | null>(() => {
    if (!meta) return null;
    const s = meta.submitted_score ?? meta.rating;
    return typeof s === "number" && s >= 1 && s <= 5 ? s : null;
  });
  const [feedbackComment, setFeedbackComment] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!message) {
      setPhase((p) => {
        if (p === "success" || p === "submitting" || p === "confirm") return p;
        return "pick";
      });
      return;
    }
    const m = parseFeedbackRequestMetadata(message);
    const raw = (message.metadata ?? {}) as Record<string, unknown>;
    const rawScore = Number(raw.submitted_score ?? raw.rating);
    if (m) {
      const s = m.submitted_score ?? m.rating;
      setPickedScore(typeof s === "number" && s >= 1 && s <= 5 ? s : null);
    } else if (Number.isFinite(rawScore) && rawScore >= 1 && rawScore <= 5) {
      setPickedScore(rawScore);
    }
    setPhase((p) => {
      if (isFeedbackRequestAlreadyRatedMeta(m)) return "already_rated";
      if (typeof raw.submitted_at === "string" && raw.submitted_at.trim()) {
        return "already_rated";
      }
      if (p === "success" || p === "submitting" || p === "confirm") return p;
      return "pick";
    });
  }, [message]);

  const ownerOrg = (ratingOrganizationId ?? "").trim();
  const viewerOrg = currentOrgId.trim();
  const canSubmit =
    audience === "driver" ? true : !ownerOrg || viewerOrg === ownerOrg;

  const targetName =
    (targetNameOverride ?? "").trim() ||
    formatChatPartyName(meta?.rated_display_name ?? "");

  const onPickSmiley = useCallback((score: number) => {
    if (!canSubmit) return;
    if (audience !== "driver" && !meta) return;
    if (phase !== "pick") return;
    setErr(null);
    setPickedScore(score);
    setPhase("confirm");
  }, [audience, meta, canSubmit, phase]);

  const onCancelConfirm = useCallback(() => {
    setFeedbackComment("");
    setPickedScore(null);
    setErr(null);
    const m = message ? parseFeedbackRequestMetadata(message) : null;
    setPhase(isFeedbackRequestAlreadyRatedMeta(m) ? "already_rated" : "pick");
  }, [message]);

  const onSubmitDebrief = useCallback(async () => {
    if (!canSubmit || pickedScore == null) return;
    // The non-driver path submits against a specific message id, so it needs a
    // real message. The driver path above tolerates a null one (messageId is
    // passed as `message?.id ?? null`).
    if (audience !== "driver" && (!meta || !message)) return;
    setErr(null);
    setPhase("submitting");

    if (audience === "driver") {
      const { error } = await submitDriverShipperFeedback({
        tripId,
        messageId: message?.id ?? null,
        score: pickedScore,
        comment: feedbackComment.trim() || null,
      });
      if (error) {
        if (isAlreadySubmittedMessage(error.message)) {
          setPhase("success");
          onSubmitted();
          return;
        }
        setPhase("confirm");
        setErr(error.message);
        return;
      }
      setPhase("success");
      onSubmitted();
      return;
    }

    // Narrowed via the `!message` guard at the top of this callback; the local
    // makes that narrowing survive the intervening awaits.
    const messageId = message?.id;
    if (!messageId) return;
    const { error } = await useChatStore
      .getState()
      .submitSmileyFeedback(messageId, pickedScore, {
        comment: feedbackComment.trim() || undefined,
      });

    if (error) {
      if (isAlreadySubmittedMessage(error)) {
        setPhase("success");
        onSubmitted();
        return;
      }
      setPhase("confirm");
      setErr(error);
      return;
    }
    setPhase("success");
    onSubmitted();
  }, [
    audience,
    meta,
    canSubmit,
    pickedScore,
    message?.id,
    tripId,
    feedbackComment,
    onSubmitted,
  ]);

  if (!meta && audience !== "driver") return null;

  const displayScore =
    phase === "already_rated"
      ? (meta?.submitted_score ?? meta?.rating ?? pickedScore ?? 0)
      : (pickedScore ?? 0);

  return (
    <View style={[s.wrap, presentation === "modal" && s.wrapModal]}>
      <View style={s.headerRow}>
        <View style={s.kickerCol}>
          <View style={s.kickerRow}>
            <Star size={11} color={CHAT_ACCENT} fill={CHAT_ACCENT} />
            <Text style={s.kicker}>PULSE CHAT REVIEW</Text>
          </View>
          <Text style={s.title}>How was the coordination?</Text>
          {targetName ? (
            <View style={s.targetRow}>
              <Building2 size={12} color={Theme.textMuted} strokeWidth={2.2} />
              <Text style={s.target} numberOfLines={2}>
                {targetName}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={s.sheetPill}>
          <Text style={s.sheetPillText}>SYSTEM GENERATED</Text>
        </View>
      </View>

      {phase === "pick" ? (
        <>
          <Text style={s.hint} numberOfLines={3}>
            Trip closed — tap a star (1–5) to record your rating.
          </Text>
          <View style={s.smileyRow}>
            {STAR_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.score}
                style={s.smileyBtn}
                onPress={() => onPickSmiley(opt.score)}
                disabled={!canSubmit}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={opt.a11y}
              >
                <Star
                  size={22}
                  color={
                    pickedScore != null && opt.score <= pickedScore
                      ? CHAT_ACCENT
                      : Theme.borderLight
                  }
                  fill={
                    pickedScore != null && opt.score <= pickedScore
                      ? CHAT_ACCENT
                      : "transparent"
                  }
                  strokeWidth={1.8}
                />
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}

      {phase === "confirm" ? (
        <>
          <View style={s.confirmBanner}>
            <View style={s.confirmStars}>
              {STAR_OPTIONS.map((opt) => (
                <Star
                  key={opt.score}
                  size={20}
                  color={
                    pickedScore != null && opt.score <= pickedScore
                      ? CHAT_ACCENT
                      : Theme.borderLight
                  }
                  fill={
                    pickedScore != null && opt.score <= pickedScore
                      ? CHAT_ACCENT
                      : "transparent"
                  }
                  strokeWidth={1.8}
                />
              ))}
            </View>
            <View style={s.confirmTextCol}>
              <Text style={s.confirmTitle} numberOfLines={2}>
                You selected {labelForScore(pickedScore ?? 0)} (
                {pickedScore}/5)
              </Text>
              <Text style={s.confirmHint} numberOfLines={2}>
                Care to share more details about your experience?
              </Text>
            </View>
          </View>
          <TextInput
            style={s.commentInput}
            value={feedbackComment}
            onChangeText={setFeedbackComment}
            placeholder={
              targetName
                ? `Add an optional comment for ${targetName}…`
                : "Add an optional comment…"
            }
            placeholderTextColor={Theme.textMuted}
            multiline
            editable={canSubmit}
            maxLength={2000}
            textAlignVertical="top"
          />
          <View style={s.confirmActions}>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={onCancelConfirm}
              activeOpacity={0.85}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
              onPress={() => void onSubmitDebrief()}
              disabled={!canSubmit}
              activeOpacity={0.88}
            >
              <Text style={s.submitBtnText}>Submit debrief</Text>
              <Send size={14} color="#fff" strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      {phase === "submitting" ? (
        <View style={s.inlineSpinner}>
          <LoadingIndicator size="small" color={CHAT_ACCENT} />
          <Text style={s.submittingLabel}>Submitting…</Text>
        </View>
      ) : null}

      {err ? <Text style={s.err}>{err}</Text> : null}

      {!canSubmit && (phase === "pick" || phase === "confirm") ? (
        <Text style={s.readOnly}>
          Only the trip owner organization can submit this debrief.
        </Text>
      ) : null}

      {phase === "success" ? (
        <View style={s.successBlock}>
          <View style={s.successIconRing}>
            <CheckCircle size={36} color="#059669" strokeWidth={2.4} />
          </View>
          <Text style={s.successTitle}>Debrief submitted</Text>
          <Text style={s.successBody}>
            Thank you for your rating
            {targetName ? ` of ${targetName}` : ""}. Your feedback helps maintain
            network quality.
          </Text>
        </View>
      ) : null}

      {phase === "already_rated" ? (
        <View style={s.doneBlock}>
          <View style={s.confirmStars}>
            {STAR_OPTIONS.map((opt) => (
              <Star
                key={opt.score}
                size={18}
                color={
                  displayScore >= opt.score ? CHAT_ACCENT : Theme.borderLight
                }
                fill={
                  displayScore >= opt.score ? CHAT_ACCENT : "transparent"
                }
                strokeWidth={1.8}
              />
            ))}
          </View>
          <View style={s.doneRow}>
            <CheckCircle size={16} color={CHAT_ACCENT} strokeWidth={2.4} />
            <Text style={s.doneText}>
              Feedback on file
              {displayScore > 0 ? ` · ${displayScore}/5` : ""}
            </Text>
          </View>
        </View>
      ) : null}

      {message?.created_at && presentation !== "modal" ? (
        <View style={s.footerRow}>
          <Text style={s.time}>{formatTime(message.created_at)}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** @deprecated Prefer `ChatFeedbackCard` — kept for legacy imports. */
export const ChatTripFeedbackCard = ChatFeedbackCard;

const s = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    maxWidth: 360,
    width: "100%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(67, 56, 202, 0.14)",
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginVertical: 8,
    shadowColor: "#4D3636",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  wrapModal: {
    maxWidth: "100%",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    marginVertical: 0,
    paddingVertical: 18,
    paddingHorizontal: 16,
    paddingTop: 22,
    shadowOpacity: 0,
    elevation: 0,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  kickerCol: { flex: 1, minWidth: 0 },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "900",
    color: CHAT_ACCENT,
    letterSpacing: 1.4,
  },
  title: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.35,
    lineHeight: 20,
  },
  targetRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  target: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  sheetPill: {
    backgroundColor: CHAT_ACCENT_SOFT,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(67, 56, 202, 0.12)",
  },
  sheetPillText: {
    fontSize: 8,
    fontWeight: "900",
    color: CHAT_ACCENT,
    letterSpacing: 0.8,
  },
  hint: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
    lineHeight: 17,
  },
  smileyRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    backgroundColor: "#f4f6f8",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    padding: 12,
  },
  smileyBtn: {
    flex: 1,
    minWidth: 0,
    aspectRatio: 1,
    maxHeight: 52,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  smileyEmoji: {
    fontSize: 22,
    lineHeight: 28,
  },
  confirmBanner: {
    marginTop: 14,
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(67, 56, 202, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(67, 56, 202, 0.12)",
  },
  confirmStars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  confirmTextCol: { flex: 1, minWidth: 0 },
  confirmTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  confirmHint: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  commentInput: {
    marginTop: 12,
    minHeight: 100,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: "#f8f9fb",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  confirmActions: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  cancelBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  submitBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: CHAT_ACCENT,
    minHeight: 44,
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  inlineSpinner: {
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
  },
  submittingLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.5,
  },
  err: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: Theme.negative,
  },
  readOnly: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 10,
    color: Theme.textMuted,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  footerRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  time: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  doneBlock: {
    marginTop: 14,
    alignItems: "center",
    gap: 10,
  },
  doneRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  doneText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  successBlock: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 12,
  },
  successIconRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#d1fae5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  successBody: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 17,
    maxWidth: 320,
  },
});
