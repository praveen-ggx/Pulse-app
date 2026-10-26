/**
 * Vault card preview — same hero + thumb strip as LR copies.
 */
import { signCompliancePreviewUrl } from "@/features/tripCompliance/services/complianceDocumentView.service";
import {
  VaultDraftPreviewBlock,
  type VaultDraftPreviewItem,
} from "@/features/trips/components/trip-detail/VaultDraftPreviewBlock";
import { VaultFullDocumentModal } from "@/features/trips/components/trip-detail/VaultFullDocumentModal";
import {
  isPdfTripDoc,
  isVaultFieldsMetaPath,
  type TripDocFile,
  type TripDocItem,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import { getDocumentViewUrls } from "@/features/trips/services/tripDocuments.service";
import { getVehicleDocumentViewUrl } from "@/features/vehicles/services/vehicleDocuments.service";
import { invalidatePdfPreview } from "@/components/pdfEmbedCache.util";
import { useEffect, useMemo, useRef, useState } from "react";

function filesFromDoc(doc: TripDocItem): TripDocFile[] {
  const nested = (doc.files ?? []).filter(
    (file) =>
      !!file.storagePath?.trim() &&
      !isVaultFieldsMetaPath(file.storagePath, file.fileName),
  );
  if (nested.length > 0) return nested;
  const path = doc.storagePath?.trim();
  if (!path || isVaultFieldsMetaPath(path, doc.label)) return [];
  return [
    {
      id: doc.id,
      label: doc.label,
      type: doc.type,
      storagePath: path,
      fileName: doc.label,
      docSource: doc.docSource,
      documentNumber: doc.documentNumber,
    },
  ];
}

export type VaultPreviewSignContext = {
  organizationId?: string | null;
  supplierId?: string | null;
  driverId?: string | null;
};

async function resolveUrl(
  file: TripDocFile,
  sign?: VaultPreviewSignContext,
): Promise<string | null> {
  const ready = file.previewUri?.trim();
  if (ready) return ready;
  const path = file.storagePath.trim();
  if (!path) return null;
  if (/^(https?:|blob:|data:|file:|content:)/i.test(path)) return path;
  if (isVaultFieldsMetaPath(path, file.fileName)) return null;
  const source = file.docSource ?? "trip";
  if (source === "trip") {
    const urls = await getDocumentViewUrls([path]);
    if (urls[path]) return urls[path];
  }
  if (source === "vehicle" || source === "trip") {
    try {
      const vehicleUrl = await getVehicleDocumentViewUrl(path);
      if (vehicleUrl) return vehicleUrl;
    } catch {
      /* try compliance / KYC next */
    }
  }
  return signCompliancePreviewUrl({
    storagePath: path,
    source: source === "supplier-kyc" ? "supplier-kyc" : "compliance",
    organizationId: sign?.organizationId ?? null,
    entityId:
      source === "compliance"
        ? sign?.driverId ?? null
        : sign?.supplierId ?? null,
    docType: file.slotType === "bank_docs" ? "bank_docs" : undefined,
  });
}

export function VaultCardLrStylePreview({
  doc,
  onPressFile,
  onAdd,
  onSelectedFile,
  disabled = false,
  sign,
}: {
  doc: TripDocItem;
  onPressFile: (index: number) => void;
  onAdd?: () => void;
  onSelectedFile?: (file: TripDocFile | null) => void;
  disabled?: boolean;
  sign?: VaultPreviewSignContext;
}) {
  const files = useMemo(() => filesFromDoc(doc), [doc]);
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullOpen, setFullOpen] = useState(false);
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
          next[file.storagePath] = await resolveUrl(file, sign);
        }),
      );
      if (cancelled) return;
      setUrls(next);
      setSelectedId((current) => {
        const next =
          current && files.some((file) => file.id === current)
            ? current
            : files[0]?.id ?? null;
        onSelectedFile?.(files.find((file) => file.id === next) ?? null);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [files, sign, signEpoch]);

  useEffect(() => {
    const nextKeys = new Set(
      files.map((file) => file.storagePath.trim() || file.id).filter(Boolean),
    );
    for (const key of seenKeys.current) {
      if (!nextKeys.has(key)) invalidatePdfPreview(key);
    }
    seenKeys.current = nextKeys;
  }, [files]);

  const items = useMemo((): VaultDraftPreviewItem[] => {
    return files.map((file) => ({
      id: file.id,
      fileName: file.fileName?.trim() || file.label || "Document",
      previewUri: file.previewUri?.trim() || urls[file.storagePath] || null,
      storagePath: file.storagePath,
      locked: true,
    }));
  }, [files, urls]);

  const selected =
    files.find((file) => file.id === selectedId) ?? files[0] ?? null;
  const fullUri = selected ? urls[selected.storagePath] ?? null : null;
  const fullTitle = selected?.fileName?.trim() || selected?.label || doc.label;

  return (
    <>
      <VaultDraftPreviewBlock
        items={items}
        selectedId={selectedId}
        density="card"
        showHint={false}
        showAddThumb={Boolean(onAdd) && !disabled}
        emptyLabel={`Add ${doc.label}`}
        onSelect={(id) => {
          setSelectedId(id);
          onSelectedFile?.(files.find((file) => file.id === id) ?? null);
        }}
        onAdd={() => onAdd?.()}
        onHeroPress={() => {
          const index = files.findIndex((file) => file.id === selectedId);
          onPressFile(index >= 0 ? index : 0);
        }}
        onOpenFull={() => {
          if (fullUri) setFullOpen(true);
        }}
        onRetrySign={() => setSignEpoch((value) => value + 1)}
      />
      <VaultFullDocumentModal
        visible={fullOpen}
        uri={fullUri}
        isPdf={isPdfTripDoc({
          fileName: selected?.fileName,
          storagePath: selected?.storagePath,
        })}
        title={fullTitle}
        documentKey={selected?.storagePath ?? selected?.id}
        documentVersion={selected?.id}
        onClose={() => setFullOpen(false)}
      />
    </>
  );
}
