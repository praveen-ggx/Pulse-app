import { QueryClient } from "@tanstack/react-query";
import {
  isSessionScopedLaneOfferQueryKey,
  purgeSessionScopedLaneOfferQueries,
  queryKeys,
} from "@/lib/queryKeys";

describe("lane offer invite cache identity", () => {
  it("includes the signed-in user and workspace, so two accounts do not share a key", () => {
    const gogovan = queryKeys.laneOffers.myInvites("user-gogovan", "org-gogovan", 50);
    const sri = queryKeys.laneOffers.myInvites("user-sri", "org-sri", 50);
    const sameUserOtherWorkspace = queryKeys.laneOffers.myInvites(
      "user-gogovan",
      "org-sri",
      50,
    );

    expect(gogovan).not.toEqual(sri);
    expect(gogovan).not.toEqual(sameUserOtherWorkspace);
    expect(gogovan.slice(0, 3)).toEqual(["q", "lane-offers", "my-invites"]);
    expect(gogovan).toEqual(["q", "lane-offers", "my-invites", "user-gogovan", "org-gogovan", 50]);
  });

  it("does not match the old page-size-only key", () => {
    const current = queryKeys.laneOffers.myInvites("user-gogovan", "org-gogovan", 50);
    const legacy = ["q", "lane-offers", "my-invites", 50];
    expect(current).not.toEqual(legacy);
  });

  it("marks invite and network-quote caches as session-scoped and leaves indent lists alone", () => {
    expect(
      isSessionScopedLaneOfferQueryKey(
        queryKeys.laneOffers.myInvites("user-a", "org-a", 50),
      ),
    ).toBe(true);
    expect(
      isSessionScopedLaneOfferQueryKey(
        queryKeys.laneOffers.myNetworkQuotes("user-a", "org-a"),
      ),
    ).toBe(true);
    expect(
      isSessionScopedLaneOfferQueryKey(["q", "lane-offers", "my-invites", 50]),
    ).toBe(true);
    expect(
      isSessionScopedLaneOfferQueryKey(queryKeys.laneOffers.forIndent("indent-1", 50)),
    ).toBe(false);
    expect(isSessionScopedLaneOfferQueryKey(queryKeys.trips.finite("org-a"))).toBe(false);
  });

  it("drops invite rows on logout and keeps unrelated cached lists", () => {
    const client = new QueryClient();
    const inviteKey = queryKeys.laneOffers.myInvites("user-gogovan", "org-gogovan", 50);
    const quoteKey = queryKeys.laneOffers.myNetworkQuotes("user-gogovan", "org-gogovan");
    const legacyKey = ["q", "lane-offers", "my-invites", 50];
    const tripsKey = queryKeys.trips.finite("org-gogovan");

    client.setQueryData(inviteKey, { pages: [{ items: [{ invite_id: "gogovan" }] }] });
    client.setQueryData(quoteKey, [{ id: "quote-gogovan" }]);
    client.setQueryData(legacyKey, { leaked: true });
    client.setQueryData(tripsKey, [{ id: "trip-1" }]);

    purgeSessionScopedLaneOfferQueries(client);

    expect(client.getQueryData(inviteKey)).toBeUndefined();
    expect(client.getQueryData(quoteKey)).toBeUndefined();
    expect(client.getQueryData(legacyKey)).toBeUndefined();
    expect(client.getQueryData(tripsKey)).toEqual([{ id: "trip-1" }]);
  });
});
