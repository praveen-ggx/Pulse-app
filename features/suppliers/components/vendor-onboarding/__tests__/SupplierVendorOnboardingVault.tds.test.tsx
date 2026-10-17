import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import type { SupplierKycDocument } from "@/features/suppliers/types/supplierManagement.types";
import { SupplierVendorOnboardingVault } from "@/features/suppliers/components/vendor-onboarding/SupplierVendorOnboardingVault";

jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  const dims = { width: 1280, height: 900, scale: 2, fontScale: 1 };
  return new Proxy(RN, {
    get: (target, prop) =>
      prop === "useWindowDimensions" ? () => dims : target[prop as keyof typeof target],
  });
});
jest.mock("@expo/vector-icons/FontAwesome", () => () => null);
jest.mock("expo-font", () => ({ isLoaded: () => true, loadAsync: jest.fn() }));

/** In-memory "database" the mocked services read and write. */
let mockDocs: SupplierKycDocument[] = [];
const mockUpsertTds = jest.fn(async () => ({ error: null }));
const mockRemoveDoc = jest.fn(async (doc: { id: string }) => {
  mockDocs = mockDocs.filter((d) => d.id !== doc.id);
  return { error: null };
});
const mockNotify = jest.fn();

jest.mock("@/features/suppliers/services/supplierKycDocuments.service", () => ({
  getSupplierKycDocuments: jest.fn(async () => ({ error: null, documents: [...mockDocs] })),
  removeSupplierKycDocument: (doc: { id: string }) => mockRemoveDoc(doc),
  updateSupplierKycDocumentStatus: jest.fn(async () => ({ error: null })),
}));

jest.mock("@/features/suppliers/services/supplierVendorOnboarding.service", () => ({
  deleteSupplierBankAccount: jest.fn(async () => ({ error: null })),
  deleteSupplierTdsRate: jest.fn(async () => ({ error: null })),
  getVendorOnboardingProfile: jest.fn(async () => ({
    error: null,
    profile: {
      vendor_status: "active",
      blacklist_reason: null,
      status_changed_at: null,
      advance_percentage: null,
      aadhaar_number: null,
      pan_number: null,
      gstin: null,
      msme_number: null,
      gumasta_number: null,
      phone: null,
      secondary_phone: null,
      is_integrated: false,
    },
  })),
  listSupplierBankAccounts: jest.fn(async () => ({ error: null, accounts: [] })),
  listSupplierTdsRates: jest.fn(async () => ({ error: null, rates: [] })),
  saveSupplierBankAccount: jest.fn(async () => ({ error: null })),
  setVendorStatus: jest.fn(async () => ({ error: null })),
  updateVendorAdvancePercentage: jest.fn(async () => ({ error: null })),
  updateVendorIdentityNumbers: jest.fn(async () => ({ error: null })),
  upsertSupplierTdsRate: (...args: unknown[]) => mockUpsertTds(...(args as [])),
}));

jest.mock("@/features/suppliers/utils/supplierKycUpload.util", () => ({
  notifySupplierKycUser: (...args: unknown[]) => mockNotify(...args),
  openSupplierKycDocument: jest.fn(),
  pickAndUploadSupplierKycDocument: jest.fn(
    async (input: { docType: string; docLabel?: string }) => {
      const n = mockDocs.length + 1;
      mockDocs.push({
        id: `doc-${n}`,
        organization_id: "org-1",
        supplier_id: "sup-1",
        doc_type: input.docType,
        doc_label: input.docLabel ?? null,
        storage_path: `org-1/supplier/sup-1/${input.docType}_${n}.pdf`,
        file_name: `form-${n}.pdf`,
        status: "pending",
        version_number: 1,
        created_at: `2026-10-0${n}T00:00:00Z`,
        updated_at: `2026-10-0${n}T00:00:00Z`,
      } as SupplierKycDocument);
      return { status: "ok" };
    },
  ),
}));

jest.mock("@/features/suppliers/utils/ifscDirectory.util", () => ({
  isWellFormedIfsc: () => false,
  lookupIfsc: jest.fn(async () => null),
}));
jest.mock("@/features/suppliers/utils/supplierBankEvents.util", () => ({ emitSupplierBankChanged: jest.fn() }));

async function renderVault() {
  render(<SupplierVendorOnboardingVault organizationId="org-1" supplierId="sup-1" canEdit />);
  return screen.findByPlaceholderText("e.g. 1 or 2");
}

beforeEach(() => {
  mockDocs = [];
  mockUpsertTds.mockClear();
  mockRemoveDoc.mockClear();
  mockNotify.mockClear();
});

describe("Supplier vault — TDS supporting document", () => {
  it("keeps the typed 0% and shows the uploaded file with View / Verify / Remove and Add another", async () => {
    const input = await renderVault();
    fireEvent.changeText(input, "0");

    expect(screen.getByText("Mandatory")).toBeTruthy();
    expect(screen.getByText("No TDS supporting document uploaded yet.")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText("Upload document"));
    });

    // The upload reloads the vault: the unsaved rate must survive and the file must show.
    await waitFor(() => expect(screen.getByText(/TDS supporting document · FY/)).toBeTruthy());
    expect(screen.getByPlaceholderText("e.g. 1 or 2").props.value).toBe("0");
    expect(screen.getByText("View")).toBeTruthy();
    expect(screen.getByText("Verify")).toBeTruthy();
    expect(screen.getByText("Remove")).toBeTruthy();
    expect(screen.getByText("Add another")).toBeTruthy();

    // A second file can be added for the same year.
    await act(async () => {
      fireEvent.press(screen.getByText("Add another"));
    });
    await waitFor(() => expect(screen.getAllByText(/TDS supporting document · FY/)).toHaveLength(2));
  });

  it("blocks saving 0% until a document is uploaded", async () => {
    const input = await renderVault();
    fireEvent.changeText(input, "0");
    await act(async () => {
      fireEvent.press(screen.getByText("Save"));
    });
    expect(mockUpsertTds).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith("Check the form", expect.stringMatching(/mandatory/i));
  });

  it("saves 0% once its document is uploaded", async () => {
    const input = await renderVault();
    fireEvent.changeText(input, "0");
    await act(async () => {
      fireEvent.press(screen.getByText("Upload document"));
    });
    await waitFor(() => expect(screen.getByText("Add another")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText("Save"));
    });
    expect(mockUpsertTds).toHaveBeenCalledWith("org-1", "sup-1", expect.any(String), 0);
  });

  it("treats rates above 0 as optional and saves without a document", async () => {
    const input = await renderVault();
    fireEvent.changeText(input, "2");
    expect(screen.getByText("Optional")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText("Save"));
    });
    expect(mockUpsertTds).toHaveBeenCalledWith("org-1", "sup-1", expect.any(String), 2);
  });

  it("removes an uploaded file after confirmation", async () => {
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    const input = await renderVault();
    fireEvent.changeText(input, "0");
    await act(async () => {
      fireEvent.press(screen.getByText("Upload document"));
    });
    await waitFor(() => expect(screen.getByText("Remove")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText("Remove"));
    });
    expect(mockRemoveDoc).toHaveBeenCalledWith(expect.objectContaining({ id: "doc-1" }));
    await waitFor(() => expect(screen.getByText("No TDS supporting document uploaded yet.")).toBeTruthy());
    expect(screen.getByPlaceholderText("e.g. 1 or 2").props.value).toBe("0");
  });
});
