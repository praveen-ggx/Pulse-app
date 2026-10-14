import { buildComplianceTripSummaries } from "@/features/tripCompliance/services/tripComplianceRead.service";
import { COMPLIANCE_STAGE_LABEL, type ComplianceStage, type ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { complianceEventAt } from "@/features/tripCompliance/utils/complianceCardVisual.util";
import {
    checklistGroupStatusLabel,
    ensureComplianceChecklist,
} from "@/features/tripCompliance/utils/complianceChecklist.util";
import { selectCompliancePipelineTrips } from "@/features/tripCompliance/utils/compliancePipelineTrips.util";
import { getTripDisplayNumber, getTripsForOrg } from "@/features/trips/services/trips.service";

export type ComplianceReportFilters = {
  dateFrom?: string; // trip.pickup_date >= dateFrom
  dateTo?: string; // trip.pickup_date <= dateTo
  stage?: ComplianceStage | "all";
  tripStatus?: string | "all";
  paymentStatus?: "any" | "advance_paid" | "balance_paid" | "unpaid";
};

export type ComplianceReportRow = {
  tripId: string;
  tripDisplayNumber: string;
  tripDate: string;
  fromLocation: string;
  toLocation: string;
  tripVerification: string;
  vehicleVerification: string;
  driverVerification: string;
  requiredDate: string;
  tripStatus: string;
  client: string;
  driver: string;
  vehicle: string;
  complianceStatus: string;
  documentStatus: string;
  complianceVerifiedAt: string;
  advanceAmount: string;
  advanceStatus: string;
  advanceUtr: string;
  advancePaidAt: string;
  deliveryDate: string;
  hardCopyPodStatus: string;
  courier: string;
  awb: string;
  balanceAmount: string;
  balanceStatus: string;
  balanceUtr: string;
  balancePaidAt: string;
  settlementStatus: string;
};

/**
 * Same trip source as `/trips` + Compliance list: `getTripsForOrg`, then
 * Loading→Completed pipeline, then one batched summary build.
 */
async function fetchAllComplianceSummaries(orgId: string): Promise<ComplianceTripSummary[]> {
  const { error, trips } = await getTripsForOrg(orgId, { includeComplianceBacklog: true });
  if (error) throw error;
  return buildComplianceTripSummaries(selectCompliancePipelineTrips(trips), orgId);
}

function paymentStatusOf(summary: ComplianceTripSummary): ComplianceReportFilters["paymentStatus"] {
  if (summary.balance) return "balance_paid";
  if (summary.advance) return "advance_paid";
  return "unpaid";
}

function toReportRow(summary: ComplianceTripSummary): ComplianceReportRow {
  const t = summary.trip;
  const checklist = ensureComplianceChecklist(summary);
  const requiredDate = complianceEventAt(t) ?? "";
  const tripId = getTripDisplayNumber(t);
  return {
    tripId,
    tripDisplayNumber: tripId,
    tripDate: requiredDate,
    fromLocation: t.pickup_area?.trim() || "",
    toLocation: t.drop_location?.trim() || t.drop_area?.trim() || "",
    tripVerification: checklistGroupStatusLabel(checklist.groups[0]),
    vehicleVerification: checklistGroupStatusLabel(checklist.groups[1]),
    driverVerification: checklistGroupStatusLabel(checklist.groups[2]),
    requiredDate,
    tripStatus: t.status,
    client: t.client_name || "",
    driver: t.driver_display_name || "",
    vehicle: t.vehicle_display_number || "",
    complianceStatus: COMPLIANCE_STAGE_LABEL[summary.stage],
    documentStatus: `${checklist.verified}/${checklist.total} verified`,
    complianceVerifiedAt: summary.complianceVerifiedAt ?? "",
    advanceAmount: summary.advance ? String(summary.advance.amount) : "",
    advanceStatus: summary.advance ? "PROCESSED" : "PENDING",
    advanceUtr: summary.advance?.utr ?? "",
    advancePaidAt: summary.advance?.paidAt ?? "",
    deliveryDate: t.completed_at ?? "",
    hardCopyPodStatus: summary.hardCopyPod.received ? "RECEIVED" : "AWAITING",
    courier: summary.hardCopyPod.courier ?? "",
    awb: summary.hardCopyPod.awbNumber ?? "",
    balanceAmount: summary.balance ? String(summary.balance.amount) : "",
    balanceStatus: summary.balance ? "PAID" : "PENDING",
    balanceUtr: summary.balance?.utr ?? "",
    balancePaidAt: summary.balance?.paidAt ?? "",
    settlementStatus: summary.stage === "payment_settled" ? "SETTLED" : "OPEN",
  };
}

export async function fetchComplianceReportRows(
  orgId: string,
  filters: ComplianceReportFilters,
): Promise<ComplianceReportRow[]> {
  const summaries = await fetchAllComplianceSummaries(orgId);
  const filtered = summaries.filter((s) => {
    if (filters.stage && filters.stage !== "all" && s.stage !== filters.stage) return false;
    if (filters.tripStatus && filters.tripStatus !== "all" && s.trip.status !== filters.tripStatus) return false;
    if (filters.paymentStatus && filters.paymentStatus !== "any" && paymentStatusOf(s) !== filters.paymentStatus) {
      return false;
    }
    const pickupDate = s.trip.pickup_date ?? "";
    if (filters.dateFrom && pickupDate && pickupDate < filters.dateFrom) return false;
    if (filters.dateTo && pickupDate && pickupDate > filters.dateTo) return false;
    return true;
  });
  return filtered.map(toReportRow);
}

const CSV_HEADERS: { key: keyof ComplianceReportRow; label: string }[] = [
  { key: "tripId", label: "Trip ID" },
  { key: "tripDate", label: "Date" },
  { key: "fromLocation", label: "From Location" },
  { key: "toLocation", label: "To Location" },
  { key: "tripVerification", label: "Trip Document Verification" },
  { key: "vehicleVerification", label: "Vehicle Verification" },
  { key: "driverVerification", label: "Driver Verification" },
  { key: "requiredDate", label: "Required Date" },
  { key: "tripStatus", label: "Trip Status" },
  { key: "client", label: "Client" },
  { key: "driver", label: "Driver" },
  { key: "vehicle", label: "Vehicle" },
  { key: "complianceStatus", label: "Compliance Status" },
  { key: "documentStatus", label: "Document Status" },
  { key: "complianceVerifiedAt", label: "Compliance Verified At" },
  { key: "advanceAmount", label: "Advance Amount" },
  { key: "advanceStatus", label: "Advance Status" },
  { key: "advanceUtr", label: "Advance UTR" },
  { key: "advancePaidAt", label: "Advance Paid At" },
  { key: "deliveryDate", label: "Delivery Date" },
  { key: "hardCopyPodStatus", label: "Hard Copy POD Status" },
  { key: "courier", label: "Courier" },
  { key: "awb", label: "AWB" },
  { key: "balanceAmount", label: "Balance Amount" },
  { key: "balanceStatus", label: "Balance Status" },
  { key: "balanceUtr", label: "Balance UTR" },
  { key: "balancePaidAt", label: "Balance Paid At" },
  { key: "settlementStatus", label: "Settlement Status" },
];

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function complianceReportToCsv(rows: ComplianceReportRow[]): string {
  const header = CSV_HEADERS.map((h) => h.label).join(",");
  const lines = rows.map((row) => CSV_HEADERS.map((h) => csvEscape(row[h.key])).join(","));
  return [header, ...lines].join("\n");
}
