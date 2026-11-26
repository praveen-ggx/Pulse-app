import {
  type OperationalQueueItem,
  type OperationalQueueKind,
  type QueueSection,
} from "../types";

const SECTION_META: Record<OperationalQueueKind, { title: string }> = {
  pending_approval: { title: "Pending approvals" },
  reimbursement_required: { title: "Reimbursement required" },
  reconciliation_mismatch: { title: "Reconciliation mismatch" },
  posting_retry_failure: { title: "Posting retry failures" },
  offline_sync_failure: { title: "Offline sync failures" },
};

/** Driver-reminded items first (latest reminder on top), then newest entered. */
export function compareQueueItems(a: OperationalQueueItem, b: OperationalQueueItem): number {
  const ra = a.remindedAt ? +new Date(a.remindedAt) : 0;
  const rb = b.remindedAt ? +new Date(b.remindedAt) : 0;
  if (ra !== rb) return rb - ra;
  return +new Date(b.enteredAt) - +new Date(a.enteredAt);
}

const SECTION_ORDER: OperationalQueueKind[] = [
  "pending_approval",
  "reimbursement_required",
  "reconciliation_mismatch",
  "posting_retry_failure",
  "offline_sync_failure",
];

export function buildQueueSections(
  items: OperationalQueueItem[],
): QueueSection[] {
  const map = new Map<OperationalQueueKind, OperationalQueueItem[]>();
  for (const key of SECTION_ORDER) map.set(key, []);
  for (const item of items) {
    for (const kind of item.queueKinds) {
      map.get(kind)?.push(item);
    }
  }
  return SECTION_ORDER.map((kind) => {
    const sectionItems = (map.get(kind) ?? []).sort(compareQueueItems);
    return {
      kind,
      title: SECTION_META[kind].title,
      items: sectionItems,
      totalAmountInr: sectionItems.reduce(
        (sum, item) => sum + Math.max(0, Number(item.amountInr) || 0),
        0,
      ),
    };
  });
}
