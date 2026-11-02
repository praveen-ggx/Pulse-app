import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  EMPTY_INVOICE_STYLE_DETAILS,
  invoiceOrgDefaultsKey,
  invoiceStyleTemplateCacheKey,
  loadInvoiceStyleLibrary,
  loadOrgInvoiceDefaults,
  mergeInvoiceStyleDefaults,
  normalizeInvoiceStyleName,
  resetInvoiceStyleTemplateProbeForTests,
  saveInvoiceStyleTemplate,
  saveOrgInvoiceDefaults,
} from "@/features/invoicing/services/invoiceStyleTemplate.service";

const mockFrom = jest.fn();

jest.mock("@/lib/avatarUpload", () => ({
  AVATAR_BUCKET: "userprofiles",
  getSignedAvatarUrl: jest.fn(async (path: string) => path),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: mockFrom,
    auth: { getSession: jest.fn(async () => ({ data: { session: null } })) },
    storage: { from: jest.fn() },
  }),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

const ORG = "5b471ecb-fbfb-470e-95cf-525d789c761a";
const REMOTE_FLAG_KEY = "@pulse/invoice-style-templates-remote-v1";

describe("invoice style templates", () => {
  const prevUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    resetInvoiceStyleTemplateProbeForTests();
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://xbisiveavvbifbzyfhgy.supabase.co";
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
  });

  it("requires a template name", async () => {
    const result = await saveInvoiceStyleTemplate({
      orgId: ORG,
      name: "   ",
      format: "studio",
      accent: "indigo",
      logoUrl: null,
    });
    expect(result.template).toBeNull();
    expect(normalizeInvoiceStyleName("  Apollo paper  ")).toBe("Apollo paper");
  });

  it("keeps the named template on this device when the table is not migrated yet", async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: null,
            error: { code: "42P01", message: "relation invoice_style_templates does not exist" },
          }),
      }),
    }));

    const result = await saveInvoiceStyleTemplate({
      orgId: ORG,
      name: "Apollo studio",
      format: "studio",
      accent: "indigo",
      logoUrl: null,
      clientId: "client-1",
    });

    expect(result.error).toBeNull();
    expect(result.template?.name).toBe("Apollo studio");
    expect(result.template?.format).toBe("studio");
    const cacheWrite = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
      ([key]) => key === invoiceStyleTemplateCacheKey(ORG),
    );
    expect(cacheWrite).toBeTruthy();
    const stored = JSON.parse(cacheWrite[1]);
    expect(stored.assignments["client-1"]).toBe(result.template?.id);
    expect(stored.templates[0].accent).toBe("indigo");
  });

  it("keeps a filled bank account ahead of an empty new template", () => {
    const saved = mergeInvoiceStyleDefaults(
      { ...EMPTY_INVOICE_STYLE_DETAILS, ifsc: "HDFC0001234" },
      { ...EMPTY_INVOICE_STYLE_DETAILS, bankName: "Megha", terms: "30 days", signatory: "Anita" },
    );
    expect(saved.ifsc).toBe("HDFC0001234");
    expect(saved.bankName).toBe("Megha");
    expect(saved.terms).toBe("30 days");
    expect(saved.signatory).toBe("Anita");
    expect(saved.signatureUrl).toBe("");
  });

  it("stores organization invoice details on this device and on the organization", async () => {
    const settings = { customRoles: [{ id: "role-1" }] };
    mockFrom.mockImplementation((table: string) => {
      if (table !== "organizations") return {};
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { settings }, error: null }),
          }),
        }),
        update: (payload: { settings: Record<string, unknown> }) => ({
          eq: () => {
            Object.assign(settings, payload.settings);
            return Promise.resolve({ error: null });
          },
        }),
      };
    });
    await saveOrgInvoiceDefaults(ORG, {
      ...EMPTY_INVOICE_STYLE_DETAILS,
      bankName: "Megha Engineering",
      ifsc: "HDFC0001234",
      signatory: "Anita",
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === invoiceOrgDefaultsKey(ORG)) {
        return JSON.stringify({ ...EMPTY_INVOICE_STYLE_DETAILS, terms: "Detention extra" });
      }
      return null;
    });
    const loaded = await loadOrgInvoiceDefaults(ORG);
    expect(loaded.bankName).toBe("Megha Engineering");
    expect(loaded.ifsc).toBe("HDFC0001234");
    expect(loaded.signatory).toBe("Anita");
    expect(loaded.terms).toBe("Detention extra");
    expect(settings).toMatchObject({
      customRoles: [{ id: "role-1" }],
      invoiceDefaults: { bankName: "Megha Engineering", ifsc: "HDFC0001234" },
    });
  });

  it("does not probe invoice_style_templates when remote was marked unavailable", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === REMOTE_FLAG_KEY) return "0";
      return null;
    });
    await loadInvoiceStyleLibrary(ORG, null);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
