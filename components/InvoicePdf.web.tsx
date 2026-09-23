import React, { useMemo, useRef, useState } from 'react';
import type { InvoicePdfData } from '@/components/InvoicePdf.types';
import type { InvoicePdfTableRow } from '@/features/invoicing/services/invoiceCnDn.service';
import { buildInvoicePdfTableRows } from '@/features/invoicing/services/invoiceCnDn.service';
import Theme from '@/constants/Theme';

function formatCurrency(amount: number): string {
  return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const font =
  'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

function pageStyle(): React.CSSProperties {
  return {
    backgroundColor: Theme.screenBackground,
    width: '210mm',
    minHeight: '297mm',
    padding: '36px 40px 32px',
    position: 'relative',
    boxShadow: '0 18px 48px rgba(15, 23, 42, 0.08)',
    boxSizing: 'border-box',
    color: Theme.textPrimaryDark,
    fontFamily: font,
  };
}

function labelStyle(): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: Theme.textMuted,
  };
}

function amountStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    fontVariantNumeric: 'tabular-nums',
    fontFeatureSettings: '"tnum"',
    whiteSpace: 'nowrap',
    textAlign: 'right',
    ...extra,
  };
}

function referenceLabel(item: InvoicePdfTableRow): string {
  if (item.rowRole === 'freight') return item.tripId;
  if (item.rowRole === 'split') {
    if (item.splitKind === 'cn') return 'CN';
    if (item.splitKind === 'dn') return 'DN';
    return 'Charge';
  }
  if (item.rowRole === 'revised') return 'Invoiced';
  if (item.lineType === 'fuel') return 'Fuel';
  return 'Charge';
}

interface InvoicePdfWebProps {
  invoiceData: InvoicePdfData;
  initialShowSplit?: boolean;
  onBack?: () => void;
}

export default function InvoicePdfWeb({
  invoiceData,
  initialShowSplit = true,
  onBack,
}: InvoicePdfWebProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [showSplit, setShowSplit] = useState(initialShowSplit);
  const logoUrl = logoFailed ? null : invoiceData.brandingLogoUrl;
  const tableRows = useMemo(
    () => buildInvoicePdfTableRows(invoiceData.items, { showSplit }),
    [invoiceData.items, showSplit],
  );

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    setIsGenerating(true);

    try {
      const element = printRef.current;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf/dist/jspdf.es.min.js'),
      ]);
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      const rawNo = (invoiceData.invoiceNo || 'DRAFT').trim() || 'DRAFT';
      const safeNo = rawNo.replace(/[^\w.\-]+/g, '_');
      pdf.save(`invoice_${safeNo}.pdf`);
    } catch (error) {
      console.error('Failed to generate PDF', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: Theme.analyticsCanvas,
        fontFamily: font,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: '10px 20px',
          backgroundColor: Theme.screenBackground,
          borderBottom: `1px solid ${Theme.borderMedium}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'none',
              border: 'none',
              padding: '8px 4px',
              minHeight: 44,
              cursor: 'pointer',
              color: Theme.textPrimaryDark,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: font,
            }}
          >
            ← Invoice draft
          </button>
        ) : (
          <div />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div
            role="group"
            aria-label="Invoice line split"
            style={{
              display: 'flex',
              padding: 3,
              backgroundColor: Theme.liquidPillBg,
              border: `1px solid ${Theme.liquidPillBorder}`,
              borderRadius: 999,
            }}
          >
            <button
              type="button"
              onClick={() => setShowSplit(true)}
              style={segmentStyle(showSplit)}
            >
              Show split
            </button>
            <button
              type="button"
              onClick={() => setShowSplit(false)}
              style={segmentStyle(!showSplit)}
            >
              No split
            </button>
          </div>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGenerating}
            style={{
              backgroundColor: isGenerating ? Theme.borderMedium : Theme.buttonPrimary,
              color: Theme.buttonPrimaryText,
              padding: '8px 16px',
              border: `${Theme.buttonPrimaryBorderWidth}px solid ${Theme.buttonPrimaryBorder}`,
              borderRadius: Theme.buttonPrimaryRadius,
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              minHeight: 44,
              fontFamily: font,
            }}
          >
            {isGenerating ? 'Generating…' : 'Download draft'}
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '28px 20px 40px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div ref={printRef} style={pageStyle()}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.2fr) minmax(220px, 0.8fr)',
              gap: 32,
              alignItems: 'start',
              paddingBottom: 20,
              borderBottom: `1px solid ${Theme.borderMedium}`,
            }}
          >
            <div>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Company logo"
                  style={{ height: 36, objectFit: 'contain', maxWidth: 200, marginBottom: 10 }}
                  onError={() => setLogoFailed(true)}
                />
              ) : invoiceData.brandingCompanyName ? (
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    letterSpacing: '-0.03em',
                    lineHeight: 1.2,
                    color: Theme.textPrimaryDark,
                  }}
                >
                  {invoiceData.brandingCompanyName}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: Theme.textMuted }}>Workspace identity unavailable</div>
              )}
              <div style={{ marginTop: 10, maxWidth: 320 }}>
                {invoiceData.issuerAddressLines.map((line, idx) => (
                  <div
                    key={`issuer-addr-${idx}`}
                    style={{ fontSize: 12, color: Theme.textRouteCard, lineHeight: 1.55 }}
                  >
                    {line}
                  </div>
                ))}
                {invoiceData.issuerPan ? (
                  <div style={{ fontSize: 12, color: Theme.textRouteCard, marginTop: 8 }}>
                    PAN {invoiceData.issuerPan}
                  </div>
                ) : null}
                {invoiceData.issuerGstNotApplicable ? (
                  <div style={{ fontSize: 12, color: Theme.textRouteCard }}>GST not applicable</div>
                ) : invoiceData.issuerGstin ? (
                  <div style={{ fontSize: 12, color: Theme.textRouteCard }}>
                    GSTIN {invoiceData.issuerGstin}
                  </div>
                ) : null}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={labelStyle()}>Draft invoice</div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  color: Theme.textPrimaryDark,
                }}
              >
                #{invoiceData.invoiceNo}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: Theme.textMuted, lineHeight: 1.4 }}>
                {invoiceData.invoiceNumberCaption}
              </div>
              <div
                style={{
                  marginTop: 16,
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  columnGap: 16,
                  rowGap: 6,
                  justifyContent: 'end',
                }}
              >
                <div style={{ ...labelStyle(), textAlign: 'left' }}>Preview date</div>
                <div style={{ fontSize: 12, color: Theme.textPrimaryDark, textAlign: 'right' }}>
                  {invoiceData.previewDate}
                </div>
                {invoiceData.indicativeDueDate ? (
                  <>
                    <div style={{ ...labelStyle(), textAlign: 'left' }}>Indicative due</div>
                    <div style={{ fontSize: 12, color: Theme.textPrimaryDark, textAlign: 'right' }}>
                      {invoiceData.indicativeDueDate}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div
            style={{
              position: 'absolute',
              top: '46%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(-28deg)',
              fontSize: 72,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 14,
              color: 'rgba(15,23,42,0.045)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            DRAFT
          </div>

          <div
            style={{
              marginTop: 22,
              paddingBottom: 18,
              borderBottom: `1px solid ${Theme.borderLight}`,
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div style={labelStyle()}>Bill to</div>
            {invoiceData.billingLines.length > 0 ? (
              invoiceData.billingLines.map((line, idx) => (
                <div
                  key={`billing-${idx}`}
                  style={{
                    fontSize: idx === 0 ? 14 : 12,
                    fontWeight: idx === 0 ? 600 : 400,
                    marginTop: idx === 0 ? 8 : 3,
                    color: idx === 0 ? Theme.textPrimaryDark : Theme.textRouteCard,
                    lineHeight: 1.45,
                  }}
                >
                  {line}
                </div>
              ))
            ) : (
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{invoiceData.clientName}</div>
            )}
          </div>

          <table
            style={{
              width: '100%',
              marginTop: 8,
              borderCollapse: 'collapse',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <colgroup>
              <col />
              <col style={{ width: 168 }} />
              <col style={{ width: 128 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle('left')}>Description</th>
                <th style={thStyle('left')}>Reference</th>
                <th style={thStyle('right')}>Value (INR)</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((item, index) => {
                const next = tableRows[index + 1];
                const prev = tableRows[index - 1];
                const inGroup =
                  item.rowRole === 'split' ||
                  item.rowRole === 'revised' ||
                  (item.rowRole === 'freight' && next?.rowRole === 'split');
                const isSplit = item.rowRole === 'split';
                const isRevised = item.rowRole === 'revised';
                const closeGroup = isRevised || (item.rowRole === 'freight' && !inGroup);
                const groupWash = inGroup ? Theme.surface : 'transparent';
                const borderColor = closeGroup ? Theme.borderMedium : Theme.borderLight;

                return (
                  <tr key={item.key} style={{ backgroundColor: groupWash }}>
                    <td
                      style={{
                        padding: isSplit
                          ? '5px 12px 5px 28px'
                          : isRevised
                            ? '8px 12px 12px 28px'
                            : prev?.rowRole === 'revised'
                              ? '16px 12px 10px'
                              : '12px 12px 10px',
                        borderBottom: `1px solid ${borderColor}`,
                        verticalAlign: 'middle',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: isSplit ? 400 : 600,
                          color: isSplit ? Theme.textRouteCard : Theme.textPrimaryDark,
                          fontSize: isSplit ? 12.5 : 13.5,
                          lineHeight: 1.4,
                          letterSpacing: isSplit ? 0 : '-0.01em',
                        }}
                      >
                        {item.route}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: isSplit || isRevised ? '5px 12px' : '12px',
                        borderBottom: `1px solid ${borderColor}`,
                        verticalAlign: 'middle',
                      }}
                    >
                      <ReferenceCell item={item} label={referenceLabel(item)} />
                    </td>
                    <td
                      style={{
                        padding: isSplit || isRevised ? '5px 12px' : '12px',
                        borderBottom: `1px solid ${borderColor}`,
                        verticalAlign: 'middle',
                        ...amountStyle({
                          fontWeight: isRevised || item.rowRole === 'freight' ? 600 : 500,
                          fontSize: isSplit ? 12.5 : 13.5,
                          color:
                            item.splitKind === 'cn'
                              ? Theme.negative
                              : item.splitKind === 'dn'
                                ? Theme.positive
                                : Theme.textPrimaryDark,
                        }),
                      }}
                    >
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div
            style={{
              marginTop: 28,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 280px',
              gap: 28,
              alignItems: 'start',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div>
              {invoiceData.bankDetailsLines.length > 0 ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={labelStyle()}>Bank transfer</div>
                  {invoiceData.bankDetailsLines.map((line, idx) => (
                    <div
                      key={`bank-${idx}`}
                      style={{ fontSize: 12, color: Theme.textRouteCard, marginTop: idx === 0 ? 8 : 3, lineHeight: 1.5 }}
                    >
                      {line}
                    </div>
                  ))}
                </div>
              ) : null}
              {invoiceData.paymentTerms ? (
                <div style={{ fontSize: 12, color: Theme.textPrimaryDark, lineHeight: 1.5 }}>
                  <span style={{ color: Theme.textMuted }}>Payment terms · </span>
                  {invoiceData.paymentTerms}
                </div>
              ) : null}
              {invoiceData.notes ? (
                <div style={{ marginTop: 6, fontSize: 12, color: Theme.textRouteCard, lineHeight: 1.5 }}>
                  {invoiceData.notes}
                </div>
              ) : null}
              <div style={{ marginTop: 12, fontSize: 11, color: Theme.textMuted, lineHeight: 1.5 }}>
                This is a draft preview. An invoice number is assigned on issue.
              </div>
            </div>
            <div>
              {invoiceData.taxWarning ? (
                <div style={{ marginBottom: 12, fontSize: 12, color: Theme.warning, lineHeight: 1.4 }}>
                  {invoiceData.taxWarning}
                </div>
              ) : null}
              {invoiceData.taxRows.map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 16,
                    marginBottom: 8,
                    fontSize: 12.5,
                    color: Theme.textRouteCard,
                  }}
                >
                  <span>{row.label}</span>
                  <span style={amountStyle({ color: Theme.textPrimaryDark, fontWeight: 500 })}>
                    {row.value}
                  </span>
                </div>
              ))}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 16,
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: `1px solid ${Theme.textPrimaryDark}`,
                  fontSize: 14,
                  fontWeight: 600,
                  color: Theme.textPrimaryDark,
                }}
              >
                <span>Total</span>
                <span style={amountStyle({ fontWeight: 600 })}>
                  {formatCurrency(invoiceData.grandTotal)}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 28,
              paddingTop: 12,
              borderTop: `1px solid ${Theme.borderLight}`,
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: Theme.textMuted,
              display: 'flex',
              justifyContent: 'space-between',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <span>Draft — not an issued invoice</span>
            <span>Page 1 of 1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function segmentStyle(active: boolean): React.CSSProperties {
  return {
    backgroundColor: active ? Theme.screenBackground : 'transparent',
    color: active ? Theme.textPrimaryDark : Theme.textRouteCard,
    padding: '8px 14px',
    border: 'none',
    borderRadius: 999,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    minHeight: 36,
    boxShadow: active ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
    fontFamily: font,
  };
}

function thStyle(align: 'left' | 'right'): React.CSSProperties {
  return {
    padding: '10px 12px',
    borderBottom: `1px solid ${Theme.borderMedium}`,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: Theme.textMuted,
    textAlign: align,
  };
}

function ReferenceCell({
  item,
  label,
}: {
  item: InvoicePdfTableRow;
  label: string;
}) {
  if (item.rowRole === 'split' && (item.splitKind === 'cn' || item.splitKind === 'dn')) {
    const isCn = item.splitKind === 'cn';
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 32,
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          backgroundColor: isCn ? Theme.brandBlueWashSubtle : Theme.positiveMuted,
          color: isCn ? Theme.primary : Theme.positive,
        }}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 11.5,
        color: Theme.textMuted,
        letterSpacing: item.rowRole === 'freight' ? '0.01em' : 0,
      }}
    >
      {label}
    </span>
  );
}
