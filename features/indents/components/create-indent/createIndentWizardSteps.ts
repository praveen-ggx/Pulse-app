import {
  isValidIndentVehicleCount,
  type FormState,
  type IndentDistributionChoice,
} from "./createIndentForm.types";
import { tonsOutsideVehicleRange } from "@/features/vehicles/utils/vehicleTypeCatalog.model";

export type IndentWizardStep =
  | "route"
  | "client"
  | "prices"
  | "quote"
  | "share"
  | "vehicle"
  | "loadType"
  | "weight";

export const INDENT_WIZARD_STEPS: IndentWizardStep[] = [
  "client",
  "route",
  "vehicle",
  "prices",
  "quote",
  "share",
];

/** Stepper chips — share is a follow-on page of Target, not its own step. */
export const INDENT_WIZARD_PROGRESS_STEPS: IndentWizardStep[] =
  INDENT_WIZARD_STEPS.filter((id) => id !== "share");

export function indentShareSubmitLabel(
  choice: IndentDistributionChoice,
): string {
  switch (choice) {
    case "marketplace":
      return "Share it to marketplace";
    case "both":
      return "Share it to both (network and market)";
    default:
      return "Share it to network";
  }
}

export function indentWizardStepLabel(step: IndentWizardStep): string {
  switch (step) {
    case "route":
      return "Route";
    case "client":
      return "Client";
    case "prices":
    case "share":
      return "Target";
    case "quote":
      return "Quote";
    case "vehicle":
      return "Load";
    case "loadType":
      return "Product type";
    case "weight":
      return "Weight";
    default:
      return "Load";
  }
}

export function indentStepCanAdvance(
  step: IndentWizardStep,
  form: FormState,
): boolean {
  const t = (s: string | null | undefined) => (s ?? "").trim();
  switch (step) {
    case "route":
      return Boolean(
        t(form.pickup_area) && t(form.drop_location) && t(form.pickup_date),
      );
    case "client": {
      const price = parseFloat(String(form.client_price ?? "").replace(/,/g, ""));
      const unit = parseFloat(String(form.sale_unit_rate ?? "").replace(/,/g, ""));
      const hasSale =
        form.sale_rate_basis === "per_mt"
          ? Number.isFinite(unit) && unit > 0
          : Number.isFinite(price) && price > 0;
      return Boolean(form.client_id?.trim() && t(form.client_name) && hasSale);
    }
    case "prices": {
      const st = parseFloat(
        String(form.supplier_target ?? "").replace(/,/g, ""),
      );
      return (
        Boolean(t(form.supplier_target)) &&
        Number.isFinite(st) &&
        st > 0
      );
    }
    case "quote":
      return (
        form.supplier_rate_basis === "per_mt" ||
        form.supplier_rate_basis === "per_trip"
      );
    case "share":
      return (
        form.circulation_target === "integrated_supplier" ||
        form.circulation_target === "marketplace" ||
        form.circulation_target === "both"
      );
    case "vehicle": {
      const w = parseFloat(String(form.weight ?? "").replace(/,/g, ""));
      const unit = parseFloat(String(form.sale_unit_rate ?? "").replace(/,/g, ""));
      const weightOk =
        form.sale_rate_basis === "per_mt" && Number.isFinite(unit) && unit > 0
          ? !t(form.weight) || (Number.isFinite(w) && w > 0)
          : Boolean(t(form.weight) && Number.isFinite(w) && w > 0);
      return Boolean(
        t(form.vehicle_type) &&
          t(form.load_type) &&
          weightOk &&
          !tonsOutsideVehicleRange(form.vehicle_type, form.weight) &&
          isValidIndentVehicleCount(form.vehicle_count),
      );
    }
    case "loadType":
      return Boolean(t(form.load_type));
    case "weight": {
      const w = parseFloat(String(form.weight ?? "").replace(/,/g, ""));
      return Boolean(t(form.weight) && Number.isFinite(w) && w > 0);
    }
    default:
      return false;
  }
}

/** Legacy 3-step grouping for non-wizard visibility (unused on mobile). */
export type IndentWizardGroup = "route" | "commercial" | "load";

export function indentStepToGroup(step: IndentWizardStep): IndentWizardGroup {
  if (step === "route") return "route";
  if (step === "client" || step === "prices" || step === "quote" || step === "share")
    return "commercial";
  return "load";
}
