import type { AlertRegistrySignalCardProps } from "@/components/AlertRegistrySignalCard";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";
import {
  opsAlertTagVariant,
  formatRegistryLabel,
  salaryRequestStatusTone,
  type RegistryTag,
} from "@/lib/alertRegistry/registryAlertPresentation.util";
import type { AlertDetailMode } from "@/lib/alertRegistry/alertDetailRoute.util";
import {
  buildOpsRegistryCardPresentation,
  type RegistryPartyLookup,
} from "@/lib/alertRegistry/registryOpsPresentation.util";
import { resolveSalaryRegistryAvatar } from "@/lib/alertRegistry/registryNotificationAvatar.util";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";
import {
  classifyPaymentAlert,
  paymentTagLabel,
} from "@/lib/globalSync/registryPaymentLane.util";

export function formatRegistryRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Just now";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "Just now";
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function isTripBasedAttribution(req: SalaryRequestWithDriverRow): boolean {
  return (
    req.request_type === "trip_based" &&
    String(req.note ?? "").toLowerCase().includes("fleet trip")
  );
}

function formatSalaryAmount(amount: number | null | undefined): string {
  return `₹${Number(amount ?? 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSalaryHighlight(req: SalaryRequestWithDriverRow): string {
  return `₹${Number(req.amount ?? 0).toLocaleString("en-IN")}`;
}

function opsContextLabel(item: GlobalOperationAlert): string {
  if (item.category === "late_log") return "Operations";
  if (item.category === "unassigned_trip") return "Operations";
  if (item.category === "vehicle_idle") return "Fleet";
  if (item.category === "payment_received") return "Received";
  if (item.category === "payment_paid") return "Payment";
  return "Operations";
}

function opsTag(
  item: GlobalOperationAlert,
  trips: RegistryPartyLookup["activeTrips"],
): string {
  if (item.category === "late_log") return "late log";
  if (item.category === "unassigned_trip") return "unassigned";
  if (item.category === "vehicle_idle") return "idle";
  if (item.category === "payment_received" || item.category === "payment_paid") {
    return paymentTagLabel(classifyPaymentAlert(item, trips));
  }
  return item.category.replace(/_/g, " ");
}

function splitOpsDetailLines(
  ops: GlobalOperationAlert,
  presentationDetail?: string,
): { title?: string; subtitle?: string; body?: string } {
  const raw = (presentationDetail ?? ops.subtitle ?? "").trim();
  if (!raw) return {};
  const parts = raw.split("·").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { title: parts[0], subtitle: parts.slice(1).join(" · ") };
  }
  return { body: raw };
}

export type AlertDetailCardPresentation = Pick<
  AlertRegistrySignalCardProps,
  | "avatar"
  | "actorName"
  | "actionText"
  | "highlightText"
  | "trailingText"
  | "detail"
  | "detailTitle"
  | "detailSubtitle"
  | "timeLabel"
  | "contextLabel"
  | "tags"
  | "statusPill"
  | "mode"
  | "isUnread"
>;

export function buildSalaryAlertCardPresentation(
  req: SalaryRequestWithDriverRow,
  driversById: Map<string, DriverRow>,
  mode: AlertDetailMode,
): AlertDetailCardPresentation {
  const isActive = mode === "active";
  const driverName = req.drivers?.name ?? "Driver";
  const attribution = isTripBasedAttribution(req);
  const salaryTags: RegistryTag[] = attribution
    ? [
        { label: "attribution", variant: "default" },
        { label: "trip based", variant: "neutral" },
      ]
    : [
        { label: "salary", variant: "default" },
        { label: req.request_type.replace("_", " "), variant: "neutral" },
      ];

  return {
    mode: isActive ? "active" : "completed",
    isUnread: isActive,
    avatar: resolveSalaryRegistryAvatar(req, driversById),
    actorName: driverName,
    actionText: attribution ? "sent a trip for review on" : "requested payment for",
    highlightText: formatSalaryHighlight(req),
    detailTitle: formatSalaryAmount(req.amount),
    detailSubtitle: attribution
      ? "Fleet trip attribution request"
      : `${formatRegistryLabel(req.request_type)} salary request`,
    timeLabel: formatRegistryRelativeTime(req.created_at),
    contextLabel: attribution ? "Fleet attribution" : "Salary request",
    tags: isActive ? salaryTags : undefined,
    statusPill: !isActive
      ? { label: String(req.status ?? ""), tone: salaryRequestStatusTone(req.status) }
      : undefined,
  };
}

export function buildOpsAlertCardPresentation(
  ops: GlobalOperationAlert,
  partyCtx: RegistryPartyLookup,
  mode: AlertDetailMode,
): AlertDetailCardPresentation {
  const isActive = mode === "active";
  const opsTags: RegistryTag[] = [
    { label: opsTag(ops, partyCtx.activeTrips), variant: opsAlertTagVariant(ops.category) },
  ];
  const presentation = buildOpsRegistryCardPresentation(ops, partyCtx);
  const detailLines = splitOpsDetailLines(ops, presentation.detail);

  return {
    mode: isActive ? "active" : "completed",
    isUnread: isActive,
    avatar: presentation.avatar,
    actorName: presentation.actorName,
    actionText: presentation.actionText,
    highlightText: presentation.highlightText,
    trailingText: presentation.trailingText,
    detailTitle: detailLines.title,
    detailSubtitle: detailLines.subtitle,
    detail: detailLines.body,
    timeLabel: formatRegistryRelativeTime(ops.created_at),
    contextLabel: opsContextLabel(ops),
    tags: opsTags,
  };
}
