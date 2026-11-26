import type { TripConversation } from "@/features/chat/types/chat.types";
import {
  conversationMatchesPartyPeopleKey,
  dedupeActiveConversationsByDriver,
  filterConversationsToPartyFocus,
} from "@/features/chat/utils/tripPartyPeopleKey.util";

function conv(
  partial: Partial<TripConversation> & Pick<TripConversation, "id" | "trip_id">,
): TripConversation {
  return {
    organization_id: "org",
    party_type: "driver",
    party_name: "Driver",
    client_id: null,
    supplier_id: null,
    driver_id: null,
    trip_driver_id: null,
    last_message_at: null,
    last_message_preview: null,
    unread_dispatcher_count: 0,
    created_at: null,
    updated_at: null,
    pickup_area: null,
    drop_location: null,
    trip_status: "in_progress",
    trip_number: null,
    display_trip_id: null,
    indent_id: null,
    ...partial,
  } as TripConversation;
}

describe("tripPartyPeopleKey focus + active dedupe", () => {
  const vincent = "driver-vincent";
  const vasanth = "driver-vasanth";

  it("matches driver focus by compose driver id when lane driver_id is stale", () => {
    const row = conv({
      id: "c1",
      trip_id: "t1",
      party_type: "driver",
      driver_id: null,
    });
    expect(
      conversationMatchesPartyPeopleKey(row, `driver:${vincent}`, {
        composeDriverId: vincent,
      }),
    ).toBe(true);
    expect(
      conversationMatchesPartyPeopleKey(row, `driver:${vincent}`, {
        composeDriverId: vasanth,
      }),
    ).toBe(false);
  });

  it("filters focused driver list to only that driver", () => {
    const rows = [
      conv({
        id: "v1",
        trip_id: "tv1",
        driver_id: vincent,
        last_message_at: "2026-11-26T12:00:00Z",
      }),
      conv({
        id: "a1",
        trip_id: "ta1",
        driver_id: vasanth,
        last_message_at: "2026-11-26T13:00:00Z",
      }),
    ];
    const focused = filterConversationsToPartyFocus(rows, `driver:${vincent}`, {
      tripStatus: (c) => c.trip_status,
      isTerminal: () => false,
    });
    expect(focused.map((c) => c.id)).toEqual(["v1"]);
  });

  it("keeps one active trip per driver", () => {
    const rows = [
      conv({
        id: "newer",
        trip_id: "t-new",
        driver_id: vincent,
        last_message_at: "2026-11-26T18:00:00Z",
      }),
      conv({
        id: "older",
        trip_id: "t-old",
        driver_id: vincent,
        last_message_at: "2026-11-26T08:00:00Z",
      }),
      conv({
        id: "other",
        trip_id: "t-other",
        driver_id: vasanth,
        last_message_at: "2026-11-26T17:00:00Z",
      }),
    ];
    const deduped = dedupeActiveConversationsByDriver(rows);
    expect(deduped.map((c) => c.id)).toEqual(["newer", "other"]);
  });
});
