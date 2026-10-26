/**
 * Story bids are shipper-indent only.
 * They must never call submit_network_pool_quote (that quotes every
 * Network pool member on the lane, including other shippers).
 */
export const STORY_BID_SCOPE_NOTE =
  "This bid is only for this shipper's indent. It does not quote the Network pool or other loads on the same lane.";

export const STORY_BID_WITHDRAW_NOTE =
  "This removes your pending offer on this shipper's indent only. Other Network pool quotes are unchanged.";

export const STORY_BID_SUCCESS_SUBTITLE =
  "Your rate was sent to this shipper only — not the Network indent pool.";

export function isShipperScopedStoryPost(post: {
  source_indent_id?: string | null;
  organization_id?: string | null;
} | null | undefined): boolean {
  return Boolean(
    (post?.source_indent_id ?? "").trim() && (post?.organization_id ?? "").trim(),
  );
}
