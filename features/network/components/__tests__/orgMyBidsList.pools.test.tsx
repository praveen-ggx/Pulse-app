import { OrgMyBidsList } from "@/features/network/components/OrgMyBidsList";
import type { MyOrgMarketBidRow } from "@/features/network/services/findLoadsForOrg.service";
import { render, screen } from "@testing-library/react-native";

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/features/network/utils/storyDisplay", () => ({
  ...jest.requireActual("@/features/network/utils/storyDisplay"),
  formatStoryDate: (iso: string) => iso.slice(0, 10),
}));
jest.mock("@/features/network/services/marketBids.service", () => ({
  createMarketplaceFeeOrder: jest.fn(),
  createTestMarketplaceFeeOrder: jest.fn(),
  settleMarketplaceFeeAsCash: jest.fn(),
  simulateTestMarketplaceFeePayment: jest.fn(),
  marketplaceFeeGateSatisfied: (s: string | null | undefined) =>
    s === "paid" || s === "not_required",
}));
jest.mock("@/features/marketplace/components/RazorpayCheckoutSheet", () => ({
  RazorpayCheckoutSheet: () => null,
}));
jest.mock("@/features/marketplace/components/PilotPaymentMethodSheet", () => ({
  PilotPaymentMethodSheet: () => null,
  PilotTestCheckoutSheet: () => null,
}));
jest.mock("@/features/driver/components/RazorpayTestPreviewSheet", () => ({
  RazorpayTestPreviewSheet: () => null,
}));
jest.mock("@/features/indents/initialIndentForDetail", () => ({
  setInitialIndentForDetail: jest.fn(),
}));
jest.mock("@/lib/appAlert", () => ({ showAppAlert: jest.fn() }));
jest.mock("@/lib/confirmDialog", () => ({ confirmDialog: jest.fn() }));

const LANE = {
  pickup_area: "Periyapalayam, Tamil Nadu",
  drop_location: "Poonamallee, Tamil Nadu",
  load_type: "Machinery Parts",
};

function bid(
  overrides: Partial<MyOrgMarketBidRow> & Pick<MyOrgMarketBidRow, "id">,
): MyOrgMarketBidRow {
  return {
    indent_id: `indent-${overrides.id}`,
    indent_number: `IND-${overrides.id.toUpperCase()}`,
    ...LANE,
    pickup_date: "2026-11-07",
    owner_organization_id: `org-${overrides.id}`,
    owner_organization_name: `Shipper ${overrides.id.toUpperCase()}`,
    owner_masked_phone: "****1234",
    owner_phone: null,
    amount: 4000,
    note: null,
    status: "pending",
    fee_payment_status: "not_required",
    platform_fee_amount: null,
    created_at: "2026-11-11T07:48:00Z",
    accepted_at: null,
    ...overrides,
  };
}

describe("OrgMyBidsList pooled Pending / Not selected", () => {
  it("groups same-lane pending and closed bids into anonymous pool cards", () => {
    render(
      <OrgMyBidsList
        isLoading={false}
        bids={[
          bid({ id: "p1", amount: 4000 }),
          bid({ id: "p2", amount: 4500 }),
          bid({ id: "r1", status: "rejected" }),
          bid({ id: "w1", status: "withdrawn" }),
        ]}
      />,
    );

    // One Pending pool (2 bids) + one Not selected pool (rejected+withdrawn → MIXED).
    expect(screen.getAllByTestId(/^marketplace-bid-pool-/)).toHaveLength(2);
    expect(screen.getByText("PENDING · 2")).toBeTruthy();
    expect(screen.getByText("NOT SELECTED · 2")).toBeTruthy();
    expect(screen.getByText("MIXED")).toBeTruthy();

    // A4.4: no shipper identity or indent number before award.
    for (const id of ["P1", "P2", "R1", "W1"]) {
      expect(screen.queryByText(`Shipper ${id}`)).toBeNull();
      expect(screen.queryByText(`IND-${id}`)).toBeNull();
    }
    expect(screen.queryByText("****1234")).toBeNull();
  });

  it("keeps awarded bids on the identified card with Pay / Assign", () => {
    render(
      <OrgMyBidsList
        isLoading={false}
        orgId="org-me"
        bids={[
          bid({ id: "a1", status: "accepted", fee_payment_status: "required" }),
          bid({ id: "a2", status: "accepted", fee_payment_status: "paid" }),
          bid({ id: "p1" }),
        ]}
      />,
    );

    expect(screen.getByText("AWARDED · 2")).toBeTruthy();
    expect(screen.getByText("Shipper A1")).toBeTruthy();
    expect(screen.getByText("IND-A1")).toBeTruthy();
    expect(screen.getByText("Shipper A2")).toBeTruthy();
    expect(screen.getByText("Pay fee")).toBeTruthy();
    expect(screen.getByLabelText("Assign vehicle")).toBeTruthy();

    // Pending bid alongside still stays anonymous.
    expect(screen.queryByText("Shipper P1")).toBeNull();
    expect(screen.queryByText("IND-P1")).toBeNull();
    expect(screen.getAllByTestId(/^marketplace-bid-pool-/)).toHaveLength(1);
  });
});
