/**
 * Pulse Boost — plan display metadata.
 *
 * Price, name, and estimated reach are DB-driven (`reach_plans` table,
 * editable from Control Tower) — never hardcoded here. This file only holds
 * static per-code icon/color (never shown as copy) plus a helper that
 * describes reach from the plan row itself ("Reach up to N verified fleet
 * owners"), so the number is never duplicated between DB and client.
 */
import Theme from '@/constants/Theme';

export type ReachPlanCode = 'basic' | 'boost' | 'max';

export interface ReachPlanDisplayMeta {
  code: ReachPlanCode;
  icon: string;   // lucide-react-native icon name
  color: string;
}

/**
 * Tiers read as one warm-brown ramp (light → deep) rather than three unrelated
 * hues, so a campaign surface stays on the Pulse Boost accent while still
 * signalling which plan is running.
 */
export const REACH_PLAN_DISPLAY: Record<ReachPlanCode, ReachPlanDisplayMeta> = {
  basic: { code: 'basic', icon: 'Rocket', color: Theme.accentBrownLight },
  boost: { code: 'boost', icon: 'Zap',    color: Theme.accentBrown },
  max:   { code: 'max',   icon: 'Flame',  color: Theme.accentBrownDeep },
};

export function getReachPlanDisplay(code: string): ReachPlanDisplayMeta | undefined {
  return REACH_PLAN_DISPLAY[code as ReachPlanCode];
}

/** Deliberately no exact audience count — "reach up to N" implied a delivery
 * guarantee this product doesn't (yet) enforce. Real accounted delivery is
 * Phase 2.3 (see docs/REACH_DELIVERY_ENGINE_DESIGN.md); until then, promise
 * outcomes, not counts. */
export function describeReachPlan(_plan: {
  estimated_reach_max: number;
  audience_scope: string;
}): string {
  return 'Promote your load to relevant fleet owners and shippers across Pulse';
}
