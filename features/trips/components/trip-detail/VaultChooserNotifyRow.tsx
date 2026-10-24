/**
 * Vault chooser row — same notification card as inbox / Change driver.
 * Uploaded files show in the quote area.
 */
import { AlertRegistrySignalCard } from "@/components/AlertRegistrySignalCard";
import {
  RegistryCardActions,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import Theme from "@/constants/Theme";
import { isPdfTripDoc } from "@/features/trips/components/trip-detail/tripDocTypes";
import { VaultDocThumb } from "@/features/trips/components/trip-detail/VaultDocThumb";
import { signCompliancePreviewUrl } from "@/features/tripCompliance/services/complianceDocumentView.service";
import { getDocumentViewUrls } from "@/features/trips/services/tripDocuments.service";
import { getVehicleDocumentViewUrl } from "@/features/vehicles/services/vehicleDocuments.service";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";

const HUG_BTN: ViewStyle = {
  alignSelf: "flex-start",
  flexGrow: 0,
  flexShrink: 0,
  minWidth: 0,
  width: "auto",
};

export type VaultChooserPreviewSource = "trip" | "vehicle" | "compliance" | "supplier-kyc";

export type VaultChooserPreview = {
  storagePath?: string | null;
  previewUri?: string | null;
  fileName?: string | null;
  mimeHint?: string | null;
  source?: VaultChooserPreviewSource;
  organizationId?: string | null;
  entityId?: string | null;
};

type Props = {
  label: string;
  meta: string;
  onFile: boolean;
  canUpload: boolean;
  entityType?: PartyEntityType;
  preview?: VaultChooserPreview | null;
  onPreview: () => void;
  onAdd: () => void;
};

function ChooserQuoteDoc({
  preview,
  onPress,
}: {
  preview: VaultChooserPreview;
  onPress: () => void;
}) {
  const [uri, setUri] = useState<string | null>(preview.previewUri?.trim() || null);

  useEffect(() => {
    const ready = preview.previewUri?.trim() || "";
    if (ready) {
      setUri(ready);
      return;
    }
    const path = preview.storagePath?.trim() || "";
    if (!path) {
      setUri(null);
      return;
    }
    if (/^https?:\/\//i.test(path)) {
      setUri(path);
      return;
    }
    let cancelled = false;
    void (async () => {
      const tripUrls = await getDocumentViewUrls([path]);
      if (cancelled) return;
      if (tripUrls[path]) {
        setUri(tripUrls[path]);
        return;
      }
      if (preview.source === "vehicle") {
        try {
          const vehicleUrl = await getVehicleDocumentViewUrl(path);
          if (!cancelled && vehicleUrl) {
            setUri(vehicleUrl);
            return;
          }
        } catch {
          /* try compliance */
        }
      }
      const signed = await signCompliancePreviewUrl({
        storagePath: path,
        source: preview.source === "supplier-kyc" ? "supplier-kyc" : "compliance",
        organizationId: preview.organizationId,
        entityId: preview.entityId,
      });
      if (!cancelled) setUri(signed);
    })();
    return () => {
      cancelled = true;
    };
  }, [preview.entityId, preview.organizationId, preview.previewUri, preview.source, preview.storagePath]);

  const pdf = isPdfTripDoc({
    fileName: preview.fileName,
    mimeType: preview.mimeHint,
    storagePath: preview.storagePath,
  });

  return (
    <Pressable
      onPress={onPress}
      style={styles.quoteDoc}
      accessibilityRole="button"
      accessibilityLabel={`Preview ${preview.fileName || "document"}`}
    >
      <VaultDocThumb
        uri={uri}
        isPdf={pdf}
        fileName={preview.fileName}
        style={styles.quoteImage}
      />
    </Pressable>
  );
}

export function VaultChooserNotifyRow({
  label,
  meta,
  onFile,
  canUpload,
  entityType = "client",
  preview = null,
  onPreview,
  onAdd,
}: Props) {
  const showDoc = onFile && Boolean(preview?.previewUri?.trim() || preview?.storagePath?.trim());
  return (
    <AlertRegistrySignalCard
      variant="feed"
      isUnread={!onFile}
      avatar={{
        name: label,
        entityType,
        initialsColorSeed: label,
      }}
      actorName={label}
      actionText={onFile ? "has a file on vault" : "needs a document"}
      detailTitle={undefined}
      detailSubtitle={showDoc ? meta : undefined}
      detailMedia={
        showDoc && preview ? (
          <ChooserQuoteDoc preview={preview} onPress={onPreview} />
        ) : undefined
      }
      onPress={onFile ? onPreview : undefined}
      timeLabel="Vault"
      contextLabel="Documents"
      statusPill={{
        label: onFile ? "On file" : "Pending",
        tone: onFile ? "success" : "warning",
      }}
      footer={
        canUpload ? (
          <RegistryCardActions>
            <RegistryPrimaryButton label="Add" onPress={onAdd} style={HUG_BTN} />
          </RegistryCardActions>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  quoteDoc: {
    width: "100%",
    height: 148,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  quoteImage: {
    width: "100%",
    height: "100%",
  },
  quotePdf: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  quotePdfName: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
    letterSpacing: 0,
  },
});
