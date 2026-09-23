import { readFileSync } from "fs";
import { join } from "path";
import { summarizeFinanceClientPicture } from "../financeWorkflowState.util";

const NVIDIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const issued = [
  {
    id: "inv-1",
    client_id: NVIDIA,
    client_name: "Nvidia a",
    trip_ids: ["trip-1", "trip-2"],
    total_amount: 156750,
    status: "sent",
  },
];

function nvidiaTrips(trip3: {
  status: string;
  physicalPodReceived: boolean;
  digitalPodPresent: boolean;
}) {
  return [
    {
      id: "trip-1",
      tripStatus: "completed",
      client_id: NVIDIA,
      client_price: 80000,
      physicalPodReceived: true,
      digitalPodPresent: false,
    },
    {
      id: "trip-2",
      tripStatus: "completed",
      client_id: NVIDIA,
      client_price: 76750,
      physicalPodReceived: true,
      digitalPodPresent: false,
    },
    {
      id: "trip-3",
      tripStatus: trip3.status,
      client_id: NVIDIA,
      client_price: 10000,
      physicalPodReceived: trip3.physicalPodReceived,
      digitalPodPresent: trip3.digitalPodPresent,
    },
  ];
}

describe("Nvidia a — Finance Pro client picture", () => {
  it("lists already-invoiced trips, keeps Create Invoice disabled, and shows the issued value", () => {
    const picture = summarizeFinanceClientPicture({
      clientId: NVIDIA,
      clientName: "Nvidia a",
      clientPolicy: "hard_copy",
      trips: nvidiaTrips({
        status: "in_transit",
        physicalPodReceived: false,
        digitalPodPresent: false,
      }),
      issuedInvoices: issued,
    });

    expect(picture).toEqual({
      listedTripCount: 3,
      completedTripCount: 2,
      podPendingTripCount: 0,
      draftTripCount: 0,
      unbilledTripCount: 1,
      eligibleTripCount: 0,
      invoicedTripCount: 2,
      blockedTripCount: 1,
      issuedInvoiceCount: 1,
      issuedInvoiceValue: 156750,
      createInvoiceEnabled: false,
    });
  });

  it("completed + hard_copy + POD pending stays ineligible", () => {
    const picture = summarizeFinanceClientPicture({
      clientId: NVIDIA,
      clientName: "Nvidia a",
      clientPolicy: "hard_copy",
      trips: nvidiaTrips({
        status: "completed",
        physicalPodReceived: false,
        digitalPodPresent: false,
      }),
      issuedInvoices: issued,
    });

    expect(picture.completedTripCount).toBe(3);
    expect(picture.podPendingTripCount).toBe(1);
    expect(picture.unbilledTripCount).toBe(1);
    expect(picture.eligibleTripCount).toBe(0);
    expect(picture.invoicedTripCount).toBe(2);
    expect(picture.blockedTripCount).toBe(1);
    expect(picture.createInvoiceEnabled).toBe(false);
  });

  it("LOG Incoming / record_trip_hard_copy_pod unlocks Create Invoice without a trip_documents row", () => {
    const picture = summarizeFinanceClientPicture({
      clientId: NVIDIA,
      clientName: "Nvidia a",
      clientPolicy: "hard_copy",
      trips: nvidiaTrips({
        status: "completed",
        physicalPodReceived: true,
        digitalPodPresent: false,
      }),
      issuedInvoices: issued,
    });

    expect(picture.eligibleTripCount).toBe(1);
    expect(picture.createInvoiceEnabled).toBe(true);
    expect(picture.issuedInvoiceValue).toBe(156750);

    const afterIssue = summarizeFinanceClientPicture({
      clientId: NVIDIA,
      clientName: "Nvidia a",
      clientPolicy: "hard_copy",
      trips: nvidiaTrips({
        status: "completed",
        physicalPodReceived: true,
        digitalPodPresent: false,
      }),
      issuedInvoices: [
        ...issued,
        {
          id: "inv-2",
          client_id: NVIDIA,
          client_name: "Nvidia a",
          trip_ids: ["trip-3"],
          total_amount: 10000,
          status: "sent",
        },
      ],
    });
    expect(afterIssue).toMatchObject({
      completedTripCount: 3,
      invoicedTripCount: 3,
      eligibleTripCount: 0,
      podPendingTripCount: 0,
      unbilledTripCount: 0,
      issuedInvoiceCount: 2,
      createInvoiceEnabled: false,
    });

    const hardCopySrc = readFileSync(
      join(
        process.cwd(),
        "features/trips/services/tripDocumentLrPod.service.ts",
      ),
      "utf8",
    );
    const fnStart = hardCopySrc.indexOf("export async function markTripHardCopyPodReceived");
    const fnEnd = hardCopySrc.indexOf("\nexport async function", fnStart + 10);
    const body = hardCopySrc.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);
    expect(body).toContain("record_trip_hard_copy_pod");
    expect(body).not.toContain("trip_documents");
    expect(body).not.toContain(".insert(");
  });
});
