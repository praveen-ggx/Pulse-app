import { Platform } from "react-native";
import * as Print from "expo-print";

import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import { isAdjustmentVoided } from "@/features/trips/services/tripAdjustments";

export type ProvisionNotePdfContext = {
  adjustment: TripAdjustment;
  tripCode: string;
  companyName: string;
  partyName: string;
  laneLabel: string;
  partyRole: string;
  baseLaneAmount: number;
  revisedLaneAmount: number;
};

/** A4 @ 72 PPI — must match expo-print width/height. */
const PDF_PAGE_WIDTH_PT = 595;
const PDF_PAGE_HEIGHT_PT = 842;
const PDF_MARGIN_PT = 36;

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInr(amount: number): string {
  return `₹${Math.max(0, Number(amount) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatDocDate(iso?: string | null): string {
  if (!iso?.trim()) return new Date().toLocaleDateString("en-IN", { dateStyle: "medium" });
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-IN", { dateStyle: "medium" });
}

function shortDocId(adjustmentId: string): string {
  const raw = String(adjustmentId ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return raw.length >= 8 ? raw.slice(-8) : raw.padStart(8, "0");
}

function noteKind(impact: TripAdjustment["impact"]): "CN" | "DN" {
  return impact === "minus" ? "CN" : "DN";
}

function noteTitle(impact: TripAdjustment["impact"]): string {
  return impact === "minus" ? "Credit Note" : "Debit Note";
}

function effectDescription(ctx: ProvisionNotePdfContext): string {
  const isSale = ctx.adjustment.type === "revenue";
  const isCn = ctx.adjustment.impact === "minus";
  if (isSale && isCn) return "Reduces amount receivable from client (sale lane).";
  if (isSale && !isCn) return "Increases amount receivable from client (sale lane).";
  if (!isSale && isCn) return `Reduces ${ctx.partyRole.toLowerCase()} trip cost (cost lane).`;
  return `Increases ${ctx.partyRole.toLowerCase()} trip cost (cost lane).`;
}

function headBg(lane: "sale" | "cost"): string {
  return lane === "sale" ? "#4D3636" : "#0f766e";
}

type TicketParts = {
  voided: boolean;
  headLane: "sale" | "cost";
  title: string;
  docDate: string;
  kind: string;
  docId: string;
  amountClass: string;
  signed: string;
  amount: string;
  effect: string;
  tripCode: string;
  laneLabel: string;
  valLane: string;
  partyRole: string;
  partyName: string;
  laneLower: string;
  baseAmount: string;
  revisedAmount: string;
  reason: string;
  companyName: string;
  generatedAt: string;
};

function buildTicketParts(ctx: ProvisionNotePdfContext): TicketParts {
  const adj = ctx.adjustment;
  const kind = noteKind(adj.impact);
  const headLane = adj.type === "revenue" ? "sale" : "cost";
  return {
    voided: isAdjustmentVoided(adj),
    headLane,
    title: noteTitle(adj.impact),
    docDate: formatDocDate(adj.created_at),
    kind,
    docId: shortDocId(adj.id),
    amountClass: kind === "CN" ? "cn" : "dn",
    signed: adj.impact === "plus" ? "+" : "−",
    amount: formatInr(adj.amount),
    effect: effectDescription(ctx),
    tripCode: ctx.tripCode,
    laneLabel: ctx.laneLabel,
    valLane: headLane,
    partyRole: ctx.partyRole,
    partyName: ctx.partyName,
    laneLower: ctx.laneLabel.toLowerCase(),
    baseAmount: formatInr(ctx.baseLaneAmount),
    revisedAmount: formatInr(ctx.revisedLaneAmount),
    reason: (adj.reason ?? "").trim() || "—",
    companyName: ctx.companyName,
    generatedAt: new Date().toLocaleString("en-IN"),
  };
}

/** Table-based ticket — reliable in WKWebView → PDF. */
function buildTicketTableHtml(p: TicketParts): string {
  const hb = headBg(p.headLane);
  const laneColor = p.valLane === "sale" ? "#4D3636" : "#0f766e";
  const amtColor = p.amountClass === "cn" ? "#be123c" : "#047857";

  return `
<table class="ticket" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td colspan="2" style="background:${hb};color:#fff;padding:12px 16px;border:0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:middle;padding:0;border:0;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Pulse Provision</div>
            <div style="margin-top:3px;font-size:11px;font-weight:500;opacity:0.9;">${escapeHtml(p.title)} · ${escapeHtml(p.docDate)}</div>
          </td>
          <td style="vertical-align:middle;text-align:right;padding:0 0 0 8px;border:0;white-space:nowrap;font-size:12px;font-weight:700;">
            ${escapeHtml(p.kind)} · ${escapeHtml(p.docId)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding:14px 16px 10px;background:#fff;border:0;text-align:center;">
      <div style="display:inline-block;font-size:11px;font-weight:800;letter-spacing:0.12em;padding:4px 10px;border-radius:5px;background:#f1f5f9;color:#64748b;margin-bottom:8px;">${escapeHtml(p.kind)}</div>
      <div style="font-size:28px;font-weight:900;color:${amtColor};line-height:1.1;">${p.signed}${escapeHtml(p.amount)}</div>
      <div style="margin-top:6px;font-size:11px;color:#64748b;line-height:1.4;">${escapeHtml(p.effect)}</div>
    </td>
  </tr>
  <tr><td colspan="2" style="padding:0 16px;border:0;"><div style="border-top:1px dashed #e2e8f0;"></div></td></tr>
  <tr>
    <td style="width:38%;padding:6px 8px 6px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border:0;vertical-align:top;">Trip</td>
    <td style="padding:6px 16px 6px 8px;font-size:12px;font-weight:600;text-align:right;color:#0f172a;border:0;vertical-align:top;">${escapeHtml(p.tripCode)}</td>
  </tr>
  <tr>
    <td style="padding:6px 8px 6px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border:0;vertical-align:top;">Lane</td>
    <td style="padding:6px 16px 6px 8px;font-size:12px;font-weight:600;text-align:right;color:${laneColor};border:0;vertical-align:top;">${escapeHtml(p.laneLabel)}</td>
  </tr>
  <tr>
    <td style="padding:6px 8px 6px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border:0;vertical-align:top;">${escapeHtml(p.partyRole)}</td>
    <td style="padding:6px 16px 6px 8px;font-size:12px;font-weight:600;text-align:right;color:#0f172a;border:0;vertical-align:top;">${escapeHtml(p.partyName)}</td>
  </tr>
  <tr>
    <td style="padding:6px 8px 6px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border:0;vertical-align:top;">Base ${escapeHtml(p.laneLower)}</td>
    <td style="padding:6px 16px 6px 8px;font-size:12px;font-weight:600;text-align:right;color:#0f172a;border:0;vertical-align:top;">${escapeHtml(p.baseAmount)}</td>
  </tr>
  <tr>
    <td style="padding:6px 8px 6px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;border:0;vertical-align:top;">Revised</td>
    <td style="padding:6px 16px 6px 8px;font-size:12px;font-weight:600;text-align:right;color:#0f172a;border:0;vertical-align:top;">${escapeHtml(p.revisedAmount)}</td>
  </tr>
  <tr>
    <td colspan="2" style="padding:8px 16px;border:0;background:#fff;">
      <div style="border-top:1px dashed #94a3b8;margin:4px 0 8px;"></div>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding:4px 16px 14px;background:#fff;border:0;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;">Reason</div>
      <div style="margin-top:5px;font-size:12px;color:#0f172a;line-height:1.45;">${escapeHtml(p.reason)}</div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#64748b;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="border:0;padding:0;vertical-align:top;">${escapeHtml(p.companyName)}</td>
            <td style="border:0;padding:0;text-align:right;vertical-align:top;">${escapeHtml(p.generatedAt)}</td>
          </tr>
        </table>
      </div>
      <div style="margin-top:10px;height:20px;background:repeating-linear-gradient(90deg,#0f172a 0,#0f172a 2px,transparent 2px,transparent 5px);opacity:0.1;border-radius:2px;"></div>
    </td>
  </tr>
</table>`;
}

const SCREEN_CSS = `
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    background: #eef2f6;
    -webkit-text-size-adjust: 100%;
  }
  body {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px 12px 24px;
  }
  .wm {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-24deg);
    font-size: 52px;
    font-weight: 700;
    font-style: italic;
    letter-spacing: -0.04em;
    color: #475569;
    opacity: 0.06;
    pointer-events: none;
    z-index: 0;
  }
  .wm-dot {
    color: #FFCE44;
  }
  .ticket-outer {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 400px;
  }
  .ticket-outer .void-stamp {
    position: absolute;
    top: 42%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-14deg);
    font-size: 32px;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: rgba(190, 18, 60, 0.38);
    border: 3px solid rgba(190, 18, 60, 0.42);
    padding: 6px 14px;
    z-index: 2;
    pointer-events: none;
  }
  .ticket {
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
    border-collapse: separate;
    border-spacing: 0;
  }
`;

/** CSS for expo-print PDF viewport (no flex, no @page — page size set via API). */
const PRINT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%;
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    padding: 4px 0 0;
    text-align: center;
  }
  .wm {
    position: absolute;
    top: 42%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-24deg);
    font-size: 48px;
    font-weight: 700;
    font-style: italic;
    letter-spacing: -0.04em;
    color: #94a3b8;
    opacity: 0.08;
    z-index: 0;
  }
  .ticket-outer {
    position: relative;
    z-index: 1;
    display: inline-block;
    width: 100%;
    max-width: 100%;
    text-align: left;
    margin: 0 auto;
  }
  .ticket-outer .void-stamp {
    position: absolute;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-14deg);
    font-size: 30px;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: rgba(190, 18, 60, 0.36);
    border: 3px solid rgba(190, 18, 60, 0.4);
    padding: 5px 12px;
    z-index: 2;
    pointer-events: none;
  }
  .ticket {
    width: 100%;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
    background: #fff;
    border-collapse: collapse;
  }
`;

function wrapDocument(
  title: string,
  css: string,
  ticketTable: string,
  voided: boolean,
): string {
  const safeTitle = escapeHtml(title);
  const voidStamp = voided
    ? `<div class="void-stamp" aria-hidden="true">CANCELLED</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>${css}</style>
</head>
<body>
  <div class="wm" aria-hidden="true">pulse<span class="wm-dot">.</span></div>
  <div class="ticket-outer">
    ${voidStamp}
    ${ticketTable}
  </div>
</body>
</html>`;
}

/** In-app WebView preview. */
export function buildProvisionNotePreviewHtml(ctx: ProvisionNotePdfContext): string {
  const p = buildTicketParts(ctx);
  const title = `${p.title} · ${p.tripCode}`;
  return wrapDocument(title, SCREEN_CSS, buildTicketTableHtml(p), p.voided);
}

/** expo-print PDF (A4 + margins). */
export function buildProvisionNotePrintHtml(ctx: ProvisionNotePdfContext): string {
  const p = buildTicketParts(ctx);
  const title = `${p.title} · ${p.tripCode}`;
  return wrapDocument(title, PRINT_CSS, buildTicketTableHtml(p), p.voided);
}

/** @deprecated Use buildProvisionNotePreviewHtml — kept for callers. */
export function buildProvisionNotePdfHtml(ctx: ProvisionNotePdfContext): string {
  return buildProvisionNotePreviewHtml(ctx);
}

export async function generateProvisionNotePdfUri(
  ctx: ProvisionNotePdfContext,
): Promise<{ uri: string; html: string; printHtml: string }> {
  const html = buildProvisionNotePreviewHtml(ctx);
  const printHtml = buildProvisionNotePrintHtml(ctx);

  if (Platform.OS === "web") {
    return { uri: printHtml, html, printHtml };
  }

  const { uri } = await Print.printToFileAsync({
    html: printHtml,
    width: PDF_PAGE_WIDTH_PT,
    height: PDF_PAGE_HEIGHT_PT,
    margins: {
      top: PDF_MARGIN_PT,
      right: PDF_MARGIN_PT,
      bottom: PDF_MARGIN_PT,
      left: PDF_MARGIN_PT,
    },
  });

  return { uri, html, printHtml };
}
