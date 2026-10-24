import type { TripDocFile, TripDocItem } from "@/features/trips/components/trip-detail/tripDocTypes";

/** Nested vault files win; otherwise the card's own storage path is the LR copy. */
export function filesFromVaultDoc(doc: TripDocItem): TripDocFile[] {
  const nested = (doc.files ?? []).filter((file) => !!file.storagePath?.trim());
  if (nested.length > 0) return nested;
  const path = doc.storagePath?.trim();
  if (!path) return [];
  return [
    {
      id: doc.id,
      label: doc.label,
      type: doc.type,
      storagePath: path,
      fileName: doc.label,
      docSource: doc.docSource,
    },
  ];
}
