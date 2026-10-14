/**
 * Locked commercial-surface rule: a sponsored Reach load is the only
 * individual commercial opportunity; every other Network indent is quoted
 * through its canonical Indent Pool, and a sponsored indent is never pooled.
 */
import type { PostRow } from "@/features/network/services/posts.service";
import {
  LoadCenterOpportunityExchange,
  useLoadCenterOpportunityPosts,
} from "@/features/network/components/LoadCenterOpportunityExchange";
import { buildNetworkLoadPools } from "@/features/network/utils/networkLoadPools.util";
import {
  isSponsoredReachLoad,
  isSponsoredReachPost,
  sponsoredReachIndentIds,
} from "@/features/network/utils/sponsoredReach.util";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";

jest.mock("react-native", () => jest.requireActual("react-native"));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

let mockFeed: PostRow[] = [];
jest.mock("@/lib/queries/usePostsQuery", () => ({
  useNetworkFeedQuery: () => ({ data: mockFeed, isLoading: false }),
}));
jest.mock("@/lib/queries/useLinkedOrgDisplayQuery", () => ({
  useLinkedOrgDisplayMap: () => ({}),
}));
jest.mock("@/lib/queries", () => ({
  useMyDirectQuotesQuery: () => ({ data: [] }),
}));
jest.mock("@/features/network/services/bids.service", () => ({
  getMyBidsForPostIds: jest.fn().mockResolvedValue({ bids: [], error: null }),
}));
jest.mock("@/features/network/components/LoadCenterSidebarFindEmpty", () => ({
  LoadCenterSidebarFindEmpty: () => {
    const { Text } = jest.requireActual("react-native");
    return <Text>No sponsored loads</Text>;
  },
}));

function post(id: string, extra: Partial<PostRow> = {}): PostRow {
  return {
    id,
    type: "LOAD",
    is_active: true,
    is_sponsored: false,
    organization_id: "shipper-1",
    source_indent_id: null,
    created_at: "2026-10-06T00:00:00Z",
    pickup_location: "Pune",
    drop_location: "Mumbai",
    vehicle_type: "32 FT",
    ...extra,
  } as PostRow;
}

const SPONSORED = post("p-sponsored", { is_sponsored: true, source_indent_id: "ind-s" });
const STORY = post("p-story", { source_indent_id: "ind-n" });
const PLAIN = post("p-plain");
const INACTIVE_AD = post("p-off", { is_sponsored: true, is_active: false, source_indent_id: "ind-off" });
const CAPACITY_AD = post("p-cap", { is_sponsored: true, type: "VEHICLE_AVAILABILITY" });

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: Infinity } },
});
afterEach(() => queryClient.clear());

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("sponsored Reach predicate", () => {
  it("a post is sponsored Reach only when it is an active sponsored LOAD", () => {
    expect(isSponsoredReachPost(SPONSORED)).toBe(true);
    expect(isSponsoredReachPost(STORY)).toBe(false);
    expect(isSponsoredReachPost(INACTIVE_AD)).toBe(false);
    expect(isSponsoredReachPost(CAPACITY_AD)).toBe(false);
  });

  it("Network: sponsored indents come from source_indent_id of sponsored posts only", () => {
    expect([...sponsoredReachIndentIds([SPONSORED, STORY, PLAIN, INACTIVE_AD])]).toEqual([
      "ind-s",
    ]);
    expect(sponsoredReachIndentIds(undefined).size).toBe(0);
  });

  it("covers Marketplace is_sponsored, reach_campaign_id and Network sponsored posts", () => {
    const ids = new Set(["ind-s"]);
    expect(isSponsoredReachLoad({ id: "x", is_sponsored: true })).toBe(true);
    expect(isSponsoredReachLoad({ id: "x", reach_campaign_id: "camp-1" })).toBe(true);
    expect(isSponsoredReachLoad({ id: "x", reach_campaign_id: "  " })).toBe(false);
    expect(isSponsoredReachLoad({ id: "ind-s" }, ids)).toBe(true);
    expect(isSponsoredReachLoad({ id: "ind-n" }, ids)).toBe(false);
  });
});

describe("Network pools exclude sponsored Reach indents", () => {
  const loads = [
    { id: "ind-s", organization_id: "acme", pickup_area: "Pune", drop_location: "Mumbai", vehicle_type: "32 FT" },
    { id: "ind-n", organization_id: "acme", pickup_area: "Pune", drop_location: "Mumbai", vehicle_type: "32 FT" },
    { id: "ind-b", organization_id: "bolt", pickup_area: "pune", drop_location: "MUMBAI", vehicle_type: "32 ft" },
  ];

  it("a sponsored indent never joins the pool; the rest of the lane still pools", () => {
    const ids = sponsoredReachIndentIds([SPONSORED, STORY]);
    const universe = loads.filter((l) => !isSponsoredReachLoad(l, ids));
    const { pools, unpooled } = buildNetworkLoadPools(universe);
    expect(pools).toHaveLength(1);
    expect(pools[0]!.members.map((m) => m.id)).toEqual(["ind-n", "ind-b"]);
    expect(unpooled).toEqual([]);
  });

  it("LoadCenterView feeds only poolable (non-sponsored) loads into every Network pool universe", () => {
    const source = readFileSync(join(__dirname, "../LoadCenterView.tsx"), "utf8");
    expect(source).toContain("sponsoredReachIndentIds(networkFeedQ.data)");
    expect(source).toContain("!isSponsoredReachLoad(load, sponsoredIndentIds)");
    expect(source).toContain('id === "OPEN" ? buckets.OPEN.filter(isPoolableOpenLoad)');
    expect(source).toMatch(/!myQuoteByIndentId\.has\(load\.id\) && isPoolableOpenLoad\(load\)/);
    expect(source).toContain("openLoads={findWorkOpenPoolLoads}");
    expect(source).toContain("openLoads={getLoadOpenPoolUniverse}");
  });
});

describe("no normal Network indent is individually biddable on /pulse-loads", () => {
  const read = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");

  it("the sidebar and Find drawer no longer take an indent catalog", () => {
    for (const file of [
      "LoadCenterView.tsx",
      "LoadCenterOpportunityExchange.tsx",
      "FindNetworkVehiclesDrawer.tsx",
    ]) {
      const source = read(file);
      expect(source).not.toMatch(/indentLoads|renderIndentCard|advertisedNetworkLoads/);
    }
  });

  it("Network pool lists render incomplete-lane loads review-only, never with a Bid card", () => {
    const list = read("pooled/NetworkLoadPoolList.tsx");
    expect(list).not.toMatch(/renderCard\b/);
    const modal = read("LoadCenterKanbanColumnModal.tsx");
    expect(modal).toMatch(/:\s*pooledMode\s*\?\s*renderPoolMemberCard\s*:\s*null/);
  });

  it("Network pool cards have no mutual-connections facepile", () => {
    const card = read("pooled/NetworkLoadPoolCard.tsx");
    expect(card).not.toMatch(/useMutualConnectionsQuery|MutualAvatarStack|network-pool-mutuals/);
  });
});

describe("Get load sidebar: sponsored Reach posts only", () => {
  beforeEach(() => {
    mockFeed = [STORY, SPONSORED, PLAIN, INACTIVE_AD, CAPACITY_AD];
    mockPush.mockClear();
  });

  it("the post hook returns only active sponsored LOAD posts in get mode", () => {
    const { result } = renderHook(
      () => useLoadCenterOpportunityPosts("viewer-org", "get"),
      { wrapper },
    );
    expect(result.current.posts.map((p) => p.id)).toEqual(["p-sponsored"]);
  });

  it("give mode is unchanged: capacity posts still show", () => {
    const { result } = renderHook(
      () => useLoadCenterOpportunityPosts("viewer-org", "give"),
      { wrapper },
    );
    expect(result.current.posts.map((p) => p.id)).toContain("p-cap");
  });

  it("renders the sponsored load individually and opens its existing story Bid flow", () => {
    render(<LoadCenterOpportunityExchange orgId="viewer-org" mode="get" sidebarStack />, {
      wrapper,
    });
    expect(screen.getByText("Sponsored loads")).toBeTruthy();
    expect(screen.queryByLabelText(/^Indent from network/)).toBeNull();
    const cards = screen.getAllByLabelText(/^Sponsored load from /);
    expect(cards).toHaveLength(1);
    fireEvent.press(cards[0]!);
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/(modals)/story-detail",
        params: expect.objectContaining({ postId: "p-sponsored" }),
      }),
    );
  });

  it("a non-sponsored indent-linked story is not an individual opportunity", () => {
    mockFeed = [STORY, PLAIN];
    render(<LoadCenterOpportunityExchange orgId="viewer-org" mode="get" sidebarStack />, {
      wrapper,
    });
    expect(screen.getByText("No sponsored loads")).toBeTruthy();
    expect(screen.queryByLabelText(/^Indent from network|^Sponsored load/)).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
