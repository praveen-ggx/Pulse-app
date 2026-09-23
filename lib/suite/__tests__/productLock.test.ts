import {
  isCommerceDataQueryEnabled,
  isCommercePlatformModule,
  isFinanceProDataQueryEnabled,
  isLockedProductPath,
  isSuiteProductLocked,
  isWorkspaceProductLocked,
} from "@/lib/suite/productLock";

describe("productLock", () => {
  it("locks Commerce and Finance Pro suite products", () => {
    expect(isSuiteProductLocked("commerce")).toBe(true);
    expect(isSuiteProductLocked("finance-pro")).toBe(true);
    expect(isSuiteProductLocked("core")).toBe(false);
    expect(isSuiteProductLocked("invoice")).toBe(false);
  });

  it("locks workspace Finance Pro even if DB activation exists", () => {
    expect(isWorkspaceProductLocked("pulse_finance_pro")).toBe(true);
    expect(isWorkspaceProductLocked("pulse_core")).toBe(false);
  });

  it("disables product-owned queries", () => {
    expect(isCommerceDataQueryEnabled()).toBe(false);
    expect(isFinanceProDataQueryEnabled()).toBe(false);
  });

  it("treats Finance Pro and OMS paths as locked", () => {
    expect(isLockedProductPath("/finance-pro")).toBe(true);
    expect(isLockedProductPath("/finance-pro/invoices")).toBe(true);
    expect(isLockedProductPath("/oms")).toBe(true);
    expect(isLockedProductPath("/oms/dashboard")).toBe(true);
    expect(isLockedProductPath("/trips")).toBe(false);
    expect(isLockedProductPath("/pulse-invoice")).toBe(false);
  });

  it("identifies commerce platform modules", () => {
    expect(isCommercePlatformModule("commerce_orders")).toBe(true);
    expect(isCommercePlatformModule("finance_hub")).toBe(false);
  });
});
