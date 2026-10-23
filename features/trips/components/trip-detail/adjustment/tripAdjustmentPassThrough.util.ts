import type {
  TripAdjustment,
  TripAdjustmentImpact,
  TripAdjustmentType,
} from "@/features/trips/services/tripAdjustments";
import { isAdjustmentVoided } from "@/features/trips/services/tripAdjustments";

export type ProvisionAdjustmentPreset = {
  type?: TripAdjustmentType;
  impact?: TripAdjustmentImpact;
  reasonSeed?: string | null;
  amountSeed?: number | null;
  /** Client sale line this cost deduction mirrors (audit). */
  passThroughFromId?: string | null;
};

export type PassThroughTargetKind = "driver" | "supplier";

export type ClientPassThroughRecommendation = {
  id: string;
  sourceAdjustment: TripAdjustment;
  amount: number;
  clientReason: string;
  costReason: string;
  targetKind: PassThroughTargetKind;
  targetLabel: string;
  summary: string;
};

function normalizeReason(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Client sale CN reasons that can flow to driver/supplier cost deduction. */
const PASS_THROUGH_CLIENT_REASON_KEYS: {
  match: (reason: string) => boolean;
  assetCostReason: string;
  aggregateCostReason: string;
  shortLabel: string;
}[] = [
  {
    match: (r) => r.includes("damage") || r.includes("missing"),
    assetCostReason: "Damage to cargo",
    aggregateCostReason: "Damages / Missing",
    shortLabel: "Damage / missing",
  },
  {
    match: (r) => r.includes("late") && r.includes("deliver"),
    assetCostReason: "Late delivery",
    aggregateCostReason: "Detention",
    shortLabel: "Late delivery",
  },
  {
    match: (r) => r.includes("late delivery"),
    assetCostReason: "Late delivery",
    aggregateCostReason: "Detention",
    shortLabel: "Late delivery",
  },
  {
    match: (r) =>
      r.includes("policy") || r.includes("safety") || r.includes("violation"),
    assetCostReason: "Policy / safety violation",
    aggregateCostReason: "Damages / Missing",
    shortLabel: "Policy / safety",
  },
  {
    match: (r) => r === normalizeReason("Damages / Missing"),
    assetCostReason: "Damage to cargo",
    aggregateCostReason: "Damages / Missing",
    shortLabel: "Damage / missing",
  },
  {
    match: (r) => r === normalizeReason("Late Delivery"),
    assetCostReason: "Late delivery",
    aggregateCostReason: "Detention",
    shortLabel: "Late delivery",
  },
];

export function mapClientReasonToCostDeduction(
  clientReason: string,
  isAssetExecution: boolean,
): { costReason: string; shortLabel: string } | null {
  const normalized = normalizeReason(clientReason);
  if (!normalized) return null;
  for (const row of PASS_THROUGH_CLIENT_REASON_KEYS) {
    if (!row.match(normalized)) continue;
    return {
      costReason: isAssetExecution ? row.assetCostReason : row.aggregateCostReason,
      shortLabel: row.shortLabel,
    };
  }
  return null;
}

function isClientSaleCreditNote(adj: TripAdjustment): boolean {
  return (
    adj.type === "revenue" &&
    !isAdjustmentVoided(adj) &&
    adj.impact === "minus" &&
    Math.max(0, Number(adj.amount) || 0) > 0
  );
}

function costDeductionMatchesSource(
  costAdj: TripAdjustment,
  source: TripAdjustment,
  costReason: string,
): boolean {
  if (costAdj.type !== "cost" || isAdjustmentVoided(costAdj)) return false;
  if (costAdj.impact !== "minus") return false;
  const sourceAmt = Math.max(0, Number(source.amount) || 0);
  const costAmt = Math.max(0, Number(costAdj.amount) || 0);
  if (sourceAmt !== costAmt) return false;
  const costR = normalizeReason(
    String(costAdj.reason ?? "").replace(
      /\s*·\s*(driver|supplier)\s+deduction.*$/i,
      "",
    ),
  );
  const mapped = normalizeReason(costReason);
  const sourceR = normalizeReason(
    String(source.reason ?? "").replace(
      /\s*\(mirrors client sale cn\)\s*$/i,
      "",
    ),
  );
  if (costR === mapped) return true;
  if (costR === sourceR) return true;
  return (
    (costR.includes("damage") && sourceR.includes("damage")) ||
    (costR.includes("late") && sourceR.includes("late")) ||
    (costR.includes("missing") && sourceR.includes("missing"))
  );
}

export function selectClientPassThroughRecommendations(input: {
  adjustments: TripAdjustment[];
  isAssetExecution: boolean;
  driverOrSupplierName: string;
}): ClientPassThroughRecommendation[] {
  const targetKind: PassThroughTargetKind = input.isAssetExecution ? "driver" : "supplier";
  const targetLabel = input.isAssetExecution ? "driver" : "supplier";
  const out: ClientPassThroughRecommendation[] = [];

  for (const source of input.adjustments) {
    if (!isClientSaleCreditNote(source)) continue;
    const mapped = mapClientReasonToCostDeduction(source.reason, input.isAssetExecution);
    if (!mapped) continue;
    const alreadyPassed = input.adjustments.some((adj) =>
      costDeductionMatchesSource(adj, source, mapped.costReason),
    );
    if (alreadyPassed) continue;

    const amount = Math.max(0, Number(source.amount) || 0);
    out.push({
      id: source.id,
      sourceAdjustment: source,
      amount,
      clientReason: source.reason.trim(),
      costReason: mapped.costReason,
      targetKind,
      targetLabel: input.driverOrSupplierName.trim() || targetLabel,
      summary: `${mapped.shortLabel} · deduct from ${targetLabel}`,
    });
  }

  return out.sort(
    (a, b) =>
      new Date(b.sourceAdjustment.created_at ?? 0).getTime() -
      new Date(a.sourceAdjustment.created_at ?? 0).getTime(),
  );
}

export function passThroughPresetFromRecommendation(
  rec: ClientPassThroughRecommendation,
): ProvisionAdjustmentPreset {
  return {
    type: "cost",
    impact: "minus",
    reasonSeed: rec.costReason,
    amountSeed: rec.amount,
    passThroughFromId: rec.sourceAdjustment.id,
  };
}

/** After posting a client sale CN, suggest mirroring on cost lane (before refetch). */
export function passThroughRecommendationAfterClientSave(input: {
  amount: number;
  reason: string;
  adjustments: TripAdjustment[];
  isAssetExecution: boolean;
  driverOrSupplierName: string;
}): ClientPassThroughRecommendation | null {
  const cleanReason = String(input.reason ?? "")
    .replace(/\s*\(pass-through from client CN\)\s*$/i, "")
    .replace(/\s*\(mirrors client sale cn\)\s*$/i, "")
    .trim();
  const mapped = mapClientReasonToCostDeduction(cleanReason, input.isAssetExecution);
  if (!mapped) return null;

  const amount = Math.max(0, Number(input.amount) || 0);
  if (amount <= 0) return null;

  const targetKind: PassThroughTargetKind = input.isAssetExecution ? "driver" : "supplier";
  const targetLabel = input.driverOrSupplierName.trim() || targetKind;

  const source =
    input.adjustments.find(
      (adj) =>
        isClientSaleCreditNote(adj) &&
        Math.max(0, Number(adj.amount) || 0) === amount &&
        normalizeReason(adj.reason) === normalizeReason(cleanReason),
    ) ??
    ({
      id: "__pending_client_cn__",
      trip_id: "",
      type: "revenue",
      impact: "minus",
      amount,
      reason: cleanReason,
      created_at: new Date().toISOString(),
    } as TripAdjustment);

  const alreadyPassed = input.adjustments.some((adj) =>
    costDeductionMatchesSource(adj, source, mapped.costReason),
  );
  if (alreadyPassed) return null;

  return {
    id: source.id,
    sourceAdjustment: source,
    amount,
    clientReason: cleanReason,
    costReason: mapped.costReason,
    targetKind,
    targetLabel,
    summary: `${mapped.shortLabel} · deduct from ${targetLabel}`,
  };
}

const CLIENT_CN_LINK_SUFFIX = " (mirrors client sale CN)";

/** Persisted cost CN that reduces driver/supplier trip cost and flows into finance totals. */
export function buildCostDeductionSaveParams(rec: ClientPassThroughRecommendation): {
  type: "cost";
  impact: "minus";
  amount: number;
  reason: string;
} {
  const party =
    rec.targetKind === "driver" ? "Driver deduction" : "Supplier deduction";
  return {
    type: "cost",
    impact: "minus",
    amount: rec.amount,
    reason: `${rec.costReason} · ${party}${CLIENT_CN_LINK_SUFFIX}`,
  };
}
