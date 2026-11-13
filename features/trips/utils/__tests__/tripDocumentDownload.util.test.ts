import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  assignDownloadFileNames,
  buildStoredZip,
  downloadTripDocumentFiles,
} from "../tripDocumentDownload.util";

const mockCreateSignedUrl = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    storage: {
      from: () => ({
        createSignedUrl: (...args: unknown[]) => mockCreateSignedUrl(...args),
      }),
    },
  }),
}));

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  downloadAsync: jest.fn(),
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function unzip(bytes: Uint8Array): Record<string, Uint8Array> {
  const { unzipSync } = require("fflate") as typeof import("fflate");
  return unzipSync(bytes);
}

describe("trip document download", () => {
  const savedBlobs: Blob[] = [];
  const clicks: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    savedBlobs.length = 0;
    clicks.length = 0;
    Platform.OS = "web";
    mockCreateSignedUrl.mockImplementation(async (path: string) => ({
      data: { signedUrl: `https://files.example/${path}` },
      error: null,
    }));
    globalThis.fetch = jest.fn(async (url: string) => {
      const target = String(url);
      if (target.includes("missing")) {
        return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      const body = target.endsWith("two.jpg")
        ? "second-invoice"
        : target.endsWith("three.png")
          ? "third-invoice"
          : "first-invoice";
      const bytes = textBytes(body);
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buffer,
        blob: async () => new Blob([buffer]),
      };
    }) as typeof fetch;
    URL.createObjectURL = jest.fn((blob: Blob) => {
      savedBlobs.push(blob);
      return "blob:invoices";
    });
    URL.revokeObjectURL = jest.fn();
    const anchor = {
      href: "",
      download: "",
      click() {
        clicks.push(this.download);
      },
    };
    (globalThis as { document?: object }).document = {
      createElement: () => anchor,
      body: {
        appendChild: () => undefined,
        removeChild: () => undefined,
      },
    };
  });

  it("keeps every name, and makes duplicates unique", () => {
    expect(
      assignDownloadFileNames([
        { storagePath: "trip/a.jpg", fileName: "Invoice" },
        { storagePath: "trip/b.jpg", fileName: "invoice" },
        { storagePath: "trip/c.jpg", fileName: "scan.jpg" },
        { storagePath: "trip/d.jpg", fileName: "" },
      ]),
    ).toEqual(["Invoice.jpg", "invoice (2).jpg", "scan.jpg", "d.jpg"]);
  });

  it("stores every zip entry", () => {
    const zip = buildStoredZip([
      { name: "one.jpg", data: textBytes("first-invoice") },
      { name: "two.jpg", data: textBytes("second-invoice") },
      { name: "three.png", data: textBytes("third-invoice") },
    ]);
    const files = unzip(zip);
    expect(Object.keys(files).sort()).toEqual(["one.jpg", "three.png", "two.jpg"]);
    expect(new TextDecoder().decode(files["one.jpg"])).toBe("first-invoice");
    expect(new TextDecoder().decode(files["two.jpg"])).toBe("second-invoice");
    expect(new TextDecoder().decode(files["three.png"])).toBe("third-invoice");
  });

  it("saves one invoice as that file", async () => {
    const result = await downloadTripDocumentFiles({
      files: [{ storagePath: "trip/one.jpg", fileName: "scan.jpg" }],
    });
    expect(result.error).toBeNull();
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("trip/one.jpg", 60, {
      download: "scan.jpg",
    });
    expect(clicks).toEqual(["scan.jpg"]);
    expect(savedBlobs).toHaveLength(1);
  });

  it("packs every attached invoice into one zip", async () => {
    const result = await downloadTripDocumentFiles({
      files: [
        { storagePath: "trip/one.jpg", fileName: "Invoice" },
        { storagePath: "trip/two.jpg", fileName: "Invoice" },
        { storagePath: "trip/three.png", fileName: "page.png" },
      ],
      archiveName: "Invoices.zip",
    });
    expect(result.error).toBeNull();
    expect(clicks).toEqual(["Invoices.zip"]);
    expect(savedBlobs).toHaveLength(1);
    const files = unzip(new Uint8Array(await savedBlobs[0]!.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([
      "Invoice (2).jpg",
      "Invoice.jpg",
      "page.png",
    ]);
    expect(new TextDecoder().decode(files["Invoice.jpg"])).toBe("first-invoice");
    expect(new TextDecoder().decode(files["Invoice (2).jpg"])).toBe("second-invoice");
    expect(new TextDecoder().decode(files["page.png"])).toBe("third-invoice");
  });

  it("does not save a partial set when one invoice cannot be read", async () => {
    const result = await downloadTripDocumentFiles({
      files: [
        { storagePath: "trip/one.jpg", fileName: "Invoice" },
        { storagePath: "trip/missing.jpg", fileName: "Missing" },
      ],
      archiveName: "Invoices.zip",
    });
    expect(result.error?.message).toContain("Missing.jpg");
    expect(result.error?.message).toContain("No invoices were saved");
    expect(savedBlobs).toHaveLength(0);
    expect(clicks).toEqual([]);
  });

  it("shares one zip of every invoice on device", async () => {
    Platform.OS = "ios";
    const result = await downloadTripDocumentFiles({
      files: [
        { storagePath: "trip/one.jpg", fileName: "a.jpg" },
        { storagePath: "trip/two.jpg", fileName: "b.jpg" },
      ],
      archiveName: "Invoices.zip",
    });
    expect(result.error).toBeNull();
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      "file:///cache/Invoices.zip",
      expect.any(String),
      { encoding: "base64" },
    );
    const base64 = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1] as string;
    const files = unzip(Uint8Array.from(Buffer.from(base64, "base64")));
    expect(new TextDecoder().decode(files["a.jpg"])).toBe("first-invoice");
    expect(new TextDecoder().decode(files["b.jpg"])).toBe("second-invoice");
    expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/Invoices.zip", {
      mimeType: "application/zip",
      dialogTitle: "Invoices.zip",
      UTI: "public.zip-archive",
    });
  });
});
