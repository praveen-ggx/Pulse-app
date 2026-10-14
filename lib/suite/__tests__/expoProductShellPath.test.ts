import {
  expoProductShellIdFromPathname,
  expoProductShellIdFromRouteNames,
  flattenNavigationRouteNames,
  pathnameUsesExpoProductShell,
} from "../suiteProducts";

describe("expo product shell path", () => {
  it("maps Finance Pro, Invoice, and POD prefixes", () => {
    expect(expoProductShellIdFromPathname("/finance-pro")).toBe("finance-pro");
    expect(expoProductShellIdFromPathname("/finance-pro/trip/abc")).toBe(
      "finance-pro",
    );
    expect(expoProductShellIdFromPathname("finance-pro")).toBe("finance-pro");
    expect(expoProductShellIdFromPathname("/pulse-invoice")).toBe("invoice");
    expect(expoProductShellIdFromPathname("/invoicing-execute")).toBe("invoice");
    expect(expoProductShellIdFromPathname("/pod-reconciliation")).toBe("pod");
    expect(expoProductShellIdFromPathname("/log-incoming-pods")).toBe("pod");
    expect(expoProductShellIdFromPathname("/debit-control")).toBe("pod");
  });

  it("does not treat Core workspace as a product shell", () => {
    expect(expoProductShellIdFromPathname("/workspace")).toBeNull();
    expect(expoProductShellIdFromPathname("/trips")).toBeNull();
    expect(pathnameUsesExpoProductShell("/workspace")).toBe(false);
    expect(pathnameUsesExpoProductShell("/finance-pro")).toBe(true);
  });

  it("uses the last product-shell route under workspace", () => {
    expect(
      expoProductShellIdFromRouteNames(["(tabs)", "finance-pro", "workspace"]),
    ).toBe("finance-pro");
    expect(expoProductShellIdFromRouteNames(["(tabs)", "workspace"])).toBeNull();
  });

  it("flattens nested navigation names", () => {
    expect(
      flattenNavigationRouteNames({
        routes: [
          { name: "(tabs)" },
          {
            name: "finance-pro",
            state: { routes: [{ name: "index" }] },
          },
          { name: "workspace" },
        ],
      }),
    ).toEqual(["(tabs)", "finance-pro", "index", "workspace"]);
  });
});
