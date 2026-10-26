import * as Linking from "expo-linking";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform, Share } from "react-native";

import { formatINR } from "@/lib/format";
import { printHtmlOnWeb } from "@/lib/webPrint.util";

import {
  buildProvisionNotePrintHtml,
  type ProvisionNotePdfContext,
} from "@/features/trips/components/trip-detail/adjustment/tripProvisionNotePdf.util";
import { isAdjustmentVoided } from "@/features/trips/services/tripAdjustments";

const PDF_PAGE_WIDTH_PT = 595;
const PDF_PAGE_HEIGHT_PT = 842;
const PDF_MARGIN_PT = 36;

function noteKind(ctx: ProvisionNotePdfContext): "CN" | "DN" {
  return ctx.adjustment.impact === "minus" ? "CN" : "DN";
}

function noteTitle(ctx: ProvisionNotePdfContext): string {
  return ctx.adjustment.impact === "minus" ? "Credit Note" : "Debit Note";
}

export function provisionNotePdfFileName(ctx: ProvisionNotePdfContext): string {
  const kind = noteKind(ctx);
  const trip = String(ctx.tripCode ?? "TRIP")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24);
  return `${kind}-${trip || "NOTE"}.pdf`;
}

export function buildProvisionNoteWhatsAppMessage(ctx: ProvisionNotePdfContext): string {
  const adj = ctx.adjustment;
  const kind = noteKind(ctx);
  const signed = adj.impact === "plus" ? "+" : "−";
  const voided = isAdjustmentVoided(adj) ? "\nStatus: CANCELLED" : "";
  const reason = (adj.reason ?? "").trim() || "—";

  return (
    `Pulse Provision — ${noteTitle(ctx)}\n` +
    `${kind} · Trip ${ctx.tripCode}\n` +
    `Lane: ${ctx.laneLabel}\n` +
    `${ctx.partyRole}: ${ctx.partyName}\n` +
    `Amount: ${signed}${formatINR(adj.amount)}\n` +
    `Base: ${formatINR(ctx.baseLaneAmount)} → Revised: ${formatINR(ctx.revisedLaneAmount)}\n` +
    `Reason: ${reason}${voided}\n\n` +
    `— ${ctx.companyName}`
  );
}

function triggerWebDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

async function resolvePrintHtml(
  ctx: ProvisionNotePdfContext,
  printHtml?: string | null,
): Promise<string> {
  return printHtml ?? buildProvisionNotePrintHtml(ctx);
}

async function createPdfUri(
  ctx: ProvisionNotePdfContext,
  printHtml?: string | null,
  cachedUri?: string | null,
): Promise<{ uri: string; printHtml: string }> {
  const html = await resolvePrintHtml(ctx, printHtml);
  if (Platform.OS !== "web" && cachedUri) {
    return { uri: cachedUri, printHtml: html };
  }

  const { uri } = await Print.printToFileAsync({
    html,
    width: PDF_PAGE_WIDTH_PT,
    height: PDF_PAGE_HEIGHT_PT,
    margins: {
      top: PDF_MARGIN_PT,
      right: PDF_MARGIN_PT,
      bottom: PDF_MARGIN_PT,
      left: PDF_MARGIN_PT,
    },
  });

  return { uri, printHtml: html };
}

async function sharePdfUri(uri: string, title: string): Promise<void> {
  if (Platform.OS === "web") {
    if (uri.startsWith("blob:") || uri.startsWith("http")) {
      const response = await fetch(uri);
      const blob = await response.blob();
      const file = new File([blob], `${title.replace(/\s+/g, "-").toLowerCase()}.pdf`, {
        type: "application/pdf",
      });
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ files: [file], title });
          return;
        } catch {
          /* fall through */
        }
      }
      triggerWebDownload(blob, `${title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
      return;
    }
    window.open(uri, "_blank");
    return;
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: title,
      UTI: "com.adobe.pdf",
    });
    return;
  }

  await Share.share({ url: uri, title });
}

export async function printProvisionNote(
  ctx: ProvisionNotePdfContext,
  printHtml?: string | null,
): Promise<void> {
  const html = await resolvePrintHtml(ctx, printHtml);
  try {
    if (Platform.OS === "web") {
      const title = `${noteTitle(ctx)} · ${ctx.tripCode}`;
      const ok = await printHtmlOnWeb(html, { title });
      if (!ok) {
        Alert.alert("Print", "Could not open the print preview for this note.");
      }
      return;
    }
    await Print.printAsync({ html });
  } catch {
    await Share.share({
      message: buildProvisionNoteWhatsAppMessage(ctx),
      title: `${noteTitle(ctx)} · ${ctx.tripCode}`,
    }).catch(() => {
      Alert.alert("Print", "Could not open the print dialog for this note.");
    });
  }
}

export async function shareProvisionNoteOnWhatsApp(
  ctx: ProvisionNotePdfContext,
): Promise<void> {
  const message = buildProvisionNoteWhatsAppMessage(ctx);
  const encoded = encodeURIComponent(message);
  const waWeb = `https://wa.me/?text=${encoded}`;
  const waNative = `whatsapp://send?text=${encoded}`;

  try {
    if (Platform.OS === "web") {
      await Linking.openURL(waWeb);
      return;
    }
    const canOpen = await Linking.canOpenURL(waNative);
    if (canOpen) {
      await Linking.openURL(waNative);
      return;
    }
    await Share.share({ message });
  } catch {
    await Share.share({ message }).catch(() => {
      Alert.alert("WhatsApp", "Could not open WhatsApp for this note.");
    });
  }
}

export async function shareProvisionNotePdf(
  ctx: ProvisionNotePdfContext,
  printHtml?: string | null,
  cachedUri?: string | null,
): Promise<void> {
  const title = `${noteTitle(ctx)} · ${ctx.tripCode}`;
  try {
    if (Platform.OS === "web") {
      const { uri } = await createPdfUri(ctx, printHtml, cachedUri);
      await sharePdfUri(uri, title);
      return;
    }
    const { uri } = await createPdfUri(ctx, printHtml, cachedUri);
    await sharePdfUri(uri, title);
  } catch {
    try {
      await Share.share({
        message: buildProvisionNoteWhatsAppMessage(ctx),
        title,
      });
    } catch {
      Alert.alert("Share", "Could not share this provision note.");
    }
  }
}

export async function downloadProvisionNotePdf(
  ctx: ProvisionNotePdfContext,
  printHtml?: string | null,
  cachedUri?: string | null,
): Promise<void> {
  const title = `${noteTitle(ctx)} · ${ctx.tripCode}`;
  const fileName = provisionNotePdfFileName(ctx);

  try {
    if (Platform.OS === "web") {
      const html = await resolvePrintHtml(ctx, printHtml);
      const ok = await printHtmlOnWeb(html, { title });
      if (!ok) {
        Alert.alert(
          "Download",
          "Could not open the print preview. Choose Save as PDF in the print dialog.",
        );
      }
      return;
    }

    const { uri } = await createPdfUri(ctx, printHtml, cachedUri);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Save ${fileName}`,
        UTI: "com.adobe.pdf",
      });
      return;
    }
    await Share.share({ url: uri, title });
  } catch {
    Alert.alert("Download", "Could not download this provision note.");
  }
}
