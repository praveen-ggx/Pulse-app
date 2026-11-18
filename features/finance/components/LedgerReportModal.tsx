/**
 * Ledger report preview: table of transactions with Print, Share (WhatsApp), and Download.
 * Shown when user taps Report icon on Treasury or entity detail.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
// expo-file-system SDK 54 moved writeAsStringAsync/cacheDirectory to the legacy entry.
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Share,
  Alert,
  Linking,
  Platform,
  Pressable,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DateRangePickerModal } from '@/components/DateRangePickerModal';
import { PulseBrandMark } from '@/components/brand/PulseBrandMark';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { PULSE_METRONIC } from '@/features/business-pulse/components/pulseEnterpriseStyles';
import { prependPulseExcelBanner } from '@/lib/reportWatermark.util';
import { buildPulseIntelligenceReportHtml } from '@/lib/pulseReportPrint.util';
import { printHtmlOnWeb, runAfterOverlayCloses } from '@/lib/webPrint.util';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTripOperationalDisplay } from "@/features/operations/display";
import type { LedgerRow } from '../services/finance.service';
import {
  applyLedgerReportView,
  columnValueCounts,
  EMPTY_LEDGER_REPORT_VIEW,
  ledgerReportViewIsActive,
  pickReportStatusFacet,
  uniqueColumnValues,
  type LedgerReportViewState,
  type ReportRow,
} from '../lib/ledgerReportTable.util';

function formatAmount(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

function formatDate(s: string): string {
  if (!s) return '—';
  const d = s.slice(0, 10);
  const [y, m, day] = d.split('-');
  const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  return `${day} ${months[Number(m) - 1]} ${y}`;
}

function sortLedgerRowsByDate(rows: LedgerRow[]): LedgerRow[] {
  return [...rows].sort((a, b) => {
    const dateA = a.transaction_date || a.created_at || '';
    const dateB = b.transaction_date || b.created_at || '';
    const dateCmp = dateB.localeCompare(dateA);
    if (dateCmp !== 0) return dateCmp;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });
}

function getOperationalRef(row: LedgerRow): string {
  const tripRef = getTripOperationalDisplay({
    trip_operational_code: row.trips?.trip_operational_code ?? null,
    trip_code: row.trips?.trip_code ?? null,
    display_trip_id: row.trips?.["display_trip_id"] ?? null,
    trip_number: row["trip_number"] ?? null,
  });
  return tripRef !== "—" ? tripRef : row.description || "—";
}

function ledgerToCsv(rows: LedgerRow[]): string {
  const header = 'Party,Description,Trip/Ref,Date,Amount In,Amount Out';
  const totalIn = rows.reduce((s, r) => s + (r.amount_in ?? 0), 0);
  const totalOut = rows.reduce((s, r) => s + (r.amount_out ?? 0), 0);
  const escape = (v: string) => (v.includes(',') || v.includes('"') ? `"${String(v).replace(/"/g, '""')}"` : v);
  const lines = [
    header,
    ...rows.map((r) =>
      [
        escape(r.party_name ?? ''),
        escape(r.description ?? ''),
        escape(getOperationalRef(r)),
        (r.transaction_date ?? '').slice(0, 10),
        r.amount_in ?? 0,
        r.amount_out ?? 0,
      ].join(',')
    ),
    '',
    `Total Received,${totalIn}`,
    `Total Paid,${totalOut}`,
  ];
  return lines.join('\n');
}

function ledgerToPlainText(rows: LedgerRow[], totalIn: number, totalOut: number): string {
  const lines = [
    'LEDGER REPORT',
    '—',
    'Party | Ref | Date | In | Out',
    ...rows.map((r) =>
      [
        (r.party_name ?? '—').replace(/\|/g, ' '),
        getOperationalRef(r).replace(/\|/g, ' '),
        (r.transaction_date ?? '').slice(0, 10),
        (r.amount_in ?? 0) > 0 ? formatAmount(r.amount_in!) : '—',
        (r.amount_out ?? 0) > 0 ? formatAmount(r.amount_out!) : '—',
      ].join(' | ')
    ),
    '—',
    `Total Received: ${formatAmount(totalIn)}`,
    `Total Paid: ${formatAmount(totalOut)}`,
  ];
  return lines.join('\n');
}

function ledgerToHtml(
  rows: LedgerRow[],
  totalIn: number,
  totalOut: number,
  reportTitle = 'Ledger Report',
  dateRangeLabel?: string,
): string {
  return buildPulseIntelligenceReportHtml({
    title: reportTitle,
    dateRangeLabel,
    summaryCards: [
      { label: 'Received', value: formatAmount(totalIn), tone: 'in' },
      { label: 'Paid', value: formatAmount(totalOut), tone: 'out' },
      {
        label: 'Net',
        value: formatAmount(Math.abs(totalIn - totalOut)),
        tone: totalIn >= totalOut ? 'in' : 'out',
      },
    ],
    columns: [
      { key: 'party', label: 'Party', width: '26%' },
      { key: 'ref', label: 'Ref / Trip', width: '30%' },
      { key: 'date', label: 'Date', width: '14%' },
      { key: 'in', label: 'In', align: 'right', width: '15%' },
      { key: 'out', label: 'Out', align: 'right', width: '15%' },
    ],
    rows: rows.map((r) => ({
      party: r.party_name ?? '—',
      ref: getOperationalRef(r),
      date: formatDate(r.transaction_date ?? r.created_at ?? ''),
      in: (r.amount_in ?? 0) > 0 ? formatAmount(r.amount_in!) : '—',
      out: (r.amount_out ?? 0) > 0 ? formatAmount(r.amount_out!) : '—',
    })),
  });
}

function buildLedgerWorkbook(
  rows: LedgerRow[],
  totalIn: number,
  totalOut: number,
  periodLabel?: string,
): XLSX.WorkBook {
  const sheetRows = prependPulseExcelBanner(
    [
      ['Party', 'Description', 'Trip/Ref', 'Date', 'Amount In', 'Amount Out'],
      ...rows.map((r) => [
        r.party_name ?? '',
        r.description ?? '',
        getOperationalRef(r),
        (r.transaction_date ?? '').slice(0, 10),
        r.amount_in ?? 0,
        r.amount_out ?? 0,
      ]),
      [],
      ['Total Received', '', '', '', totalIn, ''],
      ['Total Paid', '', '', '', '', totalOut],
    ],
    periodLabel ?? 'Ledger report',
  );
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ledger Report');
  return workbook;
}

function triggerWebDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

const TABLE_HPAD = Layout.screenPaddingHorizontal;
const COLUMN_GAP = 10;

function parseReportTitle(title: string): { primary: string; secondary?: string } {
  const sep = ' — ';
  const idx = title.indexOf(sep);
  if (idx === -1) return { primary: title };
  return {
    primary: title.slice(0, idx).trim(),
    secondary: title.slice(idx + sep.length).trim(),
  };
}

function getCustomColumnWidth(key: string, label?: string): number {
  switch (key) {
    case 'entity': return 176;
    case 'rowType': return 64;
    case 'trips': return 56;
    case 'trip': return 118;
    case 'party': return 156;
    case 'salesValue':
    case 'supplierCost':
    case 'pendingRecv':
    case 'pendingPay':
    case 'txnIn':
    case 'txnOut':
      return 100;
    case 'txnMode': return 92;
    case 'reference': return 148;
    case 'route': return 232;
    case 'model': return 96;
    case 'supplier': return 176;
    case 'client': return 156;
    case 'mission': return 92;
    case 'status': return 100;
    case 'partnerNote': return 132;
    case 'sales':
    case 'cost':
    case 'paid':
    case 'received':
    case 'earned':
    case 'payables':
    case 'expense':
    case 'contract':
      return 92;
    case 'mySales':
    case 'themSales':
    case 'myReceived':
    case 'themReceived':
    case 'due':
    case 'pnl':
    case 'margin':
      return 88;
    case 'txns': return 48;
    case 'lastTxn': return 80;
    case 'settlement': return 72;
    case 'commissionBasis': return 108;
    case 'sync': return 56;
    case 'you':
    case 'partner':
      return 84;
    case 'refs': return 148;
    case 'date': return 92;
    default: {
      const text = (label && label.length > key.length ? label : key).trim();
      return Math.min(240, Math.max(120, text.length * 8 + 28));
    }
  }
}

function getCustomCellMaxLines(key: string): number {
  switch (key) {
    case 'trip':
    case 'route':
    case 'supplier':
    case 'client':
    case 'partnerNote':
    case 'refs':
    case 'commissionBasis':
      return 2;
    default:
      return 1;
  }
}

function isMoneyColumn(key: string): boolean {
  return (
    key === 'sales' ||
    key === 'salesValue' ||
    key === 'supplierCost' ||
    key === 'pendingRecv' ||
    key === 'pendingPay' ||
    key === 'txnIn' ||
    key === 'txnOut' ||
    key === 'cost' ||
    key === 'paid' ||
    key === 'received' ||
    key === 'earned' ||
    key === 'payables' ||
    key === 'expense' ||
    key === 'due' ||
    key === 'pnl' ||
    key === 'margin' ||
    key === 'contract' ||
    key === 'mySales' ||
    key === 'themSales' ||
    key === 'myReceived' ||
    key === 'themReceived' ||
    key === 'settlement'
  );
}

export interface LedgerReportModalProps {
  visible: boolean;
  onClose: () => void;
  transactions: LedgerRow[];
  /** Optional title override */
  title?: string;
  /** When true, hides Cash In / Cash Out summary (e.g. custom shared-ledger export). */
  hideCashSummary?: boolean;
  /** Inclusive calendar range shown in tiny type under the title. */
  periodLabel?: string;
  customReport?: {
    columns: Array<{
      key: string;
      label: string;
      align?: 'left' | 'right' | 'center';
    }>;
    rows: Array<Record<string, string | number | null | undefined>>;
  };
  /** Rows are still loading. The preview stays open and downloads wait. */
  preparing?: boolean;
  /** Excel file name. Defaults to a ledger-report stamp. */
  downloadFileName?: string;
}

export function LedgerReportModal({
  visible,
  onClose,
  transactions,
  title,
  hideCashSummary = false,
  periodLabel,
  customReport,
  preparing = false,
  downloadFileName,
}: LedgerReportModalProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [downloadInProgress, setDownloadInProgress] = useState(false);
  const [formatPickerVisible, setFormatPickerVisible] = useState(false);
  const [formatPickerMode, setFormatPickerMode] = useState<'download' | 'share'>('download');
  const [viewState, setViewState] = useState<LedgerReportViewState>(EMPTY_LEDGER_REPORT_VIEW);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [filterColumnKey, setFilterColumnKey] = useState<string | null>(null);
  const [filterDraftEquals, setFilterDraftEquals] = useState<string[]>([]);
  const [filterDraftContains, setFilterDraftContains] = useState('');
  const [filterValueQuery, setFilterValueQuery] = useState('');
  const displayTitle = title ?? t("ledgerReport");

  useEffect(() => {
    if (!visible) return;
    setViewState(EMPTY_LEDGER_REPORT_VIEW);
    setFilterColumnKey(null);
    setDatePickerVisible(false);
  }, [visible]);
  const sortedTransactions = useMemo(
    () => sortLedgerRowsByDate(transactions),
    [transactions],
  );
  const totalIn = sortedTransactions.reduce((s, r) => s + (r.amount_in ?? 0), 0);
  const totalOut = sortedTransactions.reduce((s, r) => s + (r.amount_out ?? 0), 0);
  const netAmount = totalIn - totalOut;
  const plainText = ledgerToPlainText(sortedTransactions, totalIn, totalOut);
  const csv = ledgerToCsv(sortedTransactions);
  const html = ledgerToHtml(sortedTransactions, totalIn, totalOut, displayTitle, periodLabel);
  const isCustomReport = !!customReport;
  const customColumns = customReport?.columns ?? [];
  const customSourceRows = customReport?.rows ?? [];
  const customColumnKeys = useMemo(
    () => customColumns.map((c) => c.key),
    [customColumns],
  );
  const statusFacet = useMemo(
    () => pickReportStatusFacet(customColumns, customSourceRows),
    [customColumns, customSourceRows],
  );
  const viewRows = useMemo(() => {
    if (!isCustomReport) return [] as ReportRow[];
    return applyLedgerReportView(
      customSourceRows,
      viewState,
      customColumnKeys,
      statusFacet?.key ?? 'status',
    );
  }, [isCustomReport, customSourceRows, viewState, customColumnKeys, statusFacet?.key]);
  const typeOptions = useMemo(
    () => columnValueCounts(customSourceRows, 'rowType'),
    [customSourceRows],
  );
  const hasTypeColumn = customColumnKeys.includes('rowType') && typeOptions.length > 1;
  const hasStatusColumn = (statusFacet?.options.length ?? 0) > 1;
  const hasDateColumn = customColumnKeys.includes('date');
  const filtersActive = ledgerReportViewIsActive(viewState);
  const dateRangeLabel =
    viewState.dateFrom && viewState.dateTo
      ? `${viewState.dateFrom} → ${viewState.dateTo}`
      : viewState.dateFrom
        ? `From ${viewState.dateFrom}`
        : viewState.dateTo
          ? `Until ${viewState.dateTo}`
          : null;
  const activePlainText = useMemo(() => {
    const periodLine = periodLabel?.trim() || null;
    if (!customReport) {
      return periodLine ? `${displayTitle}\n${periodLine}\n\n${plainText}` : plainText;
    }
    const header = customReport.columns.map((c) => c.label).join(' | ');
    const lines = viewRows.map((row) =>
      customReport.columns.map((c) => String(row[c.key] ?? '—').replace(/\|/g, ' ')).join(' | ')
    );
    return [displayTitle.toUpperCase(), periodLine, '—', header, ...lines]
      .filter((line) => line != null && line !== '')
      .join('\n');
  }, [customReport, viewRows, plainText, displayTitle, periodLabel]);
  const activeCsv = useMemo(() => {
    if (!customReport) return csv;
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = customReport.columns.map((c) => escape(c.label)).join(',');
    const rows = viewRows.map((row) =>
      customReport.columns.map((c) => escape(row[c.key] ?? '')).join(',')
    );
    return [header, ...rows].join('\n');
  }, [customReport, viewRows, csv]);
  const activeHtml = useMemo(() => {
    if (!customReport) return html;
    const colWidth = `${Math.max(8, Math.floor(100 / customReport.columns.length))}%`;
    const rangeLine = [periodLabel, dateRangeLabel].filter(Boolean).join(' · ') || undefined;
    return buildPulseIntelligenceReportHtml({
      title: displayTitle,
      dateRangeLabel: rangeLine,
      columns: customReport.columns.map((col) => ({
        key: col.key,
        label: col.label,
        align: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
        width: colWidth,
      })),
      rows: viewRows.map((row) => {
        const out: Record<string, string> = {};
        for (const col of customReport.columns) {
          const value = row[col.key];
          out[col.key] = value == null || value === '' ? '—' : String(value);
        }
        if (row.tripDate != null && String(row.tripDate).trim() !== '') {
          out.tripDate = String(row.tripDate);
        }
        return out;
      }),
      landscape: customReport.columns.length > 7,
    });
  }, [customReport, viewRows, html, displayTitle, periodLabel, dateRangeLabel]);

  const reportTitleParts = useMemo(
    () => parseReportTitle(displayTitle),
    [displayTitle],
  );

  const customTableMinWidth = useMemo(() => {
    if (!customReport) return 0;
    const columnSum = customReport.columns.reduce(
      (sum, col) => sum + getCustomColumnWidth(col.key, col.label),
      0,
    );
    const gaps = Math.max(0, customReport.columns.length - 1) * COLUMN_GAP;
    return columnSum + gaps + TABLE_HPAD * 2;
  }, [customReport]);

  const customTableWidth = Math.max(customTableMinWidth, windowWidth);
  const showScrollHint =
    isCustomReport &&
    customReport &&
    (customReport.columns.length > 4 || customTableMinWidth > windowWidth);
  const recordCountLabel = isCustomReport
    ? filtersActive
      ? `${viewRows.length} of ${customSourceRows.length} ${customSourceRows.length === 1 ? 'record' : 'records'}`
      : `${viewRows.length} ${viewRows.length === 1 ? 'record' : 'records'}`
    : `${sortedTransactions.length} ${sortedTransactions.length === 1 ? 'entry' : 'entries'}`;

  const getCustomValueColor = (key: string, value: string): string | undefined => {
    const v = value.trim();
    const isDashOrZero =
      v === '—' ||
      v === '₹0' ||
      v === '₹ 0' ||
      v === '-₹0' ||
      v === '0' ||
      v === '0.0%';
    if (key === 'sync') return v === 'Fix' ? Theme.teslaRed : Theme.darkGreen;
    if (key === 'due') return isDashOrZero ? Theme.darkGreen : Theme.teslaRed;
    if (key === 'pnl') {
      if (isDashOrZero) return Theme.textMuted;
      return v.startsWith('-') ? Theme.teslaRed : Theme.darkGreen;
    }
    if (
      key === 'margin' ||
      key === 'received' ||
      key === 'paid' ||
      key === 'pendingRecv' ||
      key === 'pendingPay' ||
      key === 'txnIn' ||
      key === 'txnOut' ||
      key === 'settlement'
    ) {
      return v.startsWith('-') ? Theme.teslaRed : Theme.darkGreen;
    }
    return undefined;
  };

  const toggleSort = (key: string) => {
    setViewState((prev) => {
      if (prev.sortKey !== key) return { ...prev, sortKey: key, sortDir: 'asc' };
      if (prev.sortDir === 'asc') return { ...prev, sortDir: 'desc' };
      return { ...prev, sortKey: null, sortDir: 'asc' };
    });
  };

  const toggleChip = (field: 'typeValues' | 'statusValues', value: string) => {
    setViewState((prev) => {
      const current = prev[field];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [field]: next };
    });
  };

  const columnHasFilter = (key: string) => {
    if (key === 'date' && (viewState.dateFrom || viewState.dateTo)) return true;
    if (key === 'rowType' && viewState.typeValues.length) return true;
    if (key === 'status' && viewState.statusValues.length) return true;
    if ((viewState.columnContains[key] ?? '').trim()) return true;
    return (viewState.columnEquals[key] ?? []).length > 0;
  };

  const openColumnFilter = (key: string) => {
    if (key === 'date') {
      setDatePickerVisible(true);
      return;
    }
    const all = uniqueColumnValues(customSourceRows, key);
    const currentEquals =
      key === 'rowType'
        ? viewState.typeValues
        : key === 'status'
          ? viewState.statusValues
          : (viewState.columnEquals[key] ?? []);
    setFilterDraftEquals(currentEquals.length ? currentEquals : all);
    setFilterDraftContains(viewState.columnContains[key] ?? '');
    setFilterValueQuery('');
    setFilterColumnKey(key);
  };

  const applyColumnFilter = () => {
    if (!filterColumnKey) return;
    const key = filterColumnKey;
    const all = uniqueColumnValues(customSourceRows, key);
    const equals =
      filterDraftEquals.length === all.length ? [] : filterDraftEquals;
    setViewState((prev) => {
      const columnContains = { ...prev.columnContains };
      if (filterDraftContains.trim()) columnContains[key] = filterDraftContains;
      else delete columnContains[key];
      if (key === 'rowType') {
        return { ...prev, typeValues: equals, columnContains };
      }
      if (key === 'status') {
        return { ...prev, statusValues: equals, columnContains };
      }
      const columnEquals = { ...prev.columnEquals };
      if (equals.length) columnEquals[key] = equals;
      else delete columnEquals[key];
      return { ...prev, columnEquals, columnContains };
    });
    setFilterColumnKey(null);
  };

  const filterColumnValues = filterColumnKey
    ? uniqueColumnValues(customSourceRows, filterColumnKey).filter((value) =>
        value.toLowerCase().includes(filterValueQuery.trim().toLowerCase()),
      )
    : [];

  const handlePrint = async () => {
    if (preparing || downloadInProgress) return;
    try {
      if (Platform.OS === 'web') {
        const ok = await printHtmlOnWeb(activeHtml, { title: displayTitle });
        if (!ok) {
          Alert.alert(
            'Print',
            'Could not open the print preview. Try Download PDF instead.',
          );
        }
        return;
      }
      await Print.printAsync({ html: activeHtml });
    } catch {
      Share.share({
        message: activePlainText,
        title: 'Ledger Report – Print or Save',
      }).catch(() => Alert.alert('Print', 'Use Share or Download to print from another app.'));
    }
  };

  const handleWhatsApp = () => {
    if (preparing) return;
    const url = `whatsapp://send?text=${encodeURIComponent(activePlainText)}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
      else Share.share({ message: activePlainText, title: 'Ledger Report' }).catch(() => {});
    }).catch(() => Share.share({ message: activePlainText, title: 'Ledger Report' }).catch(() => {}));
  };

  const handleShare = () => {
    if (preparing || downloadInProgress) return;
    setFormatPickerMode('share');
    setFormatPickerVisible(true);
  };

  const handlePdfAction = async (mode: 'download' | 'share') => {
    if (preparing || downloadInProgress) return;
    setDownloadInProgress(true);
    try {
      if (Platform.OS === 'web') {
        const ok = await printHtmlOnWeb(activeHtml, { title: displayTitle });
        if (!ok) {
          Alert.alert(
            'PDF unavailable',
            'Could not open the print preview. Check pop-up blockers or try Print from the toolbar.',
          );
          return;
        }
        if (mode === 'share') {
          Alert.alert(
            'Share PDF',
            'In the print dialog, choose Save as PDF, then attach the file in your email or chat app.',
          );
        }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html: activeHtml });
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save or share ledger report PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Share.share({
          url: uri,
          title: 'Ledger Report',
          message: 'Save or share the ledger report PDF.',
        });
      }
    } catch {
      try {
        await Share.share({
          message: activeCsv,
          title: 'Ledger Report',
        });
      } catch {
        Alert.alert(
          'PDF unavailable',
          'Could not generate PDF. You can use Share above to save the report as text.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setDownloadInProgress(false);
    }
  };

  const handleExcelAction = async (mode: 'download' | 'share') => {
    if (preparing || downloadInProgress) return;
    setDownloadInProgress(true);
    const excelSubtitle = periodLabel
      ? `${displayTitle} · ${periodLabel}`
      : displayTitle;
    try {
      if (Platform.OS === 'web') {
        const workbook = isCustomReport
          ? (() => {
              const ws = XLSX.utils.aoa_to_sheet(
                prependPulseExcelBanner(
                  [
                    customReport!.columns.map((c) => c.label),
                    ...viewRows.map((row) =>
                      customReport!.columns.map((c) => row[c.key] ?? ''),
                    ),
                  ],
                  excelSubtitle,
                ),
              );
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'Report');
              return wb;
            })()
          : buildLedgerWorkbook(sortedTransactions, totalIn, totalOut, periodLabel);
        const arrayBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob(
          [arrayBuffer],
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        );
        triggerWebDownload(
          blob,
          downloadFileName?.trim() || `ledger-report-${Date.now()}.xlsx`,
        );
        if (mode === 'share') {
          Alert.alert('Share Excel', 'Excel has been downloaded. Attach it in your email app.');
        }
        return;
      }
      const cacheDirectory = (FileSystem as { cacheDirectory?: string }).cacheDirectory;
      if (!cacheDirectory) throw new Error('No cache directory available');
      const workbook = isCustomReport
        ? (() => {
            const ws = XLSX.utils.aoa_to_sheet(
              prependPulseExcelBanner(
                [
                  customReport!.columns.map((c) => c.label),
                  ...viewRows.map((row) =>
                    customReport!.columns.map((c) => row[c.key] ?? ''),
                  ),
                ],
                excelSubtitle,
              ),
            );
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Report');
            return wb;
          })()
        : buildLedgerWorkbook(sortedTransactions, totalIn, totalOut, periodLabel);
      const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const uri = `${cacheDirectory}${downloadFileName?.trim() || `ledger-report-${Date.now()}.xlsx`}`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Save or share ledger report Excel',
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
        });
      } else {
        await Share.share({
          url: uri,
          title: 'Ledger Report',
          message: 'Save or share the ledger report Excel file.',
        });
      }
    } catch {
      try {
        await Share.share({
          message: activeCsv,
          title: 'Ledger Report.csv',
        });
      } catch {
        Alert.alert(
          'Excel unavailable',
          'Could not generate Excel. You can use Share above to save the report as text.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setDownloadInProgress(false);
    }
  };

  const handleDownload = () => {
    if (preparing) return;
    if (downloadInProgress) return;
    setFormatPickerMode('download');
    setFormatPickerVisible(true);
  };

  const handleSelectPdf = () => {
    const mode = formatPickerMode;
    setFormatPickerVisible(false);
    runAfterOverlayCloses(() => {
      void handlePdfAction(mode);
    });
  };

  const handleSelectExcel = () => {
    const mode = formatPickerMode;
    setFormatPickerVisible(false);
    runAfterOverlayCloses(() => {
      void handleExcelAction(mode);
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, styles.overlayFull]}>
        <View style={[styles.sheet, styles.sheetLight, styles.sheetFull]}>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <View style={styles.headerTitleRow}>
              <View style={styles.previewMetaRow}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {reportTitleParts.primary}
                </Text>
                <View style={styles.recordCountPill}>
                  <Text style={styles.recordCountPillText}>{recordCountLabel}</Text>
                </View>
              </View>
              {periodLabel ? (
                <Text style={styles.headerPeriod} numberOfLines={1}>
                  {periodLabel}
                </Text>
              ) : null}
              {reportTitleParts.secondary ? (
                <Text style={styles.headerReportKind} numberOfLines={1}>
                  {reportTitleParts.secondary}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <FontAwesome name="times" size={14} color={PULSE_METRONIC.text} />
            </TouchableOpacity>
          </View>
          {!hideCashSummary ? (
            <View style={styles.summaryRow}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>{t("cashIn")}</Text>
                <Text style={[styles.summaryValue, styles.positive]}>{formatAmount(totalIn)}</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>{t("cashOut")}</Text>
                <Text style={[styles.summaryValue, styles.negative]}>{formatAmount(totalOut)}</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Net balance</Text>
                <Text style={[styles.summaryValue, netAmount >= 0 ? styles.positive : styles.negative]}>
                  {formatAmount(Math.abs(netAmount))}
                </Text>
              </View>
            </View>
          ) : null}

          {isCustomReport ? (
            <View style={styles.filterDock}>
              <View style={styles.filterBar}>
                <View style={styles.filterSearchWrap}>
                  <FontAwesome name="search" size={11} color={PULSE_METRONIC.muted} />
                  <TextInput
                    value={viewState.search}
                    onChangeText={(search) => setViewState((prev) => ({ ...prev, search }))}
                    placeholder="Search table"
                    placeholderTextColor={PULSE_METRONIC.muted}
                    style={[
                      styles.filterSearchInput,
                      Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                    ]}
                  />
                </View>
                {hasDateColumn ? (
                  <TouchableOpacity
                    style={[styles.filterChip, (viewState.dateFrom || viewState.dateTo) && styles.filterChipOn]}
                    onPress={() => setDatePickerVisible(true)}
                  >
                    <FontAwesome name="calendar" size={11} color={PULSE_METRONIC.text} />
                    <Text style={styles.filterChipText} numberOfLines={1}>
                      {dateRangeLabel ?? 'Dates'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {filtersActive ? (
                  <TouchableOpacity
                    style={styles.filterClearBtn}
                    onPress={() => setViewState(EMPTY_LEDGER_REPORT_VIEW)}
                  >
                    <Text style={styles.filterClearText}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
                {showScrollHint ? (
                  <Text style={styles.scrollHintInline}>Scroll →</Text>
                ) : null}
              </View>
              {hasTypeColumn || hasStatusColumn ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.filterStrip}
                  contentContainerStyle={styles.filterStripContent}
                >
                  {hasTypeColumn && typeOptions.length > 0 ? (
                    <View style={styles.filterGroup}>
                      <Text style={styles.filterChipRowLabel}>Type</Text>
                      <TouchableOpacity
                        style={[styles.filterChip, viewState.typeValues.length === 0 && styles.filterChipOn]}
                        onPress={() => setViewState((prev) => ({ ...prev, typeValues: [] }))}
                      >
                        <Text style={styles.filterChipText}>All {customSourceRows.length}</Text>
                      </TouchableOpacity>
                      {typeOptions.map((option) => {
                        const on = viewState.typeValues.includes(option.value);
                        return (
                          <TouchableOpacity
                            key={`type-${option.value}`}
                            style={[styles.filterChip, on && styles.filterChipOn]}
                            onPress={() => toggleChip('typeValues', option.value)}
                          >
                            <Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>
                              {option.value} {option.count}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}
                  {hasTypeColumn && hasStatusColumn ? <View style={styles.filterGroupRule} /> : null}
                  {hasStatusColumn && statusFacet ? (
                    <View style={styles.filterGroup}>
                      <Text style={styles.filterChipRowLabel}>{statusFacet.label}</Text>
                      <TouchableOpacity
                        style={[styles.filterChip, viewState.statusValues.length === 0 && styles.filterChipOn]}
                        onPress={() => setViewState((prev) => ({ ...prev, statusValues: [] }))}
                      >
                        <Text style={styles.filterChipText}>All {customSourceRows.length}</Text>
                      </TouchableOpacity>
                      {statusFacet.options.map((option) => {
                        const on = viewState.statusValues.includes(option.value);
                        return (
                          <TouchableOpacity
                            key={`status-${option.value}`}
                            style={[styles.filterChip, on && styles.filterChipOn]}
                            onPress={() => toggleChip('statusValues', option.value)}
                          >
                            <Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>
                              {option.value} {option.count}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}
                </ScrollView>
              ) : null}
            </View>
          ) : null}

          <View style={styles.previewCanvas}>
          {preparing ? (
            <View style={styles.preparingPane}>
              <LoadingIndicator size="small" color={PULSE_METRONIC.text} />
              <Text style={styles.preparingText}>Preparing the report…</Text>
            </View>
          ) : null}
          {!preparing && !isCustomReport ? (
            <View style={[styles.tableHeader, styles.ledgerTableHeader]}>
              <Text style={[styles.th, styles.thEntity]}>Party / ref</Text>
              <Text style={[styles.th, styles.thDate]}>Date</Text>
              <Text style={[styles.th, styles.thNumLedger]}>{t("cashIn")}</Text>
              <Text style={[styles.th, styles.thNumLedger]}>{t("cashOut")}</Text>
            </View>
          ) : null}

          {!preparing && isCustomReport ? (
            <View style={styles.customTableShell}>
              <ScrollView
                horizontal
                style={styles.customTableScroll}
                showsHorizontalScrollIndicator
                contentContainerStyle={styles.customTableScrollContent}
              >
                <View style={[styles.customTablePane, { width: customTableWidth }]}>
                  <View style={[styles.tableHeader, styles.customTableHeader]}>
                    {customReport!.columns.map((col) => {
                      const sorted = viewState.sortKey === col.key;
                      const filtered = columnHasFilter(col.key);
                      return (
                        <View
                          key={`hdr-${col.key}`}
                          style={[
                            styles.thFixed,
                            {
                              width: getCustomColumnWidth(col.key, col.label),
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent:
                                col.align === 'right'
                                  ? 'flex-end'
                                  : col.align === 'center'
                                    ? 'center'
                                    : 'flex-start',
                              gap: 4,
                            },
                          ]}
                        >
                          <TouchableOpacity
                            onPress={() => toggleSort(col.key)}
                            hitSlop={8}
                            style={styles.thSortHit}
                          >
                            <Text
                              style={[
                                styles.th,
                                col.align === 'right' ? styles.thNum : undefined,
                                sorted && styles.thSorted,
                                {
                                  textAlign:
                                    col.align === 'right'
                                      ? 'right'
                                      : col.align === 'center'
                                        ? 'center'
                                        : 'left',
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {col.label}
                            </Text>
                            <FontAwesome
                              name={
                                sorted
                                  ? viewState.sortDir === 'asc'
                                    ? 'caret-up'
                                    : 'caret-down'
                                  : 'sort'
                              }
                              size={sorted ? 11 : 9}
                              color={sorted ? PULSE_METRONIC.text : PULSE_METRONIC.muted}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => openColumnFilter(col.key)} hitSlop={8}>
                            <FontAwesome
                              name="filter"
                              size={10}
                              color={filtered ? Theme.primary : PULSE_METRONIC.muted}
                            />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>

                  <ScrollView
                    style={styles.list}
                    nestedScrollEnabled
                    contentContainerStyle={[
                      styles.listContent,
                      viewRows.length === 0 && styles.listContentEmpty,
                    ]}
                    showsVerticalScrollIndicator
                  >
                    {viewRows.length === 0 ? (
                      <Text style={styles.empty}>{t("noLedgerEntries")}</Text>
                    ) : (
                      viewRows.map((row, idx) => (
                        <View
                          key={`custom-row-${idx}`}
                          style={[styles.row, styles.customDataRow, idx % 2 === 1 && styles.altRow]}
                        >
                          {customReport!.columns.map((col) => {
                            const raw =
                              row[col.key] == null ? '—' : String(row[col.key]);
                            const valueColor =
                              getCustomValueColor(col.key, raw) ?? PULSE_METRONIC.text;
                            const money = isMoneyColumn(col.key);
                            const tripDate =
                              col.key === 'trip'
                                ? String(row.tripDate ?? '').trim()
                                : '';
                            const cellStyle = [
                              styles.cellFixed,
                              money ? styles.cellMoney : undefined,
                              col.align === 'right' ? styles.cellNum : undefined,
                              {
                                width: getCustomColumnWidth(col.key, col.label),
                                textAlign:
                                  (col.align === 'right'
                                    ? 'right'
                                    : col.align === 'center'
                                      ? 'center'
                                      : 'left') as 'left' | 'center' | 'right',
                                color: valueColor,
                              },
                            ];
                            if (col.key === 'trip' && tripDate && tripDate !== '—') {
                              return (
                                <View
                                  key={`${idx}-${col.key}`}
                                  style={{ width: getCustomColumnWidth(col.key, col.label) }}
                                >
                                  <Text
                                    style={cellStyle}
                                    numberOfLines={getCustomCellMaxLines(col.key)}
                                  >
                                    {raw}
                                  </Text>
                                  <Text style={styles.tripDateSub} numberOfLines={1}>
                                    {tripDate}
                                  </Text>
                                </View>
                              );
                            }
                            return (
                              <Text
                                key={`${idx}-${col.key}`}
                                style={cellStyle}
                                numberOfLines={getCustomCellMaxLines(col.key)}
                              >
                                {raw}
                              </Text>
                            );
                          })}
                        </View>
                      ))
                    )}
                  </ScrollView>
                </View>
              </ScrollView>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={[
                styles.listContent,
                sortedTransactions.length === 0 && styles.listContentEmpty,
              ]}
              showsVerticalScrollIndicator={true}
            >
              {sortedTransactions.length === 0 ? (
                <Text style={styles.empty}>{t("noLedgerEntries")}</Text>
              ) : (
                sortedTransactions.map((row, idx) => (
                  <View key={row.id} style={[styles.row, styles.ledgerDataRow, idx % 2 === 1 && styles.altRow]}>
                    <View style={styles.cellEntity}>
                      <Text style={styles.entityName} numberOfLines={1}>{row.party_name}</Text>
                      <Text style={styles.entityDesc} numberOfLines={2}>
                        {getOperationalRef(row)}
                      </Text>
                    </View>
                    <Text style={styles.cellDate}>{formatDate(row.transaction_date)}</Text>
                    <Text style={[styles.cellNum, styles.cellNumLedger, styles.positive]}>
                      {(row.amount_in ?? 0) > 0 ? formatAmount(row.amount_in!) : '—'}
                    </Text>
                    <Text style={[styles.cellNum, styles.cellNumLedger, styles.negative]}>
                      {(row.amount_out ?? 0) > 0 ? formatAmount(row.amount_out!) : '—'}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          )}
            <View
              pointerEvents="none"
              style={styles.previewWatermarkLayer}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={styles.previewWatermarkMark}>
                <PulseBrandMark
                  size="display"
                  textStyle={styles.previewWatermarkText}
                />
              </View>
            </View>
          </View>

          <View style={[styles.actionBar, { paddingBottom: Math.max(8, insets.bottom) }]}>
            <TouchableOpacity
              style={[styles.actionBtn, preparing && styles.actionBtnDisabled]}
              onPress={handlePrint}
              disabled={preparing}
              activeOpacity={0.85}
            >
              <FontAwesome name="print" size={13} color={PULSE_METRONIC.text} />
              <Text style={styles.actionBtnText}>Print</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, preparing && styles.actionBtnDisabled]}
              onPress={handleWhatsApp}
              disabled={preparing}
              activeOpacity={0.85}
            >
              <FontAwesome name="whatsapp" size={14} color={PULSE_METRONIC.text} />
              <Text style={styles.actionBtnText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, preparing && styles.actionBtnDisabled]}
              onPress={handleShare}
              disabled={preparing}
              activeOpacity={0.85}
            >
              <FontAwesome name="share-alt" size={13} color={PULSE_METRONIC.text} />
              <Text style={styles.actionBtnText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, (downloadInProgress || preparing) && styles.actionBtnDisabled]}
              onPress={handleDownload}
              disabled={downloadInProgress || preparing}
              activeOpacity={0.85}
            >
              {downloadInProgress ? (
                <LoadingIndicator size="small" color={PULSE_METRONIC.text} />
              ) : (
                <FontAwesome name="download" size={13} color={PULSE_METRONIC.text} />
              )}
              <Text style={styles.actionBtnText}>
                {downloadInProgress ? 'Generating…' : 'Download'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <DateRangePickerModal
        visible={datePickerVisible}
        initialFrom={viewState.dateFrom}
        initialTo={viewState.dateTo}
        onDismiss={() => setDatePickerVisible(false)}
        onApply={(from, to) => {
          setViewState((prev) => ({ ...prev, dateFrom: from, dateTo: to }));
          setDatePickerVisible(false);
        }}
        onClear={() => {
          setViewState((prev) => ({ ...prev, dateFrom: null, dateTo: null }));
          setDatePickerVisible(false);
        }}
      />
      <Modal
        visible={filterColumnKey != null}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterColumnKey(null)}
      >
        <Pressable
          style={[styles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          onPress={() => setFilterColumnKey(null)}
        >
          <Pressable
            style={styles.columnFilterCard}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.downloadModalTitle}>
              Filter {customColumns.find((c) => c.key === filterColumnKey)?.label ?? ''}
            </Text>
            <TextInput
              value={filterDraftContains}
              onChangeText={setFilterDraftContains}
              placeholder="Contains text"
              placeholderTextColor={PULSE_METRONIC.muted}
              style={styles.columnFilterInput}
            />
            <TextInput
              value={filterValueQuery}
              onChangeText={setFilterValueQuery}
              placeholder="Find value"
              placeholderTextColor={PULSE_METRONIC.muted}
              style={styles.columnFilterInput}
            />
            <View style={styles.columnFilterSelectRow}>
              <TouchableOpacity
                onPress={() =>
                  setFilterDraftEquals(uniqueColumnValues(customSourceRows, filterColumnKey ?? ''))
                }
              >
                <Text style={styles.columnFilterLink}>Select all</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFilterDraftEquals([])}>
                <Text style={styles.columnFilterLink}>Clear</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.columnFilterList} nestedScrollEnabled>
              {filterColumnValues.map((value) => {
                const checked = filterDraftEquals.includes(value);
                return (
                  <TouchableOpacity
                    key={value}
                    style={styles.columnFilterOption}
                    onPress={() =>
                      setFilterDraftEquals((prev) =>
                        prev.includes(value)
                          ? prev.filter((v) => v !== value)
                          : [...prev, value],
                      )
                    }
                  >
                    <FontAwesome
                      name={checked ? 'check-square-o' : 'square-o'}
                      size={16}
                      color={checked ? Theme.primary : PULSE_METRONIC.muted}
                    />
                    <Text style={styles.columnFilterOptionText} numberOfLines={2}>
                      {value}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.columnFilterApply} onPress={applyColumnFilter}>
              <Text style={styles.columnFilterApplyText}>Apply</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={formatPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFormatPickerVisible(false)}
      >
        <Pressable
          style={[styles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          onPress={() => setFormatPickerVisible(false)}
        >
          <Pressable
            style={styles.downloadModalCard}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.downloadModalTitle}>
              {formatPickerMode === 'share' ? 'Share format' : 'Download format'}
            </Text>
            <Text style={styles.downloadModalSubtitle}>
              {formatPickerMode === 'share'
                ? 'Choose file format to share'
                : 'Choose your preferred report file type'}
            </Text>
            <View style={styles.downloadFormatRow}>
              <TouchableOpacity
                style={styles.downloadFormatTile}
                onPress={handleSelectPdf}
                activeOpacity={0.85}
              >
                <FontAwesome name="file-pdf-o" size={22} color={Theme.teslaRed} />
                <Text style={styles.downloadFormatTileTitle}>PDF</Text>
                <Text style={styles.downloadFormatTileHint}>
                  {formatPickerMode === 'share' ? 'Share document' : 'Download PDF'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.downloadFormatTile}
                onPress={handleSelectExcel}
                activeOpacity={0.85}
              >
                <FontAwesome name="file-excel-o" size={22} color={Theme.darkGreen} />
                <Text style={styles.downloadFormatTileTitle}>Excel</Text>
                <Text style={styles.downloadFormatTileHint}>
                  {formatPickerMode === 'share' ? 'Share spreadsheet' : 'Download .xlsx'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.downloadOption, styles.downloadCancelOption]}
              onPress={() => setFormatPickerVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.downloadOptionText, styles.downloadCancelOptionText]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: PULSE_METRONIC.canvas,
  },
  overlayFull: {
    justifyContent: 'flex-start',
  },
  sheet: {
    flex: 1,
    flexDirection: 'column',
  },
  sheetFull: {
    flex: 1,
  },
  sheetLight: {
    backgroundColor: PULSE_METRONIC.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: TABLE_HPAD,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_METRONIC.border,
    backgroundColor: Theme.cardWhite,
    flexGrow: 0,
    flexShrink: 0,
  },
  headerTitleRow: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PULSE_METRONIC.text,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  headerPeriod: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
    letterSpacing: 0.1,
  },
  headerReportKind: {
    fontSize: 12,
    fontWeight: '600',
    color: PULSE_METRONIC.text,
    marginTop: 2,
    letterSpacing: -0.1,
  },
  previewSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
  },
  previewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  recordCountPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#EEF3FA',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PULSE_METRONIC.border,
  },
  recordCountPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: PULSE_METRONIC.text,
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PULSE_METRONIC.border,
    borderRadius: 16,
  },
  preparingPane: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  preparingText: {
    fontSize: 13,
    color: PULSE_METRONIC.text,
  },
  actionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: TABLE_HPAD,
    paddingTop: 8,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PULSE_METRONIC.border,
    backgroundColor: Theme.cardWhite,
    flexGrow: 0,
    flexShrink: 0,
  },
  actionBtn: {
    flexGrow: 1,
    flexBasis: 132,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PULSE_METRONIC.border,
    minHeight: 40,
  },
  actionBtnDisabled: {
    opacity: 0.55,
  },
  actionIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F8FA',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: PULSE_METRONIC.text,
    letterSpacing: -0.1,
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: TABLE_HPAD,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_METRONIC.border,
    backgroundColor: '#F8FAFC',
  },
  summaryCell: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PULSE_METRONIC.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: PULSE_METRONIC.muted,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  positive: { color: Theme.darkGreen },
  negative: { color: Theme.teslaRed },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: TABLE_HPAD,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_METRONIC.border,
    backgroundColor: '#F8FAFC',
    gap: COLUMN_GAP,
  },
  customTableHeader: {
    minHeight: 36,
    alignItems: 'center',
  },
  thSortHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minWidth: 0,
    flexShrink: 1,
  },
  thSorted: {
    color: PULSE_METRONIC.text,
  },
  filterDock: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_METRONIC.border,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: TABLE_HPAD,
    paddingTop: 8,
    paddingBottom: 6,
  },
  filterSearchWrap: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F5F8FA',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PULSE_METRONIC.border,
  },
  filterSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: PULSE_METRONIC.text,
    paddingVertical: 0,
  },
  filterStrip: {
    flexGrow: 0,
    flexShrink: 0,
    height: 36,
    maxHeight: 36,
  },
  filterStripContent: {
    flexGrow: 0,
    alignItems: 'center',
    paddingHorizontal: TABLE_HPAD,
    paddingBottom: 6,
    gap: 10,
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterGroupRule: {
    width: 1,
    height: 16,
    backgroundColor: PULSE_METRONIC.border,
  },
  filterChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChipRowLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: PULSE_METRONIC.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 26,
    borderRadius: 999,
    backgroundColor: '#F5F8FA',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PULSE_METRONIC.border,
    maxWidth: 180,
  },
  filterChipOn: {
    backgroundColor: '#EEF3FA',
    borderColor: PULSE_METRONIC.text,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: PULSE_METRONIC.text,
  },
  filterChipTextOn: {
    fontWeight: '700',
  },
  filterClearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
  },
  filterClearText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.teslaRed,
  },
  scrollHintInline: {
    fontSize: 10,
    fontWeight: '600',
    color: PULSE_METRONIC.muted,
    flexShrink: 0,
  },
  columnFilterCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: Theme.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  columnFilterInput: {
    marginTop: 10,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F5F8FA',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PULSE_METRONIC.border,
    color: PULSE_METRONIC.text,
    fontSize: 13,
  },
  columnFilterSelectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 6,
  },
  columnFilterLink: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.primary,
  },
  columnFilterList: {
    maxHeight: 240,
  },
  columnFilterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    minHeight: 44,
  },
  columnFilterOptionText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: PULSE_METRONIC.text,
  },
  columnFilterApply: {
    marginTop: 12,
    backgroundColor: PULSE_METRONIC.text,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  columnFilterApplyText: {
    color: Theme.cardWhite,
    fontSize: 14,
    fontWeight: '700',
  },
  th: {
    fontSize: 10,
    fontWeight: '700',
    color: PULSE_METRONIC.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  thEntity: { flex: 1, minWidth: 0 },
  thFixed: { flexShrink: 0 },
  thDate: { width: 80, flexShrink: 0 },
  thNum: { textAlign: 'right', flexShrink: 0 },
  thNumLedger: { width: 72, textAlign: 'right', flexShrink: 0 },
  ledgerTableHeader: {
    gap: COLUMN_GAP,
  },
  customTableShell: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.cardWhite,
  },
  previewCanvas: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Theme.cardWhite,
  },
  previewWatermarkLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  previewWatermarkMark: {
    opacity: 0.08,
    transform: [{ rotate: '-22deg' }],
  },
  previewWatermarkText: {
    fontSize: 64,
    lineHeight: 72,
    fontWeight: '700',
    letterSpacing: -1.6,
  },
  scrollHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    paddingHorizontal: TABLE_HPAD,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_METRONIC.border,
    backgroundColor: '#F5F8FA',
  },
  scrollHintText: {
    fontSize: 11,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
  },
  customTableScroll: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.cardWhite,
  },
  customTableScrollContent: {
    flexGrow: 1,
  },
  customTablePane: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.cardWhite,
  },
  listContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: TABLE_HPAD,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_METRONIC.border,
    gap: COLUMN_GAP,
  },
  altRow: {
    backgroundColor: '#FCFDFE',
  },
  customDataRow: {
    alignItems: 'flex-start',
    minHeight: 36,
    paddingVertical: 7,
  },
  ledgerDataRow: {
    alignItems: 'flex-start',
    minHeight: 40,
  },
  cellEntity: { flex: 1, minWidth: 0 },
  entityName: {
    fontSize: 12,
    fontWeight: '700',
    color: PULSE_METRONIC.text,
    lineHeight: 17,
  },
  entityDesc: {
    fontSize: 11,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
    marginTop: 3,
    lineHeight: 15,
  },
  cellDate: {
    width: 80,
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
  },
  cellNum: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  cellNumLedger: {
    width: 72,
  },
  cellFixed: {
    fontSize: 11,
    fontWeight: '500',
    color: PULSE_METRONIC.text,
    flexShrink: 0,
    lineHeight: 17,
  },
  tripDateSub: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
    letterSpacing: 0.15,
    lineHeight: 12,
  },
  cellMoney: {
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    padding: 28,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    padding: 16,
    minWidth: 260,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimary,
    marginBottom: 12,
  },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  modalOptionText: {
    fontSize: 16,
    color: Theme.textPrimary,
  },
  downloadModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Theme.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  downloadModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  downloadModalSubtitle: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 4,
    marginBottom: 14,
  },
  downloadFormatRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 10,
  },
  downloadFormatTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 108,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
  },
  downloadFormatTileTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  downloadFormatTileHint: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textSecondary,
    textAlign: 'center',
  },
  downloadOption: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  downloadOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  downloadCancelOption: {
    backgroundColor: Theme.surfaceGray,
    marginBottom: 0,
  },
  downloadCancelOptionText: {
    color: Theme.textSecondary,
  },
});
