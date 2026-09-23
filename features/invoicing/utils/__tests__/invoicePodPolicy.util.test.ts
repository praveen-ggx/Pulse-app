import {
  invoicePodPolicyLabel,
  memberCanManageClientInvoicePodPolicy,
  parseInvoicePodPolicy,
  resetClientInvoicePodPolicy,
  resolveInvoicePodPolicy,
} from "../invoicePodPolicy.util";

describe("parseInvoicePodPolicy", () => {
  it("accepts none", () => {
    expect(parseInvoicePodPolicy("none")).toEqual({ ok: true, policy: "none" });
  });

  it("accepts soft_copy", () => {
    expect(parseInvoicePodPolicy("soft_copy")).toEqual({
      ok: true,
      policy: "soft_copy",
    });
  });

  it("accepts hard_copy", () => {
    expect(parseInvoicePodPolicy("hard_copy")).toEqual({
      ok: true,
      policy: "hard_copy",
    });
  });

  it("treats null as unconfigured", () => {
    expect(parseInvoicePodPolicy(null)).toEqual({ ok: true, policy: null });
  });

  it("treats undefined as unconfigured", () => {
    expect(parseInvoicePodPolicy(undefined)).toEqual({ ok: true, policy: null });
  });

  it("rejects garbage without remapping", () => {
    expect(parseInvoicePodPolicy("garbage")).toEqual({
      ok: false,
      raw: "garbage",
    });
    expect(parseInvoicePodPolicy("")).toEqual({ ok: false, raw: "" });
    expect(parseInvoicePodPolicy(12)).toEqual({ ok: false, raw: "12" });
  });
});

describe("resolveInvoicePodPolicy", () => {
  it("client none ignores workspace ON and OFF", () => {
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: "none",
        workspacePodRequired: true,
      }),
    ).toBe("none");
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: "none",
        workspacePodRequired: false,
      }),
    ).toBe("none");
  });

  it("client soft_copy ignores workspace ON and OFF", () => {
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: "soft_copy",
        workspacePodRequired: true,
      }),
    ).toBe("soft_copy");
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: "soft_copy",
        workspacePodRequired: false,
      }),
    ).toBe("soft_copy");
  });

  it("client hard_copy ignores workspace ON and OFF", () => {
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: "hard_copy",
        workspacePodRequired: true,
      }),
    ).toBe("hard_copy");
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: "hard_copy",
        workspacePodRequired: false,
      }),
    ).toBe("hard_copy");
  });

  it("NULL client stays unconfigured regardless of workspace toggle", () => {
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: null,
        workspacePodRequired: true,
      }),
    ).toBeNull();
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: null,
        workspacePodRequired: false,
      }),
    ).toBeNull();
  });
});

describe("resetClientInvoicePodPolicy", () => {
  it("returns NULL so the client is unconfigured", () => {
    expect(resetClientInvoicePodPolicy()).toBeNull();
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: resetClientInvoicePodPolicy(),
        workspacePodRequired: true,
      }),
    ).toBeNull();
    expect(
      resolveInvoicePodPolicy({
        clientPolicy: resetClientInvoicePodPolicy(),
        workspacePodRequired: false,
      }),
    ).toBeNull();
  });
});

describe("memberCanManageClientInvoicePodPolicy", () => {
  it("allows owner, admin, finance roles", () => {
    expect(memberCanManageClientInvoicePodPolicy({ role: "owner" })).toBe(true);
    expect(memberCanManageClientInvoicePodPolicy({ role: "admin" })).toBe(true);
    expect(memberCanManageClientInvoicePodPolicy({ role: "finance" })).toBe(
      true,
    );
  });

  it("allows finance:manage grant without finance role", () => {
    expect(
      memberCanManageClientInvoicePodPolicy({
        role: "dispatcher",
        permissions: { grants: ["org:read", "finance:manage"] },
      }),
    ).toBe(true);
  });

  it("allows surfaces.finance.manage", () => {
    expect(
      memberCanManageClientInvoicePodPolicy({
        role: "dispatcher",
        permissions: { surfaces: { "finance.manage": true } },
      }),
    ).toBe(true);
  });

  it("denies ordinary dispatcher without finance grant or surface", () => {
    expect(
      memberCanManageClientInvoicePodPolicy({
        role: "dispatcher",
        permissions: {
          grants: ["org:read", "ops:*"],
          surfaces: { "tripops.trips.view": true },
        },
      }),
    ).toBe(false);
  });
});

describe("invoicePodPolicyLabel", () => {
  it("maps canonical values to UI copy", () => {
    expect(invoicePodPolicyLabel("none")).toBe("No POD");
    expect(invoicePodPolicyLabel("soft_copy")).toBe("Soft Copy POD");
    expect(invoicePodPolicyLabel("hard_copy")).toBe("Hard Copy POD");
  });
});
