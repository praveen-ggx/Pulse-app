/**
 * "Add e-way number" must come with the e-way bill's own document: Save stays
 * off until a file is chosen, and the number + file are saved together.
 */
jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@expo/vector-icons/Feather", () => "Feather");
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "user-1" }, profile: { full_name: "Ashick" } }),
}));
jest.mock("@/contexts/OrganizationContext", () => ({
  useOrganization: () => ({ currentOrganization: { id: "org-1" } }),
}));
jest.mock("@/features/trips/components/trip-detail/adjustment/tripAdjustmentAddedLog.util", () => ({
  fetchAdjustmentActorNames: async () => ({}),
}));
const mockPick = jest.fn();
jest.mock("@/features/tripCompliance/services/complianceVaultUpload.service", () => ({
  pickComplianceVaultFile: (...args: unknown[]) => mockPick(...args),
}));
jest.mock("@/features/tripCompliance/services/complianceDocumentView.service", () => ({
  signCompliancePreviewUrl: async () => null,
}));
jest.mock("@/components/DocumentDateCalendar", () => ({ DocumentDateCalendar: () => null }));

import { act, fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { EwayBillLrStrip } from "@/features/trips/components/trip-detail/EwayBillVaultTab";
import { buildEwayBillStripRows, serializeEwayFieldEntries } from "@/features/trips/services/ewayBillFields.util";

const P1 = "trip-1/eway_bill/p1.pdf";
const rows = buildEwayBillStripRows({
  ewayDoc: {
    id: "eway_bill",
    label: "Eway Bill",
    type: "PDF",
    status: "Uploaded",
    documentNumber: serializeEwayFieldEntries([
      { ewayNo: "122608979624", createdDate: "09-Nov-26", validTill: "10-Nov-26", docNo: "D1", filePath: P1 },
    ]),
    storagePath: P1,
    files: [{ id: "file-1", label: "Eway Bill", type: "PDF", storagePath: P1 }],
  } as never,
});

function renderStrip(onAddWithFile: jest.Mock, onSave: jest.Mock) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <EwayBillLrStrip
        rows={rows}
        onView={() => undefined}
        onUpload={() => undefined}
        canUpload
        canEdit
        onSave={onSave}
        onAddWithFile={onAddWithFile}
        variant="feed"
      />
    </SafeAreaProvider>,
  );
}

beforeEach(() => mockPick.mockReset());

it("keeps Save off until the e-way bill document is chosen, then saves number and file together", async () => {
  const onAddWithFile = jest.fn().mockResolvedValue(true);
  const onSave = jest.fn().mockResolvedValue(true);
  const file = { arrayBuffer: new ArrayBuffer(3), fileName: "ewb2.pdf", mimeType: "application/pdf" };
  mockPick.mockResolvedValue(file);
  const screen = renderStrip(onAddWithFile, onSave);

  fireEvent.press(screen.getAllByLabelText("Add e-way number")[0]!);
  fireEvent.changeText(screen.getByPlaceholderText(/12-digit|E-way bill number|e-way number/i), "123456789124");

  // No document yet: Save does nothing.
  await act(async () => {
    fireEvent.press(screen.getByText("Save"));
  });
  expect(onAddWithFile).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText(/Save stays off until you choose it/)).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Choose e-way bill document"));
  });
  expect(mockPick).toHaveBeenCalledWith("eway_bill");
  expect(screen.getByText("ewb2.pdf")).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByText("Save"));
  });
  expect(onSave).not.toHaveBeenCalled();
  expect(onAddWithFile).toHaveBeenCalledTimes(1);
  const [entry, sentFile] = onAddWithFile.mock.calls[0]!;
  expect(entry.ewayNo).toBe("123456789124");
  expect(sentFile).toBe(file);
});

it("Edit on a card that already has its file does not ask for a document", async () => {
  const onAddWithFile = jest.fn().mockResolvedValue(true);
  const onSave = jest.fn().mockResolvedValue(true);
  const screen = renderStrip(onAddWithFile, onSave);
  fireEvent.press(screen.getAllByLabelText("Edit e-way bill details")[0]!);
  expect(screen.queryByText(/E-way bill document \(required\)/)).toBeNull();
  await act(async () => {
    fireEvent.press(screen.getByText("Save"));
  });
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onAddWithFile).not.toHaveBeenCalled();
});
