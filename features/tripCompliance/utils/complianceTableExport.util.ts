/**
 * Excel download for the Compliance table. Rows and columns follow the
 * filters, date sort, and tab the user is looking at.
 */
import {
  complianceEventAt,
  compareComplianceSummariesByEvent,
  tripOpsStatusBadge,
  verificationStatusVisual,
} from "@/features/tripCompliance/utils/complianceCardVisual.util";
import {
  deriveComplianceQueueReadiness,
  paymentReadinessLabel,
} from "@/features/tripCompliance/utils/complianceReadiness.util";
import {
  complianceVaultDocNumber,
  complianceVaultDocNumbers,
  deriveComplianceEwayBill,
  deriveComplianceGroupStatus,
} from "@/features/tripCompliance/utils/complianceTableStatus.util";
import {
  deriveComplianceDocumentRows,
  deriveEntityComplianceRows,
} from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import {
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  REQUIRED_VEHICLE_DOCUMENT_TYPES,
  type ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { formatIndianVehicleNumber } from "@/lib/format";
import * as XLSX from "xlsx";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatComplianceExportDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function complianceExportDateSpan(rows: ComplianceTripSummary[]): { from: string; to: string } | null {
  const dated = rows
    .map((summary) => {
      const iso = complianceEventAt(summary.trip);
      const ms = iso ? Date.parse(iso) : Number.NaN;
      return Number.isNaN(ms) || !iso ? null : { iso, ms };
    })
    .filter((row): row is { iso: string; ms: number } => row != null)
    .sort((a, b) => a.ms - b.ms);
  if (dated.length === 0) return null;
  return {
    from: formatComplianceExportDay(dated[0].iso),
    to: formatComplianceExportDay(dated[dated.length - 1].iso),
  };
}

export function sortComplianceTableRows(
  rows: ComplianceTripSummary[],
  direction: "asc" | "desc",
): ComplianceTripSummary[] {
  return [...rows].sort((a, b) => compareComplianceSummariesByEvent(a, b, direction));
}

export function complianceTableExportMessage(input: {
  count: number;
  filterLabel: string;
  extraFilters: string[];
  search: string;
  from: string | null;
  to: string | null;
  sort: "asc" | "desc";
}): string {
  if (input.count === 0) {
    return `Nothing to export in ${input.filterLabel}.`;
  }
  const filters = [input.filterLabel, ...input.extraFilters.filter(Boolean)];
  const search = input.search.trim();
  if (search) filters.push(`matching “${search}”`);
  const when =
    input.from && input.to
      ? input.from === input.to
        ? `on ${input.from}`
        : `from ${input.from} to ${input.to}`
      : "";
  const order = input.sort === "asc" ? "oldest first" : "newest first";
  const tripWord = input.count === 1 ? "trip" : "trips";
  return [
    `Exporting ${input.count} ${tripWord}`,
    filters.join(", "),
    when,
    order,
  ]
    .filter(Boolean)
    .join(" · ");
}

function groupLabel(status: ReturnType<typeof deriveComplianceGroupStatus>): string {
  if (status.total === 0) return "—";
  return status.status === "approved" ? "Approved" : "Pending";
}

function truckNumber(summary: ComplianceTripSummary): string {
  const raw = summary.trip.vehicle_display_number?.trim() || "";
  return formatIndianVehicleNumber(raw).trim() || raw;
}

function money(amount: number | null | undefined): string | number {
  return amount == null || !Number.isFinite(amount) ? "" : amount;
}

export function buildComplianceTableSheetRows(
  rows: ComplianceTripSummary[],
  compliancePendingLayout: boolean,
): Record<string, string | number>[] {
  return rows.map((summary) => {
    const tripRows = deriveComplianceDocumentRows(summary.documents).filter((row) => row.required);
    const vehicleRows = deriveEntityComplianceRows(
      REQUIRED_VEHICLE_DOCUMENT_TYPES,
      summary.vehicleDocuments,
    ).filter((row) => row.required);
    const driverRows = deriveEntityComplianceRows(
      REQUIRED_DRIVER_DOCUMENT_TYPES,
      summary.driverDocuments,
    ).filter((row) => row.required);
    const eway = deriveComplianceEwayBill(summary.documents);
    const base: Record<string, string | number> = {
      "Trip ID": getTripDisplayNumber(summary.trip),
      Customer: summary.trip.client_name?.trim() || "",
      Date: formatComplianceExportDay(complianceEventAt(summary.trip)),
      From: summary.trip.pickup_area?.trim() || "",
      To: summary.trip.drop_location?.trim() || summary.trip.drop_area?.trim() || "",
      "E-way Bill": eway.numbers.join(" | "),
    };
    if (compliancePendingLayout) {
      base["Invoice No"] = complianceVaultDocNumber(summary.documents, "invoice");
    }
    base.LR = complianceVaultDocNumbers(summary.documents, "lr").join(" | ");
    base["Truck No"] = truckNumber(summary);
    base.Trip = groupLabel(deriveComplianceGroupStatus(tripRows));
    base.Vehicle = groupLabel(deriveComplianceGroupStatus(vehicleRows));
    base.Driver = groupLabel(deriveComplianceGroupStatus(driverRows));
    if (compliancePendingLayout) {
      base["Trip Status"] = tripOpsStatusBadge(summary.trip.status)?.label ?? "";
    }
    base.Stage = verificationStatusVisual(summary).label;
    if (!compliancePendingLayout) {
      const readiness = deriveComplianceQueueReadiness(summary);
      base.Payment = paymentReadinessLabel(readiness).label;
      base.Advance = money(summary.advance?.amount);
      base.Balance = money(summary.balance?.amount);
    }
    return base;
  });
}

export function buildComplianceTableWorkbook(
  rows: ComplianceTripSummary[],
  compliancePendingLayout: boolean,
): XLSX.WorkBook {
  const sheetRows = buildComplianceTableSheetRows(rows, compliancePendingLayout);
  const sheet = XLSX.utils.json_to_sheet(sheetRows.length > 0 ? sheetRows : [{ "Trip ID": "" }]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Compliance");
  return book;
}
