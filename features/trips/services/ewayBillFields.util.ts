import {
  formatVaultDocDate,
  vaultDocDateToIso,
  type TripDocItem,
} from "@/features/trips/components/trip-detail/tripDocTypes";

/** Indian e-way bill numbers are 12 digits. */
export const EWAY_BILL_NUMBER_MAX_DIGITS = 12;

export function clampEwayBillNumber(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, EWAY_BILL_NUMBER_MAX_DIGITS);
}

export const EWAY_BILL_FIELDS_FILE_NAME = "eway-fields.json";

export type EwayFieldValues = {
  ewayNo: string;
  createdDate: string;
  validTill: string;
  docNo: string;
};

export type EwayBillStripRow = {
  id: string;
  entryIndex: number;
  ewayNo: string;
  createdDate: string;
  validTill: string;
  docNo: string;
  canView: boolean;
  updatedAt?: string | null;
  updatedById?: string | null;
  previewPath?: string | null;
  previewUri?: string | null;
  previewFileName?: string | null;
  previewMime?: string | null;
  /** Compliance review state of the e-way bill document: pending / verified / rejected. */
  reviewStatus?: string | null;
  rejectionReason?: string | null;
};

export const EMPTY_EWAY_FIELD_VALUES: EwayFieldValues = {
  ewayNo: "",
  createdDate: "",
  validTill: "",
  docNo: "",
};

const EMPTY_STRIP_ROW: EwayBillStripRow = {
  id: "eway-empty",
  entryIndex: 0,
  ewayNo: "—",
  createdDate: "—",
  validTill: "—",
  docNo: "—",
  canView: false,
  updatedAt: null,
  updatedById: null,
  previewPath: null,
  previewUri: null,
  previewFileName: null,
  previewMime: null,
};

export function ewayBillFieldsStoragePath(tripId: string): string {
  return `${tripId}/eway_bill/fields.json`;
}

export function isEwayBillMetaPath(
  storagePath?: string | null,
  fileName?: string | null,
): boolean {
  const path = (storagePath ?? "").toLowerCase().split("?")[0];
  const name = (fileName ?? "").toLowerCase();
  return (
    path.endsWith("/fields.json") ||
    path.endsWith("eway-fields.json") ||
    name === EWAY_BILL_FIELDS_FILE_NAME
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordToEwayFields(parsed: Record<string, unknown>): EwayFieldValues {
  return {
    ewayNo: String(parsed.ewayNo ?? parsed.n ?? "").trim(),
    createdDate: String(parsed.createdDate ?? parsed.created ?? "").trim(),
    validTill: String(parsed.validTill ?? parsed.v ?? "").trim(),
    docNo: String(parsed.docNo ?? parsed.d ?? "").trim(),
  };
}

export function ewayFieldHasContent(values: EwayFieldValues): boolean {
  return !!(
    values.ewayNo.trim() ||
    values.createdDate.trim() ||
    values.validTill.trim() ||
    values.docNo.trim()
  );
}

export function parseEwayFieldEntries(raw?: string | null): EwayFieldValues[] {
  if (!raw?.trim()) return [];
  const text = raw.trim();

  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => recordToEwayFields(asRecord(item) ?? {}))
          .filter(ewayFieldHasContent);
      }
    } catch {
      return [{ ...EMPTY_EWAY_FIELD_VALUES, ewayNo: text }];
    }
  }

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const record = asRecord(parsed);
      if (parsed && record) {
        const listed = Array.isArray(record.entries)
          ? record.entries
              .map((item) => recordToEwayFields(asRecord(item) ?? {}))
              .filter(ewayFieldHasContent)
          : [];
        if (listed.length > 0) return listed;
        const single = recordToEwayFields(record);
        return ewayFieldHasContent(single) ? [single] : [];
      }
    } catch {
      return [{ ...EMPTY_EWAY_FIELD_VALUES, ewayNo: text }];
    }
  }

  return [{ ...EMPTY_EWAY_FIELD_VALUES, ewayNo: text }];
}

export function parseEwayFieldValues(raw?: string | null): EwayFieldValues {
  return parseEwayFieldEntries(raw)[0] ?? { ...EMPTY_EWAY_FIELD_VALUES };
}

function serializeOne(values: EwayFieldValues): EwayFieldValues {
  return {
    ewayNo: clampEwayBillNumber(values.ewayNo),
    createdDate: values.createdDate.trim(),
    validTill: values.validTill.trim(),
    docNo: values.docNo.trim(),
  };
}

/** End of the valid-till calendar day. A date-only bill stays valid through that day. */
export function ewayValidTillEnd(validTill?: string | null): Date | null {
  const iso = vaultDocDateToIso(validTill);
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

/** "EW-Bill expiring in 22 hours" or "EW-Bill expired". Null when there is no valid-till date. */
export function ewayExpiryLabel(
  validTill?: string | null,
  now: Date = new Date(),
): string | null {
  const end = ewayValidTillEnd(validTill);
  if (!end) return null;
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return "EW-Bill expired";
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  if (hours <= 48) {
    return `EW-Bill expiring in ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.ceil(hours / 24);
  return `EW-Bill expiring in ${days} day${days === 1 ? "" : "s"}`;
}

export type EwayExpiryTone = "ok" | "soon" | "expired";

/** Hub toolbar buckets. Active is still valid and more than 24 hours out. */
export type EwayHubStatusFilter = "expired" | "active" | "soon";

export function ewayLabelMatchesHubFilter(
  label: string | null | undefined,
  filter: EwayHubStatusFilter,
): boolean {
  const tone = ewayExpiryTone(label);
  if (filter === "expired") return tone === "expired";
  if (filter === "soon") return tone === "soon";
  return tone === "ok";
}

/** More than 24 hours left is calm (green). Inside a day is soon. Past is expired. */
export function ewayExpiryTone(
  label: string | null | undefined,
): EwayExpiryTone | null {
  const text = (label ?? "").trim();
  if (!text) return null;
  if (text === "EW-Bill expired") return "expired";
  const hours = text.match(/(\d+)\s+hours?/);
  if (hours) return Number(hours[1]) > 24 ? "ok" : "soon";
  return "ok";
}

/**
 * Status for the trip tag when a trip has several bills.
 * Expired beats a bill that is still valid. Otherwise the soonest remaining date wins.
 */
export function mostUrgentEwayExpiryLabel(
  validTills: Array<string | null | undefined>,
  now: Date = new Date(),
): string | null {
  const ends = validTills
    .map((value) => ewayValidTillEnd(value))
    .filter((end): end is Date => end != null);
  if (ends.length === 0) return null;
  ends.sort((a, b) => a.getTime() - b.getTime());
  const expired = ends.find((end) => end.getTime() <= now.getTime());
  const target = expired ?? ends[0];
  const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
  return ewayExpiryLabel(iso, now);
}

export function serializeEwayFieldEntries(entries: EwayFieldValues[]): string {
  const cleaned = entries.map(serializeOne).filter(ewayFieldHasContent);
  const first = cleaned[0] ?? { ...EMPTY_EWAY_FIELD_VALUES };
  return JSON.stringify({
    ewayNo: first.ewayNo,
    createdDate: first.createdDate,
    validTill: first.validTill,
    docNo: first.docNo,
    entries: cleaned,
  });
}

export function serializeEwayFieldValues(values: EwayFieldValues): string {
  return serializeEwayFieldEntries([values]);
}

function dash(value?: string | null): string {
  const text = value?.trim();
  return text ? text : "—";
}

export function ewayDocHasPreviewableFile(doc?: TripDocItem | null): boolean {
  if (!doc) return false;
  const paths = [
    doc.storagePath,
    ...(doc.files ?? []).map((file) => file.storagePath),
  ].filter((path): path is string => !!path?.trim());
  return paths.some((path) => !isEwayBillMetaPath(path));
}

function displayDate(value?: string | null): string {
  return dash(formatVaultDocDate(value) || value);
}

export function buildEwayBillStripRows(params: {
  ewayDoc?: TripDocItem | null;
}): EwayBillStripRow[] {
  const entries = parseEwayFieldEntries(params.ewayDoc?.documentNumber);
  const ewayDoc = params.ewayDoc;
  const files = (ewayDoc?.files ?? []).filter(
    (file) =>
      !!file.storagePath?.trim() && !isEwayBillMetaPath(file.storagePath),
  );
  const slotPreviewable =
    ewayDocHasPreviewableFile(ewayDoc) &&
    !!ewayDoc?.storagePath &&
    !isEwayBillMetaPath(ewayDoc.storagePath);
  const baseId = ewayDoc?.documentId ?? ewayDoc?.id ?? "eway";

  const latestLog = {
    updatedAt: ewayDoc?.uploadedAt ?? null,
    updatedById: ewayDoc?.uploadedBy ?? null,
  };
  const review = {
    reviewStatus: ewayDoc?.reviewStatus ?? null,
    rejectionReason: ewayDoc?.rejectionReason ?? null,
  };
  const toRow = (
    fields: EwayFieldValues,
    index: number,
    id: string,
    canView: boolean,
    fileLog?: {
      uploadedAt?: string | null;
      uploadedBy?: string | null;
      storagePath?: string | null;
      previewUri?: string | null;
      fileName?: string | null;
      type?: string | null;
    },
  ): EwayBillStripRow => ({
    id,
    entryIndex: index,
    ewayNo: dash(clampEwayBillNumber(fields.ewayNo)),
    createdDate: displayDate(fields.createdDate),
    validTill: displayDate(fields.validTill),
    docNo: dash(fields.docNo),
    canView,
    updatedAt: fileLog?.uploadedAt ?? latestLog.updatedAt,
    updatedById: fileLog?.uploadedBy ?? latestLog.updatedById,
    previewPath:
      fileLog?.storagePath?.trim() ||
      (slotPreviewable ? ewayDoc?.storagePath ?? null : null),
    previewUri: fileLog?.previewUri ?? null,
    previewFileName: fileLog?.fileName ?? null,
    previewMime: fileLog?.type ?? null,
    ...review,
  });

  if (entries.length > 0) {
    const entryRows = entries.map((fields, index) =>
      toRow(
        fields,
        index,
        files[index]?.id ?? `${baseId}-entry-${index}`,
        !!files[index] || slotPreviewable,
        files[index],
      ),
    );
    // Files uploaded beyond the saved entries still get their own row.
    const extraRows = files
      .slice(entries.length)
      .map((file, offset) =>
        toRow(
          { ...EMPTY_EWAY_FIELD_VALUES },
          entries.length + offset,
          file.id,
          true,
          file,
        ),
      );
    return [...entryRows, ...extraRows];
  }

  if (files.length === 0) {
    return [
      {
        ...EMPTY_STRIP_ROW,
        id: ewayDoc ? `${baseId}-entry-0` : EMPTY_STRIP_ROW.id,
        updatedAt: latestLog.updatedAt,
        updatedById: latestLog.updatedById,
        ...review,
      },
    ];
  }

  return files.map((file, index) => {
    const fromLabel = file.label.includes("·")
      ? parseEwayFieldValues(file.label.split("·").pop()?.trim()).ewayNo
      : "";
    return toRow(
      { ...EMPTY_EWAY_FIELD_VALUES, ewayNo: fromLabel },
      index,
      file.id,
      true,
      file,
    );
  });
}
