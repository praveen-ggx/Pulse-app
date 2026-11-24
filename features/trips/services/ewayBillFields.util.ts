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
  /** When / by whom this entry was last saved (entries share one trip_documents row). */
  updatedAt?: string;
  updatedBy?: string;
  /**
   * Storage path of the e-way file this entry belongs to, set when the number
   * is saved from that file's card. Entries without it (saved before this
   * existed, or via "Add e-way number") are matched to files by position.
   */
  filePath?: string;
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
  /** The entry's own save stamp, carried back on the next save. */
  entryUpdatedAt?: string | null;
  entryUpdatedBy?: string | null;
  /** The entry's saved file link (EwayFieldValues.filePath), carried through saves. */
  entryFilePath?: string | null;
  /** Storage path of the e-way file shown on this card; null when the card has no file. */
  fileStoragePath?: string | null;
  previewPath?: string | null;
  previewUri?: string | null;
  previewFileName?: string | null;
  previewMime?: string | null;
  /** trip_documents id of the uploaded file this row shows. */
  documentId?: string | null;
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
  documentId: null,
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

function withEntryStamp<T extends object>(
  target: T,
  stamp: { updatedAt?: unknown; updatedBy?: unknown; filePath?: unknown },
): T & Pick<EwayFieldValues, "updatedAt" | "updatedBy" | "filePath"> {
  const out: T & Pick<EwayFieldValues, "updatedAt" | "updatedBy" | "filePath"> = { ...target };
  const at = typeof stamp.updatedAt === "string" ? stamp.updatedAt.trim() : "";
  const by = typeof stamp.updatedBy === "string" ? stamp.updatedBy.trim() : "";
  const file = typeof stamp.filePath === "string" ? stamp.filePath.trim() : "";
  if (at) out.updatedAt = at;
  if (by) out.updatedBy = by;
  if (file) out.filePath = file;
  return out;
}

function recordToEwayFields(parsed: Record<string, unknown>): EwayFieldValues {
  return withEntryStamp(
    {
      ewayNo: String(parsed.ewayNo ?? parsed.n ?? "").trim(),
      createdDate: String(parsed.createdDate ?? parsed.created ?? "").trim(),
      validTill: String(parsed.validTill ?? parsed.v ?? "").trim(),
      docNo: String(parsed.docNo ?? parsed.d ?? "").trim(),
    },
    parsed,
  );
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
  return withEntryStamp(
    {
      ewayNo: clampEwayBillNumber(values.ewayNo),
      createdDate: values.createdDate.trim(),
      validTill: values.validTill.trim(),
      docNo: values.docNo.trim(),
    },
    values,
  );
}

/** The later of two ISO timestamps (either may be missing). */
function laterTime(a?: string | null, b?: string | null): string | null {
  const ta = Date.parse(a ?? "");
  const tb = Date.parse(b ?? "");
  if (!Number.isFinite(ta)) return Number.isFinite(tb) ? (b ?? null) : null;
  if (!Number.isFinite(tb)) return a ?? null;
  return ta >= tb ? (a ?? null) : (b ?? null);
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
  // Card "On … by …": the entry's own save, or its file upload when that is newer.
  // Entries saved before stamps existed keep the row-level time as before.
  const entryLog = (
    fields: EwayFieldValues,
    fileLog?: { uploadedAt?: string | null; uploadedBy?: string | null },
  ): { updatedAt: string | null; updatedById: string | null } => {
    if (!fields.updatedAt) {
      return {
        updatedAt: fileLog?.uploadedAt ?? latestLog.updatedAt,
        updatedById: fileLog?.uploadedBy ?? latestLog.updatedById,
      };
    }
    const at = laterTime(fields.updatedAt, fileLog?.uploadedAt);
    const fromFile = !!fileLog?.uploadedAt && at === fileLog.uploadedAt && at !== fields.updatedAt;
    return {
      updatedAt: at,
      updatedById: fromFile ? (fileLog?.uploadedBy ?? null) : (fields.updatedBy ?? null),
    };
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
      documentId?: string | null;
    },
  ): EwayBillStripRow => ({
    id,
    entryIndex: index,
    ewayNo: dash(clampEwayBillNumber(fields.ewayNo)),
    createdDate: displayDate(fields.createdDate),
    validTill: displayDate(fields.validTill),
    docNo: dash(fields.docNo),
    canView,
    ...entryLog(fields, fileLog),
    ...(fields.updatedAt ? { entryUpdatedAt: fields.updatedAt } : {}),
    ...(fields.updatedBy ? { entryUpdatedBy: fields.updatedBy } : {}),
    ...(fields.filePath ? { entryFilePath: fields.filePath } : {}),
    fileStoragePath: fileLog?.storagePath?.trim() || null,
    previewPath:
      fileLog?.storagePath?.trim() ||
      (slotPreviewable ? ewayDoc?.storagePath ?? null : null),
    previewUri: fileLog?.previewUri ?? null,
    previewFileName: fileLog?.fileName ?? null,
    previewMime: fileLog?.type ?? null,
    documentId: fileLog?.documentId ?? null,
    ...review,
  });

  if (entries.length > 0) {
    const entryForFile = pairEwayEntriesWithFiles(
      entries,
      files.map((file) => file.storagePath?.trim() ?? ""),
    );
    const paired = new Set(entryForFile.filter((index): index is number => index !== null));
    // One card per file, in file order; a file with no entry gets a blank
    // card (entryIndex -1) whose Edit adds a new entry linked to that file.
    const fileRows = files.map((file, fileIndex) => {
      const entryIndex = entryForFile[fileIndex];
      return entryIndex === null || entryIndex === undefined
        ? toRow({ ...EMPTY_EWAY_FIELD_VALUES }, -1, file.id, true, file)
        : toRow(entries[entryIndex]!, entryIndex, file.id, true, file);
    });
    // Entries with no file on the trip (more numbers than files, or their
    // file was removed) still get their own card.
    const fileLessRows = entries
      .map((fields, index) => ({ fields, index }))
      .filter(({ index }) => !paired.has(index))
      .map(({ fields, index }) =>
        toRow(fields, index, `${baseId}-entry-${index}`, slotPreviewable, undefined),
      );
    return [...fileRows, ...fileLessRows];
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

/** An `eway_bill` trip_documents row, as far as choosing where the numbers live. */
export type EwayFieldsRowLike = {
  id: string;
  storage_path?: string | null;
  file_name?: string | null;
  uploaded_at?: string | null;
  document_number?: string | null;
};

function uploadedMs(row: EwayFieldsRowLike): number {
  const ms = row.uploaded_at ? Date.parse(row.uploaded_at) : Number.NaN;
  // Trip Detail loads `order by uploaded_at desc` (Postgres: nulls first).
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/** Newest first, the same order Trip Detail and Compliance read e-way rows in. */
export function sortEwayRowsNewestFirst<T extends EwayFieldsRowLike>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => uploadedMs(b) - uploadedMs(a));
}

/**
 * The row whose numbers the screens show: the newest row holding at least
 * one e-way entry (useTripDetail and deriveComplianceEwayBill pick the same).
 */
export function ewayFieldsSourceRow<T extends EwayFieldsRowLike>(rows: readonly T[]): T | null {
  return (
    sortEwayRowsNewestFirst(rows).find((row) => parseEwayFieldEntries(row.document_number).length > 0) ??
    null
  );
}

/**
 * Where a save writes the numbers: the row the screens read, so a save is
 * never written somewhere it will not be shown. With no numbers yet: the
 * newest uploaded file, else an existing details row; null = create the
 * details row.
 */
export function ewayFieldsWriteTarget<T extends EwayFieldsRowLike>(rows: readonly T[]): T | null {
  const source = ewayFieldsSourceRow(rows);
  if (source) return source;
  const newest = sortEwayRowsNewestFirst(rows);
  return (
    newest.find((row) => !isEwayBillMetaPath(row.storage_path, row.file_name)) ??
    newest.find((row) => isEwayBillMetaPath(row.storage_path, row.file_name)) ??
    null
  );
}

export type EwayFieldsCarry =
  | { kind: "none" }
  | { kind: "move"; toId: string; documentNumber: string }
  | { kind: "create"; documentNumber: string };

/**
 * Before deleting `documentId`: when it holds the numbers the screens show,
 * they must move first or the delete erases every e-way number on the trip.
 * They go to the newest remaining row (where the screens look next), or to a
 * new details row when no other e-way row remains.
 */
export function ewayFieldsCarryOnDelete<T extends EwayFieldsRowLike>(
  rows: readonly T[],
  documentId: string,
): EwayFieldsCarry {
  const source = ewayFieldsSourceRow(rows);
  if (!source || source.id !== documentId) return { kind: "none" };
  const documentNumber = source.document_number ?? "";
  const remaining = sortEwayRowsNewestFirst(rows.filter((row) => row.id !== documentId));
  const next = remaining[0];
  if (next) return { kind: "move", toId: next.id, documentNumber };
  return { kind: "create", documentNumber };
}

/**
 * Which entry each file shows (by file position; null = no entry).
 * 1. An entry linked to a file (`filePath`) shows on that file.
 * 2. Entries without a link fill the remaining files in order (how entries
 *    saved before links existed were always shown).
 * 3. An entry linked to a file that is no longer on the trip is not moved
 *    onto another file; it keeps a card of its own.
 */
export function pairEwayEntriesWithFiles(
  entries: readonly Pick<EwayFieldValues, "filePath">[],
  filePaths: readonly string[],
): (number | null)[] {
  const result: (number | null)[] = filePaths.map(() => null);
  const fileIndexByPath = new Map<string, number>();
  filePaths.forEach((path, index) => {
    if (path && !fileIndexByPath.has(path)) fileIndexByPath.set(path, index);
  });
  const unlinked: number[] = [];
  entries.forEach((entry, entryIndex) => {
    const link = entry.filePath?.trim();
    if (!link) {
      unlinked.push(entryIndex);
      return;
    }
    const fileIndex = fileIndexByPath.get(link);
    if (fileIndex !== undefined && result[fileIndex] === null) result[fileIndex] = entryIndex;
  });
  let next = 0;
  for (let fileIndex = 0; fileIndex < result.length && next < unlinked.length; fileIndex += 1) {
    if (result[fileIndex] !== null) continue;
    result[fileIndex] = unlinked[next]!;
    next += 1;
  }
  return result;
}

/**
 * The entries a card list stands for, in their saved order (the first one is
 * the trip's primary e-way number elsewhere). Cards without an entry are
 * skipped. Each entry keeps its file link and save stamp.
 */
export function ewayEntriesFromRows(
  rows: readonly EwayBillStripRow[],
  toFields: (row: EwayBillStripRow) => EwayFieldValues,
): EwayFieldValues[] {
  return rows
    .filter((row) => row.entryIndex >= 0)
    .slice()
    .sort((a, b) => a.entryIndex - b.entryIndex)
    .map(toFields)
    .filter(ewayFieldHasContent);
}

/**
 * Entries to save after the e-way editor closes. `editingIndex` is the
 * entry being edited, or "new" for "Add e-way number" and for a card that
 * has a file but no entry yet (its draft carries that file's link). A new
 * entry is always added — before, editing such a card replaced nothing and
 * the typed details were silently dropped.
 */
export function nextEwayEntries(input: {
  existing: readonly EwayFieldValues[];
  editingIndex: number | "new";
  draft: EwayFieldValues;
  mode: "save" | "remove";
}): EwayFieldValues[] {
  const { existing, editingIndex, draft, mode } = input;
  if (mode === "remove") {
    if (editingIndex === "new") return [...existing];
    return existing.filter((_, index) => index !== editingIndex);
  }
  if (editingIndex === "new" || editingIndex < 0 || editingIndex >= existing.length) {
    return [...existing, draft];
  }
  return existing.map((entry, index) => (index === editingIndex ? draft : entry));
}

/** True when a stored value is an e-way entry list (JSON), not a single plain number. */
export function isEwayEntriesJson(raw?: string | null): boolean {
  const text = raw?.trim() ?? "";
  return (text.startsWith("{") || text.startsWith("[")) && parseEwayFieldEntries(text).length > 0;
}

/**
 * The entry each e-way file shows, keyed by storage path, from the trip's
 * e-way rows (same source row and pairing as the Trip Detail cards). Files
 * with no entry are absent. The details row (fields.json) is never a file.
 */
export function ewayEntryByFilePath(rows: readonly EwayFieldsRowLike[]): Map<string, EwayFieldValues> {
  const entries = parseEwayFieldEntries(ewayFieldsSourceRow(rows)?.document_number);
  // Newest first: the order Trip Detail loads trip_documents in, so the
  // pairing matches the cards.
  const filePaths = sortEwayRowsNewestFirst(rows)
    .filter((row) => !isEwayBillMetaPath(row.storage_path, row.file_name))
    .map((row) => row.storage_path?.trim() ?? "")
    .filter(Boolean);
  const paired = pairEwayEntriesWithFiles(entries, filePaths);
  const out = new Map<string, EwayFieldValues>();
  paired.forEach((entryIndex, fileIndex) => {
    if (entryIndex !== null) out.set(filePaths[fileIndex]!, entries[entryIndex]!);
  });
  return out;
}

/**
 * Apply numbers typed per file (e.g. in the Trips hub update sheet) to the
 * trip's entry list: a file's existing entry gets the new number (other
 * fields kept) and is linked to that file; a file with no entry gets a new
 * one. Blank typed numbers change nothing. `filePaths` are the e-way files in
 * card order, so unlinked entries pair the same way the cards do.
 */
export function applyEwayNumbersByFile(input: {
  entries: readonly EwayFieldValues[];
  filePaths: readonly string[];
  typedByPath: Readonly<Record<string, string>>;
}): { entries: EwayFieldValues[]; changed: boolean } {
  const entries = input.entries.map((entry) => ({ ...entry }));
  const paired = pairEwayEntriesWithFiles(entries, input.filePaths);
  // Pin every shown entry to its file (written only if something changes),
  // so a later upload cannot move an unlinked number onto the new file.
  paired.forEach((entryIndex, fileIndex) => {
    if (entryIndex === null) return;
    const entry = entries[entryIndex]!;
    if (!entry.filePath) entries[entryIndex] = { ...entry, filePath: input.filePaths[fileIndex] };
  });
  let changed = false;
  input.filePaths.forEach((path, fileIndex) => {
    const typed = clampEwayBillNumber(input.typedByPath[path] ?? "");
    if (!path || !typed) return;
    const entryIndex = paired[fileIndex];
    if (entryIndex === null || entryIndex === undefined) {
      entries.push({ ...EMPTY_EWAY_FIELD_VALUES, ewayNo: typed, filePath: path });
      changed = true;
      return;
    }
    const entry = entries[entryIndex]!;
    if (entry.ewayNo !== typed || entry.filePath !== path) {
      entries[entryIndex] = { ...entry, ewayNo: typed, filePath: path };
      changed = true;
    }
  });
  return { entries, changed };
}
