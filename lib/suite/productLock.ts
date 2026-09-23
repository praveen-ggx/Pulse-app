/**
 * Hard lock for Commerce and Finance Pro.
 * Users see a lock icon only — no product flow and no product-owned queries.
 */

export const LOCKED_SUITE_PRODUCT_IDS = ["commerce", "finance-pro"] as const;

export type LockedSuiteProductId = (typeof LOCKED_SUITE_PRODUCT_IDS)[number];

export function isSuiteProductLocked(
  id: string | null | undefined,
): boolean {
  return id === "commerce" || id === "finance-pro";
}

export function isWorkspaceProductLocked(id: string | null | undefined): boolean {
  return id === "pulse_finance_pro" && isSuiteProductLocked("finance-pro");
}

/** Commerce tables: sales_orders, execution_plans, execution_plan_stops. */
export function isCommerceDataQueryEnabled(): boolean {
  return !isSuiteProductLocked("commerce");
}

export function isFinanceProDataQueryEnabled(): boolean {
  return !isSuiteProductLocked("finance-pro");
}

export function isLockedProductPath(pathname: string): boolean {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (isSuiteProductLocked("finance-pro")) {
    if (path === "/finance-pro" || path.startsWith("/finance-pro/")) return true;
  }
  if (isSuiteProductLocked("commerce")) {
    if (path === "/oms" || path.startsWith("/oms/")) return true;
  }
  return false;
}

export function isCommercePlatformModule(moduleId: string): boolean {
  return moduleId.startsWith("commerce_");
}
