import {
  getIndentDisplayNumber,
  type IndentRow,
} from "@/features/indents/services/indents.service";
import { isIndentFailedStatus } from "@/features/indents/utils/indentCancelReason.util";
import type { IndentWorkloadKind } from "@/features/indents/utils/indentWorkload.util";
import { indentWorkloadStatusTag } from "@/features/indents/utils/indentWorkload.util";
import type { IndentHubStatusTag } from "@/features/trips/utils/indentHubCardPresentation";
import { indentMatchesHubSearch } from "@/features/trips/utils/indentHubToolbarFilter";

/** Indent toolbar stages the hub search can jump to. */
export type IndentHubSearchStage = IndentHubStatusTag;

const STAGE_TIEBREAK: IndentHubSearchStage[] = [
  "awarded",
  "bids",
  "pending",
  "failed",
];

/**
 * Stage for one indent on the Trips Live-indents toolbar.
 * Failed is status-based; pending/bids/awarded follow the workload kind + bid count.
 */
export function indentHubSearchStageForIndent(
  indent: Pick<IndentRow, "status">,
  opts: {
    hasLinkedTrip: boolean;
    bidCount: number;
    workloadKind: IndentWorkloadKind | null;
  },
): IndentHubSearchStage | null {
  if (opts.hasLinkedTrip) return null;
  if (isIndentFailedStatus(indent.status)) return "failed";
  if (opts.workloadKind === "needs_trip") return "awarded";
  if (opts.workloadKind === "live") {
    return indentWorkloadStatusTag("live", opts.bidCount);
  }
  return null;
}

/** Higher = better match for auto-navigation (exact code beats fuzzy client text). */
export function scoreIndentHubSearchMatch(
  indent: Pick<
    IndentRow,
    | "indent_number"
    | "indent_code"
    | "indent_operational_code"
    | "client_name"
    | "pickup_area"
    | "drop_location"
  > & { id?: string },
  query: string,
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const codes = [
    getIndentDisplayNumber(indent as IndentRow),
    indent.indent_number,
    indent.indent_code,
    indent.indent_operational_code,
  ]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (codes.some((c) => c === q)) return 100;
  if (codes.some((c) => c.includes(q))) return 80;
  const client = String(indent.client_name ?? "").trim().toLowerCase();
  if (client && client === q) return 40;
  if (client && client.includes(q)) return 20;
  if (indentMatchesHubSearch(indent as IndentRow, q)) return 10;
  return 0;
}

export type IndentHubSearchMatch = {
  indentId: string;
  stage: IndentHubSearchStage;
  score: number;
};

/**
 * Pick the toolbar stage to open for the current search.
 * Exact / strong code matches win; otherwise prefer Needs trip → Bids → Pending → Failed.
 */
export function pickIndentHubSearchStage(
  matches: readonly IndentHubSearchMatch[],
): IndentHubSearchStage | null {
  if (matches.length === 0) return null;
  let best = matches[0];
  for (let i = 1; i < matches.length; i += 1) {
    const row = matches[i];
    if (row.score > best.score) {
      best = row;
      continue;
    }
    if (row.score < best.score) continue;
    const rowRank = STAGE_TIEBREAK.indexOf(row.stage);
    const bestRank = STAGE_TIEBREAK.indexOf(best.stage);
    if (rowRank >= 0 && (bestRank < 0 || rowRank < bestRank)) best = row;
  }
  return best.stage;
}

/** Collect scored stage matches from unallocated + failed search pools. */
export function collectIndentHubSearchMatches(opts: {
  query: string;
  unallocated: readonly IndentRow[];
  failed: readonly IndentRow[];
  bidCountById: Readonly<Record<string, number>>;
  workloadKindById: ReadonlyMap<string, IndentWorkloadKind>;
  indentIdsWithTrip: ReadonlySet<string>;
}): IndentHubSearchMatch[] {
  const q = opts.query.trim();
  if (!q) return [];
  const out: IndentHubSearchMatch[] = [];
  const seen = new Set<string>();

  const push = (indent: IndentRow, stage: IndentHubSearchStage) => {
    if (seen.has(indent.id)) return;
    seen.add(indent.id);
    const score = scoreIndentHubSearchMatch(indent, q);
    if (score <= 0) return;
    out.push({ indentId: indent.id, stage, score });
  };

  for (const indent of opts.unallocated) {
    if (!indentMatchesHubSearch(indent, q)) continue;
    const stage = indentHubSearchStageForIndent(indent, {
      hasLinkedTrip: opts.indentIdsWithTrip.has(indent.id),
      bidCount: opts.bidCountById[indent.id] ?? 0,
      workloadKind: opts.workloadKindById.get(indent.id) ?? null,
    });
    if (stage) push(indent, stage);
  }
  for (const indent of opts.failed) {
    if (!indentMatchesHubSearch(indent, q)) continue;
    const stage = indentHubSearchStageForIndent(indent, {
      hasLinkedTrip: opts.indentIdsWithTrip.has(indent.id),
      bidCount: 0,
      workloadKind: null,
    });
    if (stage === "failed") push(indent, "failed");
  }
  return out;
}
