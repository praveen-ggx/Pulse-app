import {
  extractFeedbackScoreFromMessage,
  isFeedbackRatedFromMessage,
  resolveDriverChatFeedbackChrome,
  resolveDriverChatTripKind,
} from "@/features/chat/utils/driverChatTripChrome.util";
import type { TripMessageRow } from "@/features/chat/types/chat.types";

function msg(
  partial: Partial<TripMessageRow> & { metadata?: Record<string, unknown> },
): TripMessageRow {
  return {
    id: partial.id ?? "m1",
    conversation_id: "c1",
    organization_id: "o1",
    sender_user_id: null,
    sender_role: "system",
    sender_name: "System",
    content: partial.content ?? "",
    message_type: partial.message_type ?? "feedback_request",
    metadata: partial.metadata,
    is_read: true,
    read_at: null,
    created_at: partial.created_at ?? "2026-07-22T15:58:00Z",
  };
}

describe("driverChatTripChrome.util", () => {
  it("marks active vs completed trip kinds", () => {
    expect(resolveDriverChatTripKind("in_transit")).toBe("active");
    expect(resolveDriverChatTripKind("completed")).toBe("completed");
    expect(resolveDriverChatTripKind("cancelled")).toBe(null);
  });

  it("extracts score from rated feedback metadata", () => {
    const rated = msg({
      metadata: {
        rated_party_type: "client",
        rated_id: "client-1",
        submitted_score: 4,
        submitted_at: "2026-07-22T15:58:00Z",
      },
    });
    expect(extractFeedbackScoreFromMessage(rated)).toBe(4);
    expect(isFeedbackRatedFromMessage(rated)).toBe(true);
  });

  it("shows filled star plan when trip_feedback_status is rated", () => {
    const chrome = resolveDriverChatFeedbackChrome({
      trip_status: "completed",
      trip_feedback_status: "rated",
      messages: [
        msg({
          metadata: {
            rated_party_type: "client",
            rated_id: "client-1",
            submitted_score: 4,
            submitted_at: "2026-07-22T15:58:00Z",
          },
        }),
      ],
      last_message_preview:
        "Trip completed — rate this partner to close the mission debrief.",
    });
    expect(chrome.tripKind).toBe("completed");
    expect(chrome.showStar).toBe(true);
    expect(chrome.starFilled).toBe(true);
    expect(chrome.starScore).toBe(4);
  });

  it("shows empty star for completed trip with no feedback", () => {
    const chrome = resolveDriverChatFeedbackChrome({
      trip_status: "completed",
      trip_feedback_status: "none",
      messages: [],
      last_message_preview: "POD submitted",
    });
    expect(chrome.tripKind).toBe("completed");
    expect(chrome.showStar).toBe(true);
    expect(chrome.starFilled).toBe(false);
    expect(chrome.starScore).toBe(null);
  });

  it("shows active chrome without star for in-progress trips", () => {
    const chrome = resolveDriverChatFeedbackChrome({
      trip_status: "in_transit",
      trip_feedback_status: "none",
      messages: [],
      last_message_preview: "Driver location update — Chennai, Tamil Nadu.",
    });
    expect(chrome.tripKind).toBe("active");
    expect(chrome.showStar).toBe(false);
  });
});
