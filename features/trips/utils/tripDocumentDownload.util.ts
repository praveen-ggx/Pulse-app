/**
 * Download a trip-documents storage object (LR, POD, invoice, etc.).
 * Web: browser save. Native: share sheet after cache write.
 *
 * One file saves as itself. Several files save as one zip: a click can only
 * start a single browser download, so later files in a loop are dropped.
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

const BUCKET = "trip-documents";

function safeFileName(name?: string | null, fallback = "document"): string {
  const raw = (name ?? "").trim() || fallback;
  return raw.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120);
}

export async function downloadTripDocumentFile(input: {
  storagePath: string;
  fileName?: string | null;
}): Promise<{ error: Error | null }> {
  const path = input.storagePath.trim().split("?")[0] ?? "";
  if (!path) return { error: new Error("No file to download.") };
  const fileName = safeFileName(
    input.fileName,
    path.split("/").pop() || "document",
  );

  const { data, error } = await supabase()
    .storage.from(BUCKET)
    .createSignedUrl(path, 60, { download: fileName });
  if (error || !data?.signedUrl) {
    return {
      error: new Error(error?.message ?? "Could not prepare download."),
    };
  }

  if (Platform.OS === "web") {
    try {
      const res = await fetch(data.signedUrl);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
      return { error: null };
    } catch {
      const opened = window.open(data.signedUrl, "_blank");
      if (opened) opened.opener = null;
      return { error: null };
    }
  }

  try {
    const cacheDirectory = (
      FileSystem as { cacheDirectory?: string }
    ).cacheDirectory;
    if (!cacheDirectory) return { error: new Error("No cache directory") };
    const uri = `${cacheDirectory}${fileName}`;
    const result = await FileSystem.downloadAsync(data.signedUrl, uri);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, { dialogTitle: fileName });
      return { error: null };
    }
    return { error: new Error("Sharing is not available on this device.") };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export function assignDownloadFileNames(
  files: readonly { storagePath: string; fileName?: string | null }[],
): string[] {
  const used = new Set<string>();
  return files.map((file, index) => {
    const path = file.storagePath.trim().split("?")[0] ?? "";
    const fromPath = path.split("/").pop() || "";
    const extMatch = /\.[a-z0-9]{1,8}$/i.exec(fromPath);
    const ext = extMatch?.[0]?.toLowerCase() ?? "";
    const preferred =
      file.fileName?.trim() || fromPath || `Invoice ${index + 1}`;
    let name = safeFileName(preferred, `Invoice ${index + 1}`);
    if (ext && !name.toLowerCase().endsWith(ext)) {
      const room = Math.max(1, 120 - ext.length);
      name = `${name.slice(0, room)}${ext}`;
    }
    const key = name.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      return name;
    }
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const suffix = dot > 0 ? name.slice(dot) : "";
    let n = 2;
    let next = `${stem} (${n})${suffix}`;
    while (used.has(next.toLowerCase())) {
      n += 1;
      next = `${stem} (${n})${suffix}`;
    }
    used.add(next.toLowerCase());
    return next;
  });
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Uncompressed zip. Every entry is stored; nothing is omitted. */
export function buildStoredZip(
  entries: readonly { name: string; data: Uint8Array }[],
): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const endView = new DataView(eocd.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const out = new Uint8Array(offset + centralSize + eocd.length);
  let cursor = 0;
  for (const part of locals) {
    out.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centrals) {
    out.set(part, cursor);
    cursor += part.length;
  }
  out.set(eocd, cursor);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function readTripDocumentBytes(
  storagePath: string,
): Promise<{ data: Uint8Array | null; error: Error | null }> {
  const path = storagePath.trim().split("?")[0] ?? "";
  if (!path) return { data: null, error: new Error("No file to download.") };
  const { data, error } = await supabase()
    .storage.from(BUCKET)
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    return {
      data: null,
      error: new Error(error?.message ?? "Could not prepare download."),
    };
  }
  try {
    const res = await fetch(data.signedUrl);
    if (!res.ok) {
      return { data: null, error: new Error(`Download failed (${res.status})`) };
    }
    return { data: new Uint8Array(await res.arrayBuffer()), error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

function saveZipOnWeb(bytes: Uint8Array, fileName: string): { error: Error | null } {
  try {
    const blob = new Blob([bytes], { type: "application/zip" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * Save every file. A single file keeps its own name. Two or more are packed
 * into one zip so none are dropped by the browser's one-download-per-click limit.
 */
export async function downloadTripDocumentFiles(input: {
  files: readonly { storagePath: string; fileName?: string | null }[];
  archiveName?: string;
}): Promise<{ error: Error | null }> {
  const files = input.files.filter((file) => file.storagePath.trim());
  if (files.length === 0) return { error: new Error("No file to download.") };
  if (files.length === 1) {
    return downloadTripDocumentFile({
      storagePath: files[0]!.storagePath,
      fileName: files[0]?.fileName,
    });
  }

  const names = assignDownloadFileNames(files);
  const loaded = await Promise.all(
    files.map(async (file, index) => {
      const result = await readTripDocumentBytes(file.storagePath);
      return { ...result, name: names[index] ?? `Invoice ${index + 1}` };
    }),
  );
  const failed = loaded.find((item) => item.error || item.data == null);
  if (failed) {
    const reason = failed.error?.message ?? "Could not prepare download.";
    return {
      error: new Error(
        `Could not download ${failed.name}. ${reason} No invoices were saved.`,
      ),
    };
  }

  const zip = buildStoredZip(
    loaded.map((item) => ({ name: item.name, data: item.data! })),
  );
  const archiveName = safeFileName(input.archiveName, "Invoices.zip");
  const fileName = archiveName.toLowerCase().endsWith(".zip")
    ? archiveName
    : `${archiveName}.zip`;

  if (Platform.OS === "web") return saveZipOnWeb(zip, fileName);

  try {
    const cacheDirectory = (FileSystem as { cacheDirectory?: string }).cacheDirectory;
    if (!cacheDirectory) return { error: new Error("No cache directory") };
    const uri = `${cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(uri, bytesToBase64(zip), {
      encoding: "base64",
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/zip",
        dialogTitle: fileName,
        UTI: "public.zip-archive",
      });
      return { error: null };
    }
    return { error: new Error("Sharing is not available on this device.") };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
