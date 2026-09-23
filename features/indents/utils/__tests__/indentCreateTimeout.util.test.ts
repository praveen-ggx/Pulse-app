import { isIndentWriteTimeout } from "@/features/indents/utils/indentCreateTimeout.util";

describe("isIndentWriteTimeout", () => {
  it("matches the client fetch abort used by supabase()", () => {
    const err = new Error("Request timed out");
    err.name = "TimeoutError";
    expect(isIndentWriteTimeout(err)).toBe(true);
  });

  it("ignores ordinary validation errors", () => {
    expect(isIndentWriteTimeout(new Error("Client name: Required"))).toBe(
      false,
    );
  });
});
