// Must run before jspdf: its fast-png dep decodes latin1 at load (fails on native).
import "@/features/trips/utils/latin1TextDecoder.util";

import { jsPDF } from "jspdf";

import type { ElrSnapshot } from "@/features/trips/services/elrSnapshot.util";

export type ElrPreviewRow = { label: string; value: string };
export type ElrPreviewBlock = { title: string; rows: ElrPreviewRow[] };

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const WASH = "#f8fafc";
const PRIMARY = "#4D3636";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTripDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatFreight(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function partyAddress(party: {
  address?: string;
  city?: string;
  state?: string;
  pin?: string;
}): string {
  return [party.address, party.city, party.state, party.pin].filter(Boolean).join(", ");
}

function gstRow(party: { gstStatus?: string; gstin?: string }): ElrPreviewRow | null {
  if (party.gstStatus === "unregistered") return { label: "GST", value: "Unregistered" };
  const gstin = party.gstin?.trim();
  if (gstin) return { label: "GSTIN", value: gstin };
  return null;
}

function partyRows(
  party: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    pin?: string;
    gstin?: string;
    gstStatus?: string;
  },
  nameLabel = "Name",
): ElrPreviewRow[] {
  const rows: ElrPreviewRow[] = [{ label: nameLabel, value: party.name }];
  const address = partyAddress(party);
  if (address) rows.push({ label: "Address", value: address });
  const gst = gstRow(party);
  if (gst) rows.push(gst);
  return rows;
}

/** Shared layout for the on-screen preview and the PDF. Omits empty fields. */
export function elrPreviewModel(snapshot: ElrSnapshot): {
  company: string;
  lrNumber: string;
  dateLabel: string;
  blocks: ElrPreviewBlock[];
} {
  const transport: ElrPreviewRow[] = partyRows(snapshot.transporter, "Name");
  transport.push({ label: "Vehicle no.", value: snapshot.vehicle.registrationNumber });
  if (snapshot.vehicle.type) {
    transport.push({ label: "Vehicle type", value: snapshot.vehicle.type });
  }
  if (snapshot.driver?.name) {
    transport.push({ label: "Driver", value: snapshot.driver.name });
  }
  if (snapshot.driver?.phone) {
    transport.push({ label: "Driver phone", value: snapshot.driver.phone });
  }

  const blocks: ElrPreviewBlock[] = [
    { title: "Consignor", rows: partyRows(snapshot.consignor) },
    ...(snapshot.consignee
      ? [{ title: "Consignee", rows: partyRows(snapshot.consignee) }]
      : []),
    { title: "Transport", rows: transport },
    {
      title: "Route",
      rows: [
        { label: "Origin", value: snapshot.route.origin },
        { label: "Destination", value: snapshot.route.destination },
      ],
    },
  ];

  const goods: ElrPreviewRow[] = [];
  if (snapshot.cargo?.description) {
    goods.push({ label: "Description", value: snapshot.cargo.description });
  }
  if (snapshot.cargo?.quantity != null && snapshot.cargo.unit) {
    goods.push({
      label: "Quantity",
      value: `${snapshot.cargo.quantity} ${snapshot.cargo.unit}`,
    });
  }
  if (snapshot.cargo?.weight != null && snapshot.cargo.weightUnit) {
    goods.push({
      label: "Weight",
      value: `${snapshot.cargo.weight} ${snapshot.cargo.weightUnit}`,
    });
  } else if (snapshot.cargo?.weightTons != null) {
    goods.push({ label: "Weight", value: `${snapshot.cargo.weightTons} tons` });
  }
  if (snapshot.cargo?.hsn) goods.push({ label: "HSN", value: snapshot.cargo.hsn });
  if (goods.length > 0) blocks.push({ title: "Goods", rows: goods });

  const commercial: ElrPreviewRow[] = [];
  if (snapshot.commercial?.sourceDocument) {
    commercial.push({
      label: "Document",
      value: `${snapshot.commercial.sourceDocument.number} · ${formatTripDate(snapshot.commercial.sourceDocument.date)}`,
    });
  }
  if (snapshot.commercial?.goodsValue != null) {
    commercial.push({
      label: "Goods value",
      value: formatFreight(snapshot.commercial.goodsValue),
    });
  }
  if (snapshot.commercial?.freight != null) {
    commercial.push({
      label: "Freight",
      value: formatFreight(snapshot.commercial.freight),
    });
  }
  if (snapshot.commercial?.freightBasis) {
    commercial.push({
      label: "Basis",
      value: snapshot.commercial.freightBasis,
    });
  }
  if (commercial.length > 0) blocks.push({ title: "Freight", rows: commercial });

  const reference: ElrPreviewRow[] = [
    { label: "Trip", value: snapshot.trip.tripNumber },
  ];
  if (snapshot.trip.indentId) {
    reference.push({ label: "Indent", value: snapshot.trip.indentId });
  }
  if (snapshot.references?.orderNumber) {
    reference.push({ label: "Order", value: snapshot.references.orderNumber });
  }
  if (snapshot.references?.ewayBillNumber) {
    reference.push({ label: "E-way bill", value: snapshot.references.ewayBillNumber });
  }
  blocks.push({ title: "Trip reference", rows: reference });

  return {
    company: snapshot.transporter.name,
    lrNumber: snapshot.lrNumber,
    dateLabel: formatTripDate(snapshot.trip.tripDate),
    blocks,
  };
}

function rowsHtml(rows: ElrPreviewRow[]): string {
  return rows
    .map(
      (row) => `
        <div class="pair">
          <div class="label">${escapeHtml(row.label)}</div>
          <div class="value">${escapeHtml(row.value)}</div>
        </div>`,
    )
    .join("");
}

function sectionHtml(block: ElrPreviewBlock | undefined): string {
  if (!block || block.rows.length === 0) return "";
  return `
    <section>
      <h2>${escapeHtml(block.title)}</h2>
      ${rowsHtml(block.rows)}
    </section>`;
}

function splitCols(left: string, right: string): string {
  if (!left && !right) return "";
  if (!right) return `<div class="stack">${left}</div>`;
  if (!left) return `<div class="stack">${right}</div>`;
  return `<div class="cols">${left}${right}</div>`;
}

function bandHtml(rows: ElrPreviewRow[] | undefined, extraClass = ""): string {
  if (!rows || rows.length === 0) return "";
  return `<div class="band ${extraClass}">${rows
    .map(
      (row) => `
        <div>
          <h2>${escapeHtml(row.label)}</h2>
          <div class="place">${escapeHtml(row.value)}</div>
        </div>`,
    )
    .join("")}</div>`;
}

const ELR_SHEET_CSS = `
    .elr-sheet, .elr-sheet * { box-sizing: border-box; }
    .elr-sheet {
      width: 100%;
      max-width: 720px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #e7e0dc;
      padding: 28px 32px 22px;
      color: ${INK};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    }
    .elr-sheet header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
    }
    .elr-sheet .kicker {
      margin: 0 0 6px;
      font-size: 10px;
      letter-spacing: 0.16em;
      font-weight: 700;
      color: ${PRIMARY};
    }
    .elr-sheet h1 {
      margin: 0;
      font-size: 18px;
      line-height: 1.25;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .elr-sheet .meta { text-align: right; flex: 0 0 auto; }
    .elr-sheet .lr {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      font-variant-numeric: tabular-nums;
    }
    .elr-sheet .date { margin-top: 4px; font-size: 11px; color: ${MUTED}; }
    .elr-sheet .accent { height: 2px; margin-top: 16px; background: ${PRIMARY}; }
    .elr-sheet .cols,
    .elr-sheet .band {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      column-gap: 0;
      align-items: start;
    }
    .elr-sheet .stack { padding-top: 16px; }
    .elr-sheet .cols > section,
    .elr-sheet .stack > section { padding-top: 16px; min-width: 0; }
    .elr-sheet .cols > section:not(:last-child) {
      padding-right: 24px;
      border-right: 1px solid ${LINE};
    }
    .elr-sheet .cols > section + section { padding-left: 24px; }
    .elr-sheet h2 {
      margin: 0 0 8px;
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #94a3b8;
      font-weight: 700;
    }
    .elr-sheet .pair {
      display: grid;
      grid-template-columns: 7.25rem minmax(0, 1fr);
      column-gap: 12px;
      align-items: start;
      padding: 3px 0;
    }
    .elr-sheet .label {
      color: ${MUTED};
      font-size: 11px;
      line-height: 1.4;
      padding-top: 1px;
    }
    .elr-sheet .value {
      color: ${INK};
      font-size: 12px;
      line-height: 1.4;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .elr-sheet .band {
      margin-top: 4px;
      padding-top: 14px;
      border-top: 1px solid ${LINE};
      gap: 16px 0;
    }
    .elr-sheet .band > div:not(:last-child) { padding-right: 24px; }
    .elr-sheet .band > div + div {
      padding-left: 24px;
      border-left: 1px solid ${LINE};
    }
    .elr-sheet .band.metrics {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .elr-sheet .band.metrics > div { padding: 0 16px; }
    .elr-sheet .band.metrics > div:first-child { padding-left: 0; }
    .elr-sheet .band.metrics > div:last-child { padding-right: 0; }
    .elr-sheet .place { font-size: 13px; font-weight: 600; line-height: 1.4; }
    .elr-sheet footer {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 8px 0;
      margin-top: 4px;
      padding-top: 14px;
      border-top: 1px solid ${LINE};
    }
    .elr-sheet .ref {
      display: grid;
      grid-template-columns: 4.75rem minmax(0, 1fr);
      column-gap: 12px;
      align-items: start;
      font-size: 11px;
      color: ${MUTED};
      min-width: 0;
      padding: 0 0 0 0;
    }
    .elr-sheet .ref:nth-child(odd) { padding-right: 24px; }
    .elr-sheet .ref:nth-child(even) { padding-left: 24px; }
    .elr-sheet .ref strong {
      color: ${INK};
      font-weight: 600;
      overflow-wrap: anywhere;
    }
`;

function elrSheetArticle(snapshot: ElrSnapshot): { title: string; article: string } {
  const model = elrPreviewModel(snapshot);
  const byTitle = new Map(model.blocks.map((block) => [block.title, block]));
  const freight = byTitle.get("Freight");
  const reference = byTitle.get("Trip reference");
  const article = `
  <article class="elr-sheet sheet doc">
    <header>
      <div>
        <p class="kicker">ELECTRONIC LORRY RECEIPT</p>
        <h1>${escapeHtml(model.company)}</h1>
      </div>
      <div class="meta">
        <div class="lr">${escapeHtml(model.lrNumber)}</div>
        <div class="date">${escapeHtml(model.dateLabel)}</div>
      </div>
    </header>
    <div class="accent"></div>
    ${splitCols(sectionHtml(byTitle.get("Consignor")), sectionHtml(byTitle.get("Consignee")))}
    ${bandHtml(byTitle.get("Route")?.rows)}
    ${splitCols(sectionHtml(byTitle.get("Transport")), sectionHtml(byTitle.get("Goods")))}
    ${bandHtml(freight?.rows, freight && freight.rows.length >= 3 ? "metrics" : "")}
    ${
      reference
        ? `<footer>${reference.rows
            .map(
              (row) => `
            <div class="ref">
              <span>${escapeHtml(row.label)}</span>
              <strong>${escapeHtml(row.value)}</strong>
            </div>`,
            )
            .join("")}</footer>`
        : ""
    }
  </article>`;
  return { title: model.lrNumber, article };
}

/** Style + sheet only, for embedding in the in-app preview (no iframe page chrome). */
export function buildElrPreviewEmbedHtml(snapshot: ElrSnapshot): string {
  const { article } = elrSheetArticle(snapshot);
  return `<style>${ELR_SHEET_CSS}</style>${article}`;
}

export function buildElrPreviewHtml(snapshot: ElrSnapshot): string {
  const { title, article } = elrSheetArticle(snapshot);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    html, body { margin: 0; padding: 0; background: ${WASH}; }
    body { padding: 16px; }
    ${ELR_SHEET_CSS}
  </style>
</head>
<body class="page">${article}</body>
</html>`;
}

/** Raster of the preview sheet, so Open / Download / Share match the on-screen LR. */
export async function renderElrPreviewToPdfBlob(html: string): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("Preview PDF needs a browser document.");
  }
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const sheet = parsed.querySelector(".sheet");
  if (!(sheet instanceof HTMLElement)) throw new Error("Receipt sheet missing.");
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-14000px;top:0;width:720px;background:#ffffff;";
  const style = document.createElement("style");
  style.textContent = parsed.querySelector("style")?.textContent ?? "";
  host.append(style, sheet);
  document.body.appendChild(host);
  try {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(sheet, {
      scale: 2,
      backgroundColor: "#ffffff",
      windowWidth: 720,
    });
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 36;
    const drawWidth = pageWidth - margin * 2;
    const drawHeight = (canvas.height * drawWidth) / canvas.width;
    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      margin,
      margin,
      drawWidth,
      Math.min(drawHeight, pdf.internal.pageSize.getHeight() - margin * 2),
    );
    return pdf.output("blob");
  } finally {
    host.remove();
  }
}

function drawPairs(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  rows: ElrPreviewRow[],
): number {
  const labelW = 104;
  for (const row of rows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(row.label, x, y);
    const lines = doc.splitTextToSize(row.value, Math.max(40, width - labelW));
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(lines, x + labelW, y);
    y += Math.max(14, lines.length * 12);
  }
  return y;
}

function drawSection(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  block: ElrPreviewBlock | undefined,
): number {
  if (!block || block.rows.length === 0) return y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(block.title.toUpperCase(), x, y);
  return drawPairs(doc, x, y + 14, width, block.rows);
}

/** PDF bytes for one immutable snapshot. The renderer does not read the database. */
export function generateElrPdfBytes(snapshot: ElrSnapshot): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: false });
  doc.setProperties({
    title: snapshot.lrNumber,
    creator: "Pulse",
  });
  const model = elrPreviewModel(snapshot);
  const byTitle = new Map(model.blocks.map((block) => [block.title, block]));
  const left = 40;
  const width = 515;
  const gap = 22;
  const colW = (width - gap) / 2;
  let y = 42;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(77, 54, 54);
  doc.text("ELECTRONIC LORRY RECEIPT", left, y);
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(model.company, left, y + 18);
  doc.setFontSize(11);
  doc.text(model.lrNumber, left + width, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(model.dateLabel, left + width, y + 16, { align: "right" });
  y += 30;
  doc.setDrawColor(77, 54, 54);
  doc.setLineWidth(1.5);
  doc.line(left, y, left + width, y);
  y += 22;

  const leftEnd = drawSection(doc, left, y, colW, byTitle.get("Consignor"));
  const rightEnd = drawSection(doc, left + colW + gap, y, colW, byTitle.get("Consignee"));
  y = Math.max(leftEnd, rightEnd) + 8;

  const route = byTitle.get("Route");
  if (route) {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.6);
    doc.line(left, y, left + width, y);
    y += 16;
    route.rows.forEach((row, index) => {
      const x = left + index * (colW + gap);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(row.label.toUpperCase(), x, y);
      const lines = doc.splitTextToSize(row.value, colW);
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(lines, x, y + 14);
    });
    y += 36;
  }

  const goodsEnd = drawSection(doc, left, y, colW, byTitle.get("Transport"));
  const freightEnd = drawSection(doc, left + colW + gap, y, colW, byTitle.get("Goods"));
  y = Math.max(goodsEnd, freightEnd, y) + 6;
  const freightBlockEnd = drawSection(doc, left, y, width, byTitle.get("Freight"));
  y = Math.max(freightBlockEnd, y) + 6;

  const reference = byTitle.get("Trip reference");
  if (reference) {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.6);
    doc.line(left, y, left + width, y);
    y += 16;
    drawPairs(doc, left, y, width, reference.rows);
  }

  return doc.output("arraybuffer");
}
