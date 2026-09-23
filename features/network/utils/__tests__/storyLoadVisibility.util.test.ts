import {
  isSelfNetworkStory,
  selectNetworkAndSponsoredStoryPosts,
  shouldHideLoadStoryFromAuthor,
  shouldShowFeedPostForOrg,
} from "@/features/network/utils/storyLoadVisibility.util";

const AERO = "398a89ee-19a7-4d11-9ed1-d67c1f038c83";
const PR_LOGISTICS = "d8aa9f84-6ba7-4824-bcc8-a91212f137e3";
const AJIO = "aad4d03c-a05a-4d66-9fd2-78d87275186b";

const base = {
  authorOrgId: AERO,
  viewerOrgId: AJIO,
  postType: "LOAD" as const,
  isSponsored: false as boolean,
  partnerBooksReady: true,
  supplierOrgIds: new Set<string>(),
  clientOrgIds: new Set<string>(),
  partnerOrgIds: new Set<string>(),
};

describe("shouldShowFeedPostForOrg — sponsored reach", () => {
  it("shows a sponsored post to a stranger org (server already gated the audience)", () => {
    expect(shouldShowFeedPostForOrg({ ...base, isSponsored: true })).toBe(true);
  });

  it("shows a sponsored LOAD post even when the author is a supplier-only counterparty", () => {
    // Real case: AERO is in PR logistics' suppliers book and not its clients
    // book, so the Find Work rule would otherwise hide AERO's paid story.
    expect(
      shouldShowFeedPostForOrg({
        ...base,
        viewerOrgId: PR_LOGISTICS,
        isSponsored: true,
        supplierOrgIds: new Set([AERO]),
      }),
    ).toBe(true);
  });

  it("shows a sponsored post while the clients/suppliers books are still loading", () => {
    expect(
      shouldShowFeedPostForOrg({
        ...base,
        isSponsored: true,
        partnerBooksReady: false,
      }),
    ).toBe(true);
  });
});

describe("shouldShowFeedPostForOrg — loading race", () => {
  it("does not show an organic partner post before the books load", () => {
    // Guards the flicker: without the books we cannot yet tell partner from
    // stranger, so we withhold rather than show-then-hide.
    expect(
      shouldShowFeedPostForOrg({
        ...base,
        partnerBooksReady: false,
        partnerOrgIds: new Set([AERO]),
      }),
    ).toBe(false);
  });

  it("shows the same organic partner post once the books have loaded", () => {
    expect(
      shouldShowFeedPostForOrg({
        ...base,
        partnerBooksReady: true,
        partnerOrgIds: new Set([AERO]),
      }),
    ).toBe(true);
  });

  it("always shows my own post, even before the books load", () => {
    expect(
      shouldShowFeedPostForOrg({
        ...base,
        authorOrgId: AJIO,
        partnerBooksReady: false,
      }),
    ).toBe(true);
  });
});

describe("shouldShowFeedPostForOrg — organic rules still apply", () => {
  it("hides an organic post from a stranger org", () => {
    expect(shouldShowFeedPostForOrg(base)).toBe(false);
  });

  it("hides an organic LOAD post from a supplier-only counterparty", () => {
    expect(
      shouldShowFeedPostForOrg({
        ...base,
        supplierOrgIds: new Set([AERO]),
        partnerOrgIds: new Set([AERO]),
      }),
    ).toBe(false);
  });

  it("shows an organic LOAD post from a dual-role counterparty", () => {
    expect(
      shouldShowFeedPostForOrg({
        ...base,
        supplierOrgIds: new Set([AERO]),
        clientOrgIds: new Set([AERO]),
        partnerOrgIds: new Set([AERO]),
      }),
    ).toBe(true);
  });

  it("returns false when the author org id is missing", () => {
    expect(shouldShowFeedPostForOrg({ ...base, authorOrgId: null })).toBe(false);
  });

  it("returns false when there is no viewing org", () => {
    expect(shouldShowFeedPostForOrg({ ...base, viewerOrgId: null })).toBe(false);
  });
});

describe("selectNetworkAndSponsoredStoryPosts", () => {
  const me = AJIO;
  const partner = AERO;

  it("drops own-org posts but keeps partner organic and sponsored ads", () => {
    const selected = selectNetworkAndSponsoredStoryPosts(
      [
        {
          organization_id: me,
          type: "LOAD",
          is_sponsored: false,
          created_at: "2026-09-09T10:00:00Z",
        },
        {
          organization_id: partner,
          type: "LOAD",
          is_sponsored: false,
          created_at: "2026-09-09T09:00:00Z",
        },
        {
          organization_id: PR_LOGISTICS,
          type: "LOAD",
          is_sponsored: true,
          created_at: "2026-09-09T08:00:00Z",
        },
      ],
      me,
    );
    // Sponsored ads lead the reel (selectNetworkAndSponsoredStoryPosts sorts
    // is_sponsored first, then newest-first), so PR_LOGISTICS comes before the
    // organic partner post despite being older. The viewer's own post is dropped.
    expect(selected.map((p) => p.organization_id)).toEqual([PR_LOGISTICS, partner]);
  });

  it("collapses multiple LOAD posts from the same org into one bubble", () => {
    const selected = selectNetworkAndSponsoredStoryPosts(
      [
        {
          id: "load-a",
          organization_id: partner,
          type: "LOAD",
          is_sponsored: false,
          created_at: "2026-09-09T10:00:00Z",
        },
        {
          id: "load-b",
          organization_id: partner,
          type: "LOAD",
          is_sponsored: false,
          created_at: "2026-09-09T09:00:00Z",
        },
        {
          id: "load-a-twin",
          organization_id: partner,
          type: "LOAD",
          is_sponsored: false,
          created_at: "2026-09-09T08:30:00Z",
        },
      ],
      me,
    );
    expect(selected.map((p) => p.id)).toEqual(["load-a"]);
  });

  it("treats padded org ids as self so Mine twins cannot leak onto the right", () => {
    expect(
      isSelfNetworkStory({ organization_id: ` ${AJIO} ` }, AJIO),
    ).toBe(true);
    expect(
      selectNetworkAndSponsoredStoryPosts(
        [{ organization_id: ` ${AJIO} `, type: "LOAD", created_at: "2026-09-09T10:00:00Z" }],
        AJIO,
      ),
    ).toEqual([]);
  });
});

describe("shouldHideLoadStoryFromAuthor — unchanged behaviour", () => {
  it("hides supplier-only authors", () => {
    expect(
      shouldHideLoadStoryFromAuthor({
        authorOrgId: AERO,
        supplierOrgIds: new Set([AERO]),
        clientOrgIds: new Set(),
      }),
    ).toBe(true);
  });

  it("keeps unrelated authors", () => {
    expect(
      shouldHideLoadStoryFromAuthor({
        authorOrgId: AERO,
        supplierOrgIds: new Set(),
        clientOrgIds: new Set(),
      }),
    ).toBe(false);
  });
});
