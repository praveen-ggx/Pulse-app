import { getInitialClientForDetail, clearInitialClientForDetail } from "@/features/clients/initialClientForDetail";
import { getInitialDriverForDetail, clearInitialDriverForDetail } from "@/features/drivers/initialDriverForDetail";
import { clearInitialSupplierForDetail } from "@/features/suppliers/initialSupplierForDetail";
import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import {
  connectedOrgLedgerDetailRoute,
  seedFinanceDetailFromNetworkConnection,
} from "@/features/network/utils/connectionDetailNavigation.util";

const ORG = "org-1";

afterEach(() => {
  clearInitialClientForDetail("c1");
  clearInitialSupplierForDetail("s1");
  clearInitialDriverForDetail("d1");
});

describe("seedFinanceDetailFromNetworkConnection", () => {
  it("prefers the canonical clients.finite row over the card", () => {
    seedFinanceDetailFromNetworkConnection({
      item: {
        id: "c1",
        name: "Card Name",
        role: "CLIENT",
        is_integrated: false,
      },
      orgId: ORG,
      clients: [{ id: "c1", name: "Cached Client", organization_id: ORG } as never],
      suppliers: [],
      drivers: [],
    });
    expect(getInitialClientForDetail("c1")?.name).toBe("Cached Client");
  });

  it("falls back to the connection card when the book is empty", () => {
    const item: ConnectedOrg = {
      id: "c1",
      name: "Card Client",
      role: "CLIENT",
      is_integrated: true,
      phone: "999",
    };
    seedFinanceDetailFromNetworkConnection({
      item,
      orgId: ORG,
      clients: [],
      suppliers: [],
      drivers: [],
    });
    const seed = getInitialClientForDetail("c1");
    expect(seed?.name).toBe("Card Client");
    expect(seed?.phone).toBe("999");
    expect(seed?.is_integrated).toBe(true);
  });

  it("strips driver- prefix when seeding driver detail", () => {
    seedFinanceDetailFromNetworkConnection({
      item: {
        id: "driver-d1",
        name: "Ravi",
        role: "DRIVER",
        is_integrated: false,
      },
      orgId: ORG,
      clients: [],
      suppliers: [],
      drivers: [],
    });
    expect(getInitialDriverForDetail("d1")?.name).toBe("Ravi");
  });
});

describe("connectedOrgLedgerDetailRoute", () => {
  it("routes clients to cash detail", () => {
    expect(
      connectedOrgLedgerDetailRoute({
        id: "c1",
        name: "A",
        role: "CLIENT",
        is_integrated: false,
      }),
    ).toContain("/client/c1");
  });
});
