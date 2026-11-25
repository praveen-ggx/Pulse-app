/** Helpers for driver POD / LR in-app preview. */

export function isDriverDocPdf(doc: {
  mime_type?: string | null;
  file_name?: string | null;
  storage_path?: string | null;
}): boolean {
  const mime = String(doc.mime_type ?? "").toLowerCase();
  if (mime.includes("pdf")) return true;
  if (mime.startsWith("image/")) return false;
  const name = String(doc.file_name ?? "").toLowerCase();
  const path = String(doc.storage_path ?? "").toLowerCase().split("?")[0] ?? "";
  return name.endsWith(".pdf") || path.endsWith(".pdf");
}

export function isDriverDocImage(doc: {
  mime_type?: string | null;
  file_name?: string | null;
  storage_path?: string | null;
}): boolean {
  if (isDriverDocPdf(doc)) return false;
  const mime = String(doc.mime_type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = String(doc.file_name ?? "").toLowerCase();
  const path = String(doc.storage_path ?? "").toLowerCase().split("?")[0] ?? "";
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(path);
}

/** Blob / data URLs cannot be opened reliably via Linking.openURL. */
export function canOpenPreviewExternally(url: string | null | undefined): boolean {
  const value = String(url ?? "").trim();
  if (!value) return false;
  return /^https?:\/\//i.test(value);
}
