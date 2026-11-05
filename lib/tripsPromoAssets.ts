import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

import Illustration2 from "@/assets/illustrations/2.svg";
import Illustration3 from "@/assets/illustrations/3.svg";
import Illustration6 from "@/assets/illustrations/6.svg";
import Illustration11 from "@/assets/illustrations/11.svg";
import Illustration14 from "@/assets/illustrations/14.svg";
import Illustration20 from "@/assets/illustrations/20.svg";
import Illustration28 from "@/assets/illustrations/28.svg";
import type { HistoryTripMetricId } from "@/features/trips/components/TripsHubBentoMetrics";
import type { TripMetricId } from "@/features/trips/utils/tripHubMetrics";
import {
  TripsPromoIcons,
  type TripsPromoIconId,
} from "@/lib/tripsPromoBulletAssets";

export type TripsPromoVariant =
  | "first_trip"
  | TripMetricId
  | "filtered_out"
  | "history_empty"
  | `history_${HistoryTripMetricId}`;

export type TripsPromoBullet = {
  label: string;
  icon: TripsPromoIconId;
};

export type TripsPromoPreset = {
  illustration: ComponentType<SvgProps>;
  aspect: number;
  title: string;
  description: string;
  ctaLabel: string;
  bullets: TripsPromoBullet[];
};

const STATUS_PRESETS: Record<TripMetricId, TripsPromoPreset> = {
  indent: {
    illustration: Illustration11,
    aspect: 580 / 600,
    title: "No unallocated indents",
    description:
      "Requirements waiting to be allocated to a trip show here. Create an indent or wait for one to come in.",
    ctaLabel: "",
    bullets: [
      { label: "Post a requirement", icon: "doc" },
      { label: "Receive bids", icon: "mail" },
      { label: "Award to a supplier", icon: "image" },
      { label: "Becomes a trip", icon: "vector" },
    ],
  },
  unassigned: {
    illustration: Illustration11,
    aspect: 580 / 600,
    title: "No trips in unassigned status",
    description:
      "Trips without a driver show here. Assign a driver or supplier to move them into your dispatch queue.",
    ctaLabel: "",
    bullets: [
      { label: "Assign driver", icon: "doc" },
      { label: "Link supplier", icon: "mail" },
      { label: "Set pickup window", icon: "image" },
      { label: "Dispatch when ready", icon: "vector" },
    ],
  },
  assigned: {
    illustration: Illustration3,
    aspect: 600 / 587,
    title: "No trips in assigned status",
    description:
      "Assigned trips appear here once a driver is confirmed and heading to pickup.",
    ctaLabel: "",
    bullets: [
      { label: "Driver confirmed", icon: "mail" },
      { label: "Pickup scheduled", icon: "image" },
      { label: "Pre-trip checklist", icon: "doc" },
      { label: "Ready to load", icon: "xls" },
    ],
  },
  loading: {
    illustration: Illustration28,
    aspect: 600 / 564,
    title: "No trips at loading",
    description:
      "Trips at pickup and loading appear here while cargo is being loaded onto the vehicle.",
    ctaLabel: "",
    bullets: [
      { label: "At pickup point", icon: "image" },
      { label: "Loading in progress", icon: "xls" },
      { label: "Capture weight slips", icon: "pdf" },
      { label: "Mark loaded", icon: "doc" },
    ],
  },
  in_transit: {
    illustration: Illustration2,
    aspect: 600 / 437,
    title: "No trip is in transit",
    description:
      "You'll preview live trip tracking here when a trip is on the road between pickup and drop-off.",
    ctaLabel: "",
    bullets: [
      { label: "Live GPS preview", icon: "vector" },
      { label: "Route progress", icon: "vector" },
      { label: "ETA updates", icon: "mail" },
      { label: "Exception alerts", icon: "pdf" },
    ],
  },
  unloading: {
    illustration: Illustration6,
    aspect: 600 / 595,
    title: "No trips at unloading",
    description:
      "Trips at destination waiting for unload show here before proof of delivery is captured.",
    ctaLabel: "",
    bullets: [
      { label: "At drop-off", icon: "image" },
      { label: "Unloading in progress", icon: "xls" },
      { label: "POD capture", icon: "pdf" },
      { label: "Mark delivered", icon: "doc" },
    ],
  },
  delivered_docs_pending: {
    illustration: Illustration14,
    aspect: 600 / 466,
    title: "No trips awaiting docs",
    description:
      "Delivered trips with pending POD or paperwork appear here until documentation is complete.",
    ctaLabel: "",
    bullets: [
      { label: "Upload POD", icon: "pdf" },
      { label: "Invoice match", icon: "xls" },
      { label: "Close out trip", icon: "doc" },
      { label: "Move to history", icon: "zip" },
    ],
  },
};

export const TRIPS_PROMO_PRESETS: Record<TripsPromoVariant, TripsPromoPreset> = {
  first_trip: {
    illustration: Illustration2,
    aspect: 600 / 437,
    title: "Add your first trip",
    description:
      "Create a trip to start tracking revenue, costs, driver activity, and live GPS on Pulse.",
    ctaLabel: "Create first trip →",
    bullets: [
      { label: "Live GPS tracking", icon: "vector" },
      { label: "Driver coordination", icon: "mail" },
      { label: "Auto-invoicing", icon: "pdf" },
      { label: "Trip P&L", icon: "excel" },
    ],
  },
  filtered_out: {
    illustration: Illustration11,
    aspect: 580 / 600,
    title: "No trips match your filters",
    description:
      "Clear search, date range, supply, or payment filters to see more trips in this view.",
    ctaLabel: "",
    bullets: [
      { label: "Widen date range", icon: "image" },
      { label: "Clear search", icon: "text" },
      { label: "All supply types", icon: "xls" },
      { label: "Reset filters", icon: "vector" },
    ],
  },
  history_empty: {
    illustration: Illustration20,
    aspect: 600 / 480,
    title: "No completed trips yet",
    description:
      "Trips you mark as completed will appear here with receivables, payables, and audit history.",
    ctaLabel: "",
    bullets: [
      { label: "Settlement view", icon: "excel" },
      { label: "Receivable status", icon: "pdf" },
      { label: "Payable status", icon: "xls" },
      { label: "Trip archive", icon: "zip" },
    ],
  },
  history_due_to_get: {
    illustration: Illustration20,
    aspect: 600 / 480,
    title: "No trips with receivable due",
    description:
      "Completed trips with pending collections from clients appear here once billing is outstanding.",
    ctaLabel: "",
    bullets: [
      { label: "Client collections", icon: "pdf" },
      { label: "Trip billing", icon: "xls" },
      { label: "Payment follow-up", icon: "mail" },
      { label: "Ledger link", icon: "excel" },
    ],
  },
  history_no_due_to_get: {
    illustration: Illustration20,
    aspect: 600 / 480,
    title: "No cleared receivables",
    description:
      "Completed trips with no outstanding client collections appear in this view.",
    ctaLabel: "",
    bullets: [
      { label: "Fully collected", icon: "pdf" },
      { label: "Closed billing", icon: "doc" },
      { label: "Audit trail", icon: "xls" },
      { label: "Archive ready", icon: "zip" },
    ],
  },
  history_due_to_pay: {
    illustration: Illustration28,
    aspect: 600 / 564,
    title: "No trips with payable due",
    description:
      "Completed trips with outstanding supplier or driver payouts appear here when settlement is pending.",
    ctaLabel: "",
    bullets: [
      { label: "Supplier payables", icon: "excel" },
      { label: "Driver settlement", icon: "mail" },
      { label: "Trip costs", icon: "pdf" },
      { label: "Ledger link", icon: "xls" },
    ],
  },
  history_no_due_to_pay: {
    illustration: Illustration28,
    aspect: 600 / 564,
    title: "No cleared payables",
    description:
      "Completed trips with no outstanding supplier or driver payouts appear in this view.",
    ctaLabel: "",
    bullets: [
      { label: "Fully settled", icon: "excel" },
      { label: "Closed payouts", icon: "doc" },
      { label: "Cost reconciled", icon: "xls" },
      { label: "Archive ready", icon: "zip" },
    ],
  },
  history_pending_soft_pod: {
    illustration: Illustration20,
    aspect: 600 / 480,
    title: "No pending soft copy POD",
    description:
      "Completed trips still missing a digital / uploaded POD appear here.",
    ctaLabel: "",
    bullets: [
      { label: "Upload POD photo", icon: "image" },
      { label: "Soft copy on file", icon: "pdf" },
      { label: "Proof of delivery", icon: "doc" },
      { label: "Close documents", icon: "zip" },
    ],
  },
  history_pending_hard_pod: {
    illustration: Illustration28,
    aspect: 600 / 564,
    title: "No pending hard copy POD",
    description:
      "Completed trips still waiting for the physical POD card appear here.",
    ctaLabel: "",
    bullets: [
      { label: "Physical POD card", icon: "doc" },
      { label: "Mark received", icon: "mail" },
      { label: "Office copy", icon: "pdf" },
      { label: "Close documents", icon: "zip" },
    ],
  },
  history_cancelled: {
    illustration: Illustration20,
    aspect: 600 / 480,
    title: "No cancelled trips",
    description:
      "Integrated trips cancelled before pickup appear here, using the same date range as this view.",
    ctaLabel: "",
    bullets: [
      { label: "Before pickup", icon: "doc" },
      { label: "Indent reopened", icon: "xls" },
      { label: "No posted money", icon: "excel" },
      { label: "Reason on file", icon: "mail" },
    ],
  },
  ...STATUS_PRESETS,
};

export { TripsPromoIcons };

export type TripsEmptyBannerContext = {
  showCompletedList: boolean;
  tripsInTabCount: number;
  allTripsCount: number;
  activeMetricTab: TripMetricId | "all";
  activeHistoryMetricTab: HistoryTripMetricId | null;
  hasNonMetricFilters: boolean;
  metricCounts: Record<TripMetricId, number>;
};

export function resolveTripsPromoVariant(
  ctx: TripsEmptyBannerContext,
): TripsPromoVariant {
  const {
    showCompletedList,
    tripsInTabCount,
    allTripsCount,
    activeMetricTab,
    activeHistoryMetricTab,
    hasNonMetricFilters,
    metricCounts,
  } = ctx;

  if (!showCompletedList) {
    if (tripsInTabCount === 0 || allTripsCount === 0) {
      return "first_trip";
    }
    if (activeMetricTab !== "all" && metricCounts[activeMetricTab] === 0) {
      return activeMetricTab;
    }
    if (hasNonMetricFilters) {
      return "filtered_out";
    }
    return "first_trip";
  }

  if (tripsInTabCount === 0) {
    return "history_empty";
  }
  if (activeHistoryMetricTab) {
    return `history_${activeHistoryMetricTab}`;
  }
  if (hasNonMetricFilters) {
    return "filtered_out";
  }
  return "history_empty";
}

export function fitTripsIllustration(
  boxW: number,
  boxH: number,
  assetAspect: number,
) {
  let w = boxW;
  let h = w / assetAspect;
  if (h > boxH) {
    h = boxH;
    w = h * assetAspect;
  }
  return { width: w, height: h };
}
