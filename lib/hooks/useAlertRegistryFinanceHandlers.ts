import { useCallback, useState } from "react";
import type { AlertRegistryFinanceHandlers } from "@/components/AlertRegistryPanel";
import { alertDetailRoute } from "@/lib/alertRegistry/alertDetailRoute.util";
import { useOptionalChangeDriverPopup } from "@/contexts/ChangeDriverPopupContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { navigateToOpsAlert } from "@/lib/alertRegistry/registryOpsNavigation.util";
import { useAlertRegistryNotifications } from "@/lib/globalSync/useAlertRegistryNotifications";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";
import { useRouter } from "expo-router";

export function useAlertRegistryFinanceHandlers(): {
  finance: AlertRegistryFinanceHandlers;
  refreshRegistry: () => void;
} {
  const router = useRouter();
  const { t } = useLanguage();
  const { currentOrganization } = useOrganization();
  const changeDriver = useOptionalChangeDriverPopup();
  const orgId = currentOrganization?.id ?? null;
  const [notifActionId, setNotifActionId] = useState<string | null>(null);
  const {
    refreshRegistry,
    rejectSalaryRequest,
  } = useAlertRegistryNotifications(orgId);

  const openAlertDetail = useCallback(
    (
      kind: "salary" | "ops",
      id: string,
      mode: "active" | "archive" = "active",
    ) => {
      router.push(alertDetailRoute(kind, id, mode));
    },
    [router],
  );

  const handleSalaryReject = useCallback(
    async (requestId: string) => {
      setNotifActionId(requestId);
      await rejectSalaryRequest(requestId);
      setNotifActionId(null);
    },
    [rejectSalaryRequest],
  );

  const openLedgerForSalaryPayment = useCallback(
    async (req: SalaryRequestWithDriverRow) => {
      const isTripBasedAttribution =
        req.request_type === "trip_based" &&
        String(req.note ?? "").toLowerCase().includes("fleet trip");
      if (isTripBasedAttribution) {
        router.push(
          `/(modals)/attribution-trip-create?requestId=${encodeURIComponent(req.id)}` as const,
        );
        return;
      }
      const driverName = req.drivers?.name?.trim() || t("driver");
      const isTripBased =
        req.request_type === "trip_based" &&
        Array.isArray(req.trip_ids) &&
        req.trip_ids.length > 0;
      const q = new URLSearchParams({
        entityType: "DRIVER",
        entityId: req.driver_id,
        partyName: driverName,
        partyId: req.driver_id,
        defaultType: "out",
        salaryAmount: String(req.amount),
        defaultDriverPaymentType: isTripBased ? "settlement" : "advance",
        salaryRequestId: req.id,
      });
      if (isTripBased && req.trip_ids[0]) {
        q.set("tripId", req.trip_ids[0]);
      }
      router.push(`/(modals)/ledger-sync?${q.toString()}` as const);
    },
    [router, t],
  );

  const viewSalaryArchive = useCallback(
    (req: SalaryRequestWithDriverRow) => {
      const tripId = Array.isArray(req.trip_ids) ? req.trip_ids[0] : null;
      if (tripId) {
        router.push(`/trip/${tripId}` as const);
        return;
      }
      router.push("/(tabs)/finance" as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const handleDismissOps = useCallback(
    async (ops: GlobalOperationAlert) => {
      if (!orgId) {
        useGlobalSyncStore.getState().dismissOperationAlert(ops.id);
        return;
      }
      await useGlobalSyncStore.getState().acknowledgeGlobalAlert(ops.id, orgId);
    },
    [orgId],
  );

  const handleOpenOps = useCallback(
    (ops: GlobalOperationAlert) => {
      navigateToOpsAlert(router, ops, {
        onOpenChangeDriver: changeDriver?.openChangeDriver,
      });
    },
    [changeDriver?.openChangeDriver, router],
  );

  const finance: AlertRegistryFinanceHandlers = {
    onOpenDetail: openAlertDetail,
    onRejectSalary: (id) => void handleSalaryReject(id),
    onPaySalary: openLedgerForSalaryPayment,
    onViewSalaryArchive: viewSalaryArchive,
    onDismissOps: (ops) => void handleDismissOps(ops),
    onOpenOps: handleOpenOps,
    busySalaryId: notifActionId,
  };

  return { finance, refreshRegistry };
}
