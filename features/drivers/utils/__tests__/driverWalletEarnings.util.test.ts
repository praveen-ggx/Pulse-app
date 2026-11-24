import { applyDcoPartyTagToNotes } from "../dcoTripPartyTag.util";
import {
  driverWalletTripEarnings,
  type DriverWalletEarningsContext,
} from "../driverWalletEarnings.util";
import type { TripRow } from "@/features/trips/services/trips.service";

const EMPLOYER = "org-employer";
const BROKER = "org-broker";
const SHIPPER = "org-shipper";

function trip(partial: Partial<TripRow> & { id: string }): TripRow {
  return {
    organization_id: EMPLOYER,
    trip_number: "TRP001",
    indent_id: null,
    source: "manual",
    operating_mode: null,
    status: "completed",
    driver_id: "drv-1",
    client_id: null,
    client_name: "",
    client_price: 0,
    supplier_rate: 0,
    driver_commission: 0,
    notes: null,
    distance: null,
    ...partial,
  } as unknown as TripRow;
}

function ctx(partial: Partial<DriverWalletEarningsContext> = {}): DriverWalletEarningsContext {
  return {
    isFleetDispatched: false,
    hasAgreedPayoutTerms: false,
    payoutTerms: null,
    driverOrgIds: [EMPLOYER],
    ...partial,
  };
}

describe("driverWalletTripEarnings", () => {
  describe("fleet trips (employed driver): unchanged agreed-payout behaviour", () => {
    it("uses the explicit driver_commission when terms are agreed", () => {
      const t = trip({ id: "f1", client_price: 20000, driver_commission: 1900 });
      expect(
        driverWalletTripEarnings(t, ctx({ isFleetDispatched: true, hasAgreedPayoutTerms: true })),
      ).toBe(1900);
    });

    it("uses agreed commission percent of the trip amount", () => {
      const t = trip({ id: "f2", client_price: 10000 });
      expect(
        driverWalletTripEarnings(
          t,
          ctx({
            isFleetDispatched: true,
            hasAgreedPayoutTerms: true,
            payoutTerms: { commissionPercent: 12 },
          }),
        ),
      ).toBe(1200);
    });

    it("is 0 without agreed terms, even with a client price", () => {
      const t = trip({ id: "f3", client_price: 15000, supplier_rate: 12000 });
      expect(driverWalletTripEarnings(t, ctx({ isFleetDispatched: true }))).toBe(0);
    });
  });

  describe("awarded load: broker copy vs mover row", () => {
    const moverRow = trip({
      id: "mover",
      organization_id: EMPLOYER,
      indent_id: "ind-1",
      client_price: 2500,
      driver_commission: 1900,
    });
    const brokerRow = trip({
      id: "broker",
      organization_id: BROKER,
      indent_id: "ind-1",
      client_price: 38000,
      supplier_rate: 27500,
      driver_commission: 0,
    });

    it("broker's copy earns nothing: no client_price, no supplier_rate guess", () => {
      expect(driverWalletTripEarnings(brokerRow, ctx())).toBe(0);
    });

    it("only the employer's row counts toward the total", () => {
      const total = [moverRow, brokerRow].reduce(
        (sum, t) =>
          sum +
          driverWalletTripEarnings(
            t,
            ctx({
              isFleetDispatched: t.organization_id === EMPLOYER,
              hasAgreedPayoutTerms: t.organization_id === EMPLOYER,
            }),
          ),
        0,
      );
      expect(total).toBe(1900);
    });

    it("keeps an explicit commission on a broker row whose mover row is missing", () => {
      const orphan = trip({ id: "orphan", organization_id: BROKER, client_price: 9000, driver_commission: 4500 });
      expect(driverWalletTripEarnings(orphan, ctx())).toBe(4500);
    });
  });

  describe("DCO driver", () => {
    it("marketplace DCO trip earns the agreed supplier_rate, not the shipper's client_price", () => {
      const t = trip({
        id: "dco1",
        organization_id: SHIPPER,
        source: "market_bid",
        operating_mode: "DCO",
        client_price: 50000,
        supplier_rate: 31000,
      });
      expect(driverWalletTripEarnings(t, ctx({ driverOrgIds: [] }))).toBe(31000);
    });

    it("DCO trip without a supplier_rate is 0, never client_price", () => {
      const t = trip({
        id: "dco2",
        organization_id: SHIPPER,
        source: "market_bid",
        operating_mode: "DCO",
        client_price: 50000,
      });
      expect(driverWalletTripEarnings(t, ctx({ driverOrgIds: [] }))).toBe(0);
    });

    it("own offline trip tagged with a billed amount earns that amount", () => {
      const t = trip({
        id: "self1",
        client_price: 99999,
        notes: applyDcoPartyTagToNotes(null, { id: "party-1", name: "Ravi Traders", billed: 7200 }),
      });
      expect(driverWalletTripEarnings(t, ctx({ driverOrgIds: [] }))).toBe(7200);
    });
  });

  describe("non-DCO driver, non-fleet trip", () => {
    it("untagged trip with only a client price is 0 (no client_price fallback)", () => {
      const t = trip({ id: "n1", organization_id: SHIPPER, client_price: 18000 });
      expect(driverWalletTripEarnings(t, ctx())).toBe(0);
    });

    it("driver with no linked org and only a client price is still 0", () => {
      const t = trip({ id: "n2", client_price: 18000, supplier_rate: 15000 });
      expect(driverWalletTripEarnings(t, ctx({ driverOrgIds: [] }))).toBe(0);
    });

    it("tagged billed amount wins over client price", () => {
      const t = trip({
        id: "n3",
        client_price: 18000,
        notes: applyDcoPartyTagToNotes("load note", { id: "p", name: "P", billed: 6000 }),
      });
      expect(driverWalletTripEarnings(t, ctx())).toBe(6000);
    });
  });
});
