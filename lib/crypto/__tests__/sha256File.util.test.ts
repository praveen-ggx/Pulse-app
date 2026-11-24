const mockReadAsStringAsync = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  EncodingType: { Base64: "base64" },
}));

import { sha256File } from "../sha256File.util";
import { sha256Hex } from "../sha256.util";

describe("sha256File", () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const expected = sha256Hex(bytes);

  beforeEach(() => {
    mockReadAsStringAsync.mockReset();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it("fingerprints blob: URIs via fetch (web camera / gallery)", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });

    await expect(sha256File("blob:https://localhost/abc")).resolves.toBe(expected);
    expect(global.fetch).toHaveBeenCalledWith("blob:https://localhost/abc");
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
  });

  it("fingerprints data: URIs via fetch", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });

    await expect(sha256File("data:image/jpeg;base64,AQIDBA==")).resolves.toBe(expected);
    expect(global.fetch).toHaveBeenCalled();
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
  });

  it("keeps native FileSystem path for local file URIs", async () => {
    mockReadAsStringAsync.mockResolvedValue(Buffer.from(bytes).toString("base64"));

    await expect(sha256File("file:///data/odometer.jpg")).resolves.toBe(expected);
    expect(mockReadAsStringAsync).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
