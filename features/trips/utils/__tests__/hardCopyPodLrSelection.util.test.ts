import {
  hardCopyPodLrOptionsFromDocuments,
  hardCopyPodLrOptionsFromTrips,
  selectedHardCopyPodTripIds,
  hardCopyPodLrKey,
} from "@/features/trips/utils/hardCopyPodLrSelection.util";

describe("hardCopyPodLrOptionsFromTrips", () => {
  it("maps each LR to its trip and keeps one docket's LRs distinct", () => {
    const options = hardCopyPodLrOptionsFromTrips([
      {
        tripId: "trip-101",
        tripDisplayId: "TRIP-101",
        lrDocumentNumbers: ['{"lrNumber":"LR001, LR002","date":"","invoice":""}'],
      },
      {
        tripId: "trip-103",
        tripDisplayId: "TRIP-103",
        lrDocumentNumbers: ["LR003"],
      },
    ]);

    expect(options).toEqual([
      { lrNumber: "LR001", tripId: "trip-101", tripDisplayId: "TRIP-101" },
      { lrNumber: "LR002", tripId: "trip-101", tripDisplayId: "TRIP-101" },
      { lrNumber: "LR003", tripId: "trip-103", tripDisplayId: "TRIP-103" },
    ]);
  });

  it("returns the trips for the selected LRs only", () => {
    const options = hardCopyPodLrOptionsFromTrips([
      { tripId: "trip-101", tripDisplayId: "TRIP-101", lrDocumentNumbers: ["LR001"] },
      { tripId: "trip-102", tripDisplayId: "TRIP-102", lrDocumentNumbers: ["LR002"] },
      { tripId: "trip-103", tripDisplayId: "TRIP-103", lrDocumentNumbers: ["LR003"] },
    ]);
    const selected = new Set([
      hardCopyPodLrKey(options[0]),
      hardCopyPodLrKey(options[2]),
    ]);

    expect(selectedHardCopyPodTripIds(options, selected)).toEqual(["trip-101", "trip-103"]);
  });
});

describe("hardCopyPodLrOptionsFromDocuments", () => {
  const display = new Map([
    ["trip-152", "NIH250NIHTRIP000152"],
    ["trip-150", "NIH250NIHTRIP000150"],
  ]);

  it("keeps each uploaded LR on its own trip record", () => {
    const options = hardCopyPodLrOptionsFromDocuments(
      [
        { tripId: "trip-152", documentNumber: "AI3583", storagePath: "trip-152/lr/a.pdf" },
        { tripId: "trip-150", documentNumber: "9876543", storagePath: "trip-150/lr/b.pdf" },
      ],
      display,
    );

    expect(options).toEqual([
      { lrNumber: "AI3583", tripId: "trip-152", tripDisplayId: "NIH250NIHTRIP000152" },
      { lrNumber: "9876543", tripId: "trip-150", tripDisplayId: "NIH250NIHTRIP000150" },
    ]);
  });

  it("uses the upload path trip when the document row points at a different trip", () => {
    const options = hardCopyPodLrOptionsFromDocuments(
      [
        {
          tripId: "trip-150",
          documentNumber: "AI3583",
          storagePath: "trip-152/lr/uploaded.pdf",
        },
      ],
      display,
    );

    expect(options).toEqual([
      { lrNumber: "AI3583", tripId: "trip-152", tripDisplayId: "NIH250NIHTRIP000152" },
    ]);
  });

  it("does not take the trip id stored inside an LR payload when that is a different trip", () => {
    const raw = JSON.stringify({
      kind: "e_lr",
      snapshot: {
        lrNumber: "AI3583",
        tripId: "trip-150",
        generatedAt: "2026-10-01T00:00:00.000Z",
        consignor: { name: "A" },
        transporter: { name: "B" },
        vehicle: { registrationNumber: "KA01" },
        route: { origin: "X", destination: "Y" },
        trip: { tripId: "trip-150", tripNumber: "NIH250NIHTRIP000150", tripDate: "2026-10-01" },
      },
    });

    const options = hardCopyPodLrOptionsFromDocuments(
      [{ tripId: "trip-152", documentNumber: raw, storagePath: "trip-152/lr/elr.json" }],
      display,
    );

    expect(options).toEqual([
      { lrNumber: "AI3583", tripId: "trip-152", tripDisplayId: "NIH250NIHTRIP000152" },
    ]);
  });
});
