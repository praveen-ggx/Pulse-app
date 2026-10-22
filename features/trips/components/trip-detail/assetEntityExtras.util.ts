/**
 * Extra vehicle / driver files for the trip Asset Vault: every live
 * entity_documents row of an allowed type that is not already the file shown
 * in its slot. Uploading over an existing slot adds a row (never replaces), so
 * this is where the added files show up.
 */

export type AssetEntityRow = {
  id: string;
  doc_type: string;
  storage_path?: string | null;
  status?: string | null;
  expiry_date?: string | null;
  created_at?: string | null;
};

export type AssetEntityExtraFile = {
  id: string;
  docType: string;
  storagePath: string;
  expiryDate: string | null;
  createdAt: string;
};

export function collectAssetEntityExtras(
  rows: readonly AssetEntityRow[],
  options: {
    allowedTypes: readonly string[];
    /** entity_documents ids already shown in a slot. */
    shownIds?: ReadonlySet<string>;
    /** Storage paths already shown in a slot (vault JSON). */
    shownPaths?: ReadonlySet<string>;
  },
): AssetEntityExtraFile[] {
  const seen = new Set<string>();
  const extras: AssetEntityExtraFile[] = [];
  for (const row of rows) {
    const path = row.storage_path?.trim();
    if (!path || seen.has(row.id)) continue;
    if (row.status === "rejected" || row.status === "replaced") continue;
    if (!options.allowedTypes.includes(row.doc_type)) continue;
    if (options.shownIds?.has(row.id) || options.shownPaths?.has(path)) continue;
    seen.add(row.id);
    extras.push({
      id: row.id,
      docType: row.doc_type,
      storagePath: path,
      expiryDate: row.expiry_date ?? null,
      createdAt: row.created_at ?? "",
    });
  }
  return extras.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
