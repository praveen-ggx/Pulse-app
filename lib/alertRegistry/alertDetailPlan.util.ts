import { opsRegistryActionLabel } from "@/lib/alertRegistry/registryOpsPresentation.util";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";
import type { RegistryFeedKind } from "@/lib/globalSync/registryFeed.util";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";

import type { AlertDetailMode } from "./alertDetailRoute.util";

export type AlertDetailFooterPlan = {
  primaryLabel: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
  summary?: string;
  hint?: string | null;
};

function isTripBasedAttribution(req: SalaryRequestWithDriverRow): boolean {
  return (
    req.request_type === "trip_based" &&
    String(req.note ?? "").toLowerCase().includes("fleet trip")
  );
}

export function buildSalaryAlertFooterPlan(
  req: SalaryRequestWithDriverRow,
  mode: AlertDetailMode,
): AlertDetailFooterPlan {
  if (mode === "archive") {
    const hasTrip = Array.isArray(req.trip_ids) && req.trip_ids.length > 0;
    return {
      primaryLabel: hasTrip ? "View trip ledger" : "Open finance",
      summary: `Status · ${String(req.status ?? "resolved").replace(/_/g, " ")}`,
    };
  }

  if (isTripBasedAttribution(req)) {
    return {
      primaryLabel: "Accept",
      secondaryLabel: "Decline",
      summary: "Review fleet trip attribution before accepting.",
      hint: "Accept opens the full attribution flow.",
    };
  }

  return {
    primaryLabel: "Pay now",
    secondaryLabel: "Decline",
    summary: "Record driver payment from treasury.",
    hint: "Pay now opens the ledger sync wizard.",
  };
}

export function buildOpsAlertFooterPlan(ops: GlobalOperationAlert): AlertDetailFooterPlan {
  return {
    primaryLabel: opsRegistryActionLabel(ops),
    secondaryLabel: "Dismiss",
    summary: ops.subtitle?.trim() || ops.title,
    hint:
      ops.category === "unassigned_trip"
        ? /declin/i.test(ops.title)
          ? "Update the driver details to clear this alert."
          : "Assign a driver and vehicle to clear this alert."
        : null,
  };
}

export function buildAlertDetailFooterPlan(input: {
  kind: RegistryFeedKind;
  mode: AlertDetailMode;
  salary?: SalaryRequestWithDriverRow | null;
  ops?: GlobalOperationAlert | null;
}): AlertDetailFooterPlan | null {
  if (input.kind === "salary" && input.salary) {
    return buildSalaryAlertFooterPlan(input.salary, input.mode);
  }
  if (input.kind === "ops" && input.ops) {
    return buildOpsAlertFooterPlan(input.ops);
  }
  return null;
}
