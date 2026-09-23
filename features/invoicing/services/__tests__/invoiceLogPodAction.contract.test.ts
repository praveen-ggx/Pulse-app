import { readFileSync } from "fs";
import { join } from "path";

describe("Invoice-side Log POD reuses Pulse POD hard-copy flow", () => {
  const executeSrc = readFileSync(
    join(__dirname, "../../InvoicingExecuteScreen.tsx"),
    "utf8",
  );
  const podModalSrc = readFileSync(
    join(
      __dirname,
      "../../../../features/log-pods/components/LogIncomingPodsModal.tsx",
    ),
    "utf8",
  );
  const serviceSrc = readFileSync(
    join(__dirname, "../../../../features/log-pods/services/logPods.service.ts"),
    "utf8",
  );
  const lrSrc = readFileSync(
    join(
      __dirname,
      "../../../../features/trips/services/tripDocumentLrPod.service.ts",
    ),
    "utf8",
  );

  it("Invoice opens the same LogIncomingPodsModal as the POD tab", () => {
    expect(executeSrc).toMatch(/LogIncomingPodsModal/);
    expect(executeSrc).toMatch(/preselectedTripIds/);
    expect(executeSrc).not.toMatch(/FinanceInvoiceLogPodModal/);
    expect(podModalSrc).toMatch(/useMarkHardCopyPodsReceivedMutation/);
    expect(podModalSrc).toMatch(/markReceived\.mutate\(/);
  });

  it("hard-copy receipt goes through record_trip_hard_copy_pod only", () => {
    expect(serviceSrc).toMatch(/markTripHardCopyPodReceived/);
    expect(lrSrc).toMatch(/rpc\("record_trip_hard_copy_pod"/);
    expect(podModalSrc).not.toMatch(/trip_documents/);
    expect(serviceSrc).not.toMatch(
      /from\("trip_documents"\)[\s\S]{0,120}insert/,
    );
  });

  it("does not invent a second Invoice POD mutation", () => {
    expect(executeSrc).not.toMatch(/from\("trip_documents"\)/);
    expect(executeSrc).not.toMatch(/record_trip_hard_copy_pod/);
  });

  it("Invoice Log POD does not load the POD tab 3000-trip list", () => {
    expect(podModalSrc).toMatch(/visible && !lockToPreselected \? orgId : null/);
    expect(executeSrc).not.toMatch(/fetchTripsForLogPods/);
    expect(executeSrc).not.toMatch(/get_trips_for_pod_org/);
  });
});
