/**
 * Vault card preview — same hero + thumb strip as LR copies.
 */
import { signCompliancePreviewUrl } from "@/features/tripCompliance/services/complianceDocumentView.service";
import {
  VaultDraftPreviewBlock,
  type VaultDraftPreviewItem,
} from "@/features/trips/components/trip-detail/VaultDraftPreviewBlock";
import {
  type TripDocFile,
  type TripDocItem,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import { getDocumentViewUrls } from "@/features/trips/services/tripDocuments.service";
import { getVehicleDocumentViewUrl } from "@/features/vehicles/services/vehicleDocuments.service";
import { invalidatePdfPreview } from "@/components/pdfEmbedCache.util";
import { useEffect, useMemo, useRef, useState } from "react";

function filesFromDoc(doc: TripDocItem): TripDocFile[] {
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

async function resolveUrl(file: TripDocFile): Promise<string | null> {
  const path = file.storagePath.trim();
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const source = file.docSource ?? "trip";
  if (source === "trip") {
    const urls = await getDocumentViewUrls([path]);
    return urls[path] ?? null;
  }
  if (source === "vehicle") {
    try {
      return await getVehicleDocumentViewUrl(path);
    } catch {
      return null;
    }
  }
  return signCompliancePreviewUrl({
    storagePath: path,
    source: "compliance",
  });
}

export function VaultCardLrStylePreview({
  doc,
  onPressFile,
  onAdd,
  disabled = false,
}: {
  doc: TripDocItem;
  onPressFile: (index: number) => void;
  onAdd?: () => void;
  disabled?: boolean;
}) {
  const files = useMemo(() => filesFromDoc(doc), [doc]);
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signEpoch, setSignEpoch] = useState(0);
  const seenKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (files.length === 0) {
      setUrls({});
      setSelectedId(null);
      return;
    }
    let cancelled = false;
    const tripPaths = files
      .filter((file) => (file.docSource ?? "trip") === "trip")
      .map((file) => file.storagePath.trim())
      .filter(Boolean);
    void (async () => {
      const next: Record<string, string | null> = {};
      if (tripPaths.length > 0) {
        Object.assign(next, await getDocumentViewUrls(tripPaths));
      }
      await Promise.all(
        files.map(async (file) => {
          if (next[file.storagePath]) return;
          next[file.storagePath] = await resolveUrl(file);
        }),
      );
      if (cancelled) return;
      setUrls(next);
      setSelectedId((current) =>
        current && files.some((file) => file.id === current) ? current : files[0]?.id ?? null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [files, signEpoch]);

  useEffect(() => {
    const nextKeys = new Set(
      files.map((file) => file.storagePath.trim() || file.id).filter(Boolean),
    );
    for (const key of seenKeys.current) {
      if (!nextKeys.has(key)) invalidatePdfPreview(key);
    }
    seenKeys.current = nextKeys;
  }, [files]);

  const items = useMemo<VaultDraftPreviewItem[]>(
    () =>
      files.map((file) => ({
        id: file.id,
        fileName: file.fileName?.trim() || file.label || "Document",
        previewUri: urls[file.storagePath] ?? null,
        storagePath: file.storagePath,
        locked: true,
      })),
    [files, urls],
  );

  return (
    <VaultDraftPreviewBlock
      items={items}
      selectedId={selectedId}
      density="card"
      showHint={false}
      showAddThumb={Boolean(onAdd) && !disabled}
      emptyLabel={`Add ${doc.label}`}
      onSelect={setSelectedId}
      onAdd={() => onAdd?.()}
      onHeroPress={() => {
        const index = files.findIndex((file) => file.id === selectedId);
        onPressFile(index >= 0 ? index : 0);
      }}
      onRetrySign={() => setSignEpoch((value) => value + 1)}
    />
  );
}
