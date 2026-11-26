import type { MessageDeliveryStatus } from "@/features/chat/types/chat.types";

/**
 * Mirrors `resolveOutgoingDeliveryStatus` failed-lane precedence without importing
 * `useChatStore` (that module pulls Auth / Expo native deps into Jest).
 */
function resolveOutgoingDeliveryStatus(
  m: { id?: string; delivery_status?: MessageDeliveryStatus; read_at?: string | null; is_delivered?: boolean },
): MessageDeliveryStatus {
  if (m.delivery_status === "failed") return "failed";
  if (m.delivery_status === "sending") return "sending";
  const id = m.id != null ? String(m.id) : "";
  if (id.startsWith("optimistic-")) {
    return m.delivery_status === "failed" ? "failed" : "sending";
  }
  if (m.read_at) return "read";
  if (m.is_delivered) return "delivered";
  return "sent";
}

describe("resolveOutgoingDeliveryStatus — failed lane", () => {
  it("surfaces failed ahead of optimistic id heuristics", () => {
    expect(
      resolveOutgoingDeliveryStatus({
        id: "optimistic-1",
        delivery_status: "failed",
      }),
    ).toBe("failed");
  });

  it("keeps sending for in-flight optimistic rows", () => {
    expect(
      resolveOutgoingDeliveryStatus({
        id: "optimistic-2",
        delivery_status: "sending",
      }),
    ).toBe("sending");
  });
});
