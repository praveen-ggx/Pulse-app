/**
 * Wording for an incomplete Compliance queue. One place, so the banner and the
 * export guard say the same thing about the same numbers.
 */
export type ComplianceCompleteness = {
  loaded: number;
  total: number;
  failed: boolean;
};

/** "Loading trips… 40 of 312" or "Showing 40 of 312 trips. Couldn't load the rest." */
export function complianceIncompleteBannerText({ loaded, total, failed }: ComplianceCompleteness): string {
  if (!failed) return `Loading trips… ${loaded} of ${total}`;
  if (loaded >= total) return "Some trips couldn't be refreshed.";
  return `Showing ${loaded} of ${total} trips. Couldn't load the rest.`;
}

/** Shown when an export is attempted while the queue is incomplete. */
export function complianceExportBlockedMessage({ loaded, total }: ComplianceCompleteness): string {
  return `Queue incomplete (${loaded} of ${total} trips loaded). Retry loading before exporting.`;
}

/** Stage / tab count label: "12" when the queue is complete, "12+" (at least) when it is not. */
export function complianceCountLabel(count: number, incomplete: boolean): string {
  return incomplete ? `${count}+` : String(count);
}
