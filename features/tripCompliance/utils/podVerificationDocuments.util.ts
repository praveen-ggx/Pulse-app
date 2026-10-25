import { isHardCopyPodPhoto } from "@/features/trips/components/trip-detail/hardCopyPodPhotos.util";
import { isSoftPodDocumentType } from "@/features/trips/services/tripDocumentLrPod.service";

export type PodVerificationKind = "soft" | "hard";

export type PodVerificationFile = {
  id: string;
  document_type?: string | null;
  file_name?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
};

const HARD_COPY_TYPES = new Set(["hard_pod", "hard_copy_pod", "pod_hard"]);
const HARD_COPY_FILE_MARK = /(?:^|[._-])pulse\.hard-copy(?:[._-]|$)/i;

export function isPulseHardCopyFileName(fileName: string | null | undefined): boolean {
  return HARD_COPY_FILE_MARK.test(String(fileName ?? ""));
}

export function pulseHardCopyFileName(fileName: string): string {
  const name = String(fileName ?? "").trim() || "pod.jpg";
  if (isPulseHardCopyFileName(name)) return name;
  return `pulse.hard-copy-${name}`;
}

export function podCopyWatermarkLabel(kind: PodVerificationKind): string {
  return kind === "hard" ? "pulse. hard copy" : "pulse. soft copy";
}

function fileIsPdf(file: PodVerificationFile): boolean {
  const mime = (file.mime_type ?? "").toLowerCase();
  const name = (file.file_name ?? "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

/** Soft-copy POD or a hard-copy scan uploaded from Log Hard Copy / Log Bulk POD. */
export function isPodVerificationFile(file: PodVerificationFile): boolean {
  if (!file.storage_path?.trim()) return false;
  const type = String(file.document_type ?? "").trim().toLowerCase();
  if (HARD_COPY_TYPES.has(type) || isPulseHardCopyFileName(file.file_name)) return true;
  return isSoftPodDocumentType(type);
}

/**
 * Hard-copy photos from the log-POD stage are type `pod` + image.
 * Named soft types and PDFs stay soft copy.
 */
export function podVerificationKind(file: PodVerificationFile): PodVerificationKind {
  const type = String(file.document_type ?? "").trim().toLowerCase();
  if (HARD_COPY_TYPES.has(type) || isPulseHardCopyFileName(file.file_name)) return "hard";
  if (type === "soft_pod" || type === "pod_soft") return "soft";
  if (fileIsPdf(file)) return "soft";
  if (isHardCopyPodPhoto({ name: file.file_name, mimeType: file.mime_type })) return "hard";
  return "soft";
}

export function podVerificationFiles(files: readonly PodVerificationFile[]): PodVerificationFile[] {
  return files.filter(isPodVerificationFile);
}

export function podVerificationLabel(file: PodVerificationFile): string {
  return podVerificationKind(file) === "hard" ? "Hard copy" : "Soft copy";
}
