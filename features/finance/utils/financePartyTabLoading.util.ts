import type { FinanceSubTab } from "@/features/finance/types";

/** Party tabs paint from their own catalog. Do not wait on org-wide trips. */
export function isFinancePartyTabBlocking(args: {
  activeTab: FinanceSubTab;
  clientsLoading: boolean;
  suppliersLoading: boolean;
  entitiesLoading: boolean;
}): boolean {
  if (args.activeTab === "cash") return false;
  if (args.activeTab === "customers") return args.clientsLoading;
  if (args.activeTab === "suppliers") return args.suppliersLoading;
  return args.entitiesLoading;
}

export function shouldShowFinancePartyCatalogLoading(args: {
  hasRows: boolean;
  catalogPending: boolean;
}): boolean {
  return args.catalogPending && !args.hasRows;
}
