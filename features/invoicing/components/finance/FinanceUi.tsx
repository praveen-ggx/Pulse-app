/**
 * Shared pieces for the Finance books (Receivables, Ledger, Credit Notes,
 * Reconciliation, Reports). Same tokens and patterns as the invoice workspace:
 * brown active states, hairline tables with a brown header, 44pt targets.
 */
import Theme from "@/constants/Theme";
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type KeyboardTypeOptions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Below this width tables render as stacked cards (no horizontal scroll). */
export const FINANCE_COMPACT_WIDTH = 720;

/**
 * Width of the pane the books render in. The books sit beside the invoice
 * preview on desktop, so the window width is not the space a table has.
 */
const FinanceWidthContext = createContext<number | null>(null);

export function useFinanceCompact(): boolean {
  const { width: windowWidth } = useWindowDimensions();
  const paneWidth = useContext(FinanceWidthContext);
  return (paneWidth ?? windowWidth) < FINANCE_COMPACT_WIDTH;
}

export function FinancePage({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState<number | null>(null);
  return (
    <FinanceWidthContext.Provider value={width}>
      <ScrollView
        style={ui.page}
        contentContainerStyle={ui.pageContent}
        keyboardShouldPersistTaps="handled"
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          setWidth((current) => (current === next ? current : next));
        }}
      >
        {children}
      </ScrollView>
    </FinanceWidthContext.Provider>
  );
}

/** Same pane-width signal for content outside a FinancePage (sheets measure themselves). */
export function FinanceWidthScope({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState<number | null>(null);
  return (
    <FinanceWidthContext.Provider value={width}>
      <View
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          setWidth((current) => (current === next ? current : next));
        }}
      >
        {children}
      </View>
    </FinanceWidthContext.Provider>
  );
}

export function SectionTitle({ title, hint, actions }: { title: string; hint?: string | null; actions?: ReactNode }) {
  return (
    <View style={ui.titleRow}>
      <View style={ui.titleCopy}>
        <Text style={ui.title} accessibilityRole="header">{title}</Text>
        {hint ? <Text style={ui.hint}>{hint}</Text> : null}
      </View>
      {actions ? <View style={ui.titleActions}>{actions}</View> : null}
    </View>
  );
}

export function Chip({ label, active, onPress, disabled }: { label: string; active?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      style={[ui.chip, active && ui.chipOn, disabled && ui.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active), disabled: Boolean(disabled) }}
      accessibilityLabel={label}
    >
      <Text style={[ui.chipText, active && ui.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function ActionButton({
  label,
  onPress,
  kind = "primary",
  disabled,
  busy,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
}) {
  const off = Boolean(disabled || busy);
  return (
    <Pressable
      style={[ui.button, kind === "secondary" && ui.buttonSecondary, kind === "danger" && ui.buttonDanger, off && ui.disabled]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: Boolean(busy) }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {busy ? (
        <ActivityIndicator size="small" color={kind === "secondary" ? Theme.primary : Theme.buttonDarkText} />
      ) : (
        <Text style={[ui.buttonText, kind === "secondary" && ui.buttonTextSecondary]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  autoCapitalize,
  error,
  width,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  error?: string | null;
  width?: number;
}) {
  return (
    <View style={[ui.field, width ? { width } : ui.fieldGrow]}>
      <Text style={ui.fieldLabel}>{label}</Text>
      <TextInput
        style={[ui.input, multiline && ui.inputArea, error && ui.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Theme.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        accessibilityLabel={label}
      />
      {error ? <Text style={ui.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function Row({ children, wrap = true }: { children: ReactNode; wrap?: boolean }) {
  return <View style={[ui.row, wrap && ui.rowWrap]}>{children}</View>;
}

export function Card({ children, tone }: { children: ReactNode; tone?: "warning" | "danger" }) {
  return <View style={[ui.card, tone === "warning" && ui.cardWarning, tone === "danger" && ui.cardDanger]}>{children}</View>;
}

export function Note({ children, tone }: { children: ReactNode; tone?: "error" | "success" | "warning" }) {
  return (
    <Text
      style={[ui.note, tone === "error" && ui.noteError, tone === "success" && ui.noteSuccess, tone === "warning" && ui.noteWarning]}
      accessibilityLiveRegion={tone ? "polite" : undefined}
    >
      {children}
    </Text>
  );
}

export function Metric({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <View style={ui.metric}>
      <Text style={ui.metricLabel}>{label}</Text>
      <Text style={[ui.metricValue, tone === "danger" && ui.metricDanger]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function MetricRow({ children }: { children: ReactNode }) {
  return <View style={ui.metricRow}>{children}</View>;
}

export function StatusPill({ label, tone }: { label: string; tone: "ok" | "warn" | "bad" | "muted" }) {
  return (
    <View style={[ui.pill, tone === "ok" && ui.pillOk, tone === "warn" && ui.pillWarn, tone === "bad" && ui.pillBad]}>
      <Text style={[ui.pillText, tone === "ok" && ui.pillTextOk, tone === "warn" && ui.pillTextWarn, tone === "bad" && ui.pillTextBad]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Loading, error, unavailable and empty states in one place, so every book
 * reports them the same way.
 */
export function QueryState({
  loading,
  error,
  unavailable,
  empty,
  emptyText,
  onRetry,
}: {
  loading: boolean;
  error: string | null | undefined;
  unavailable?: boolean;
  empty: boolean;
  emptyText: string;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <View style={ui.state} accessibilityRole="progressbar" accessibilityLabel="Loading">
        <ActivityIndicator color={Theme.primary} />
      </View>
    );
  }
  if (unavailable) return <Note>Finance books are not available on this database yet.</Note>;
  if (error) {
    return (
      <View style={ui.stateRow}>
        <Note tone="error">{error}</Note>
        {onRetry ? <ActionButton label="Retry" kind="secondary" onPress={onRetry} /> : null}
      </View>
    );
  }
  if (empty) return <Note>{emptyText}</Note>;
  return null;
}

export function Pager({
  offset,
  pageSize,
  total,
  onChange,
  fetching,
}: {
  offset: number;
  pageSize: number;
  total: number;
  onChange: (next: number) => void;
  fetching?: boolean;
}) {
  if (total <= pageSize && offset === 0) return null;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);
  return (
    <View style={ui.pager}>
      <Text style={ui.hint}>
        {from}–{to} of {total}
        {fetching ? " · updating…" : ""}
      </Text>
      <View style={ui.row}>
        <ActionButton label="Previous" kind="secondary" disabled={offset === 0} onPress={() => onChange(Math.max(0, offset - pageSize))} />
        <ActionButton label="Next" kind="secondary" disabled={offset + pageSize >= total} onPress={() => onChange(offset + pageSize)} />
      </View>
    </View>
  );
}

export type Column<T> = {
  key: string;
  label: string;
  /** Fixed width on wide screens; omitted = flex. */
  width?: number;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  /** Text for compact cards. Defaults to render() when it returns a string. */
  compactHidden?: boolean;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onPressRow,
  selectedKey,
  rowLabel,
  rowTone,
}: {
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  onPressRow?: (row: T) => void;
  selectedKey?: string | null;
  rowLabel?: (row: T) => string;
  rowTone?: (row: T) => "muted" | null;
}) {
  const compact = useFinanceCompact();
  if (rows.length === 0) return null;
  if (compact) {
    const [lead, ...rest] = columns;
    return (
      <View style={ui.cards}>
        {rows.map((row) => {
          const key = rowKey(row);
          const on = selectedKey === key;
          const body = (
            <>
              <View style={ui.cardLead}>{cell(lead!.render(row), ui.tdStrong)}</View>
              <View style={ui.cardFacts}>
                {rest
                  .filter((column) => !column.compactHidden)
                  .map((column) => (
                    <View key={column.key} style={ui.cardFact}>
                      <Text style={ui.cardFactLabel}>{column.label}</Text>
                      {cell(column.render(row), ui.td)}
                    </View>
                  ))}
              </View>
            </>
          );
          return onPressRow ? (
            <Pressable
              key={key}
              style={[ui.rowCard, on && ui.rowOn, rowTone?.(row) === "muted" && ui.rowMuted]}
              onPress={() => onPressRow(row)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={rowLabel?.(row)}
            >
              {body}
            </Pressable>
          ) : (
            <View key={key} style={[ui.rowCard, rowTone?.(row) === "muted" && ui.rowMuted]}>{body}</View>
          );
        })}
      </View>
    );
  }
  return (
    <View style={ui.table}>
      <View style={ui.trHead}>
        {columns.map((column) => (
          <Text
            key={column.key}
            style={[ui.th, column.width ? { width: column.width } : ui.flex, column.align === "right" && ui.right]}
            numberOfLines={1}
          >
            {column.label}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => {
        const key = rowKey(row);
        const on = selectedKey === key;
        const cells = columns.map((column) => (
          <View key={column.key} style={[column.width ? { width: column.width } : ui.flex, ui.cellBox, column.align === "right" && ui.cellRight]}>
            {cell(column.render(row), [ui.td, column.align === "right" && ui.num])}
          </View>
        ));
        const style = [ui.tr, index % 2 === 1 && ui.trAlt, on && ui.rowOn, rowTone?.(row) === "muted" && ui.rowMuted];
        return onPressRow ? (
          <Pressable
            key={key}
            style={style}
            onPress={() => onPressRow(row)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={rowLabel?.(row)}
          >
            {cells}
          </Pressable>
        ) : (
          <View key={key} style={style}>{cells}</View>
        );
      })}
    </View>
  );
}

function cell(content: ReactNode, style: object | (object | false)[]) {
  if (typeof content === "string" || typeof content === "number") {
    return <Text style={style} numberOfLines={2}>{content}</Text>;
  }
  return content ?? <Text style={style}>—</Text>;
}

export function FinanceSheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[ui.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={ui.sheet}>
          <View style={ui.sheetHead}>
            <Text style={ui.title} accessibilityRole="header" numberOfLines={2}>{title}</Text>
            <Pressable style={ui.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={ui.closeText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={ui.sheetBody} keyboardShouldPersistTaps="handled">
            <FinanceWidthScope>
              <View style={ui.sheetInner}>{children}</View>
            </FinanceWidthScope>
          </ScrollView>
          {footer ? <View style={ui.sheetFoot}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

export type DateRange = { from: string | null; to: string | null };

function isoToday(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000);
  return ist.toISOString().slice(0, 10);
}

export function financialYearStart(today = isoToday()): string {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return `${m >= 4 ? y : y - 1}-04-01`;
}

export function dateRangePresets(): { key: string; label: string; range: DateRange }[] {
  const today = isoToday();
  const minus = (days: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  };
  const fy = financialYearStart(today);
  const lastFyStart = `${Number(fy.slice(0, 4)) - 1}-04-01`;
  const lastFyEnd = `${fy.slice(0, 4)}-03-31`;
  return [
    { key: "30", label: "Last 30 days", range: { from: minus(30), to: today } },
    { key: "90", label: "Last 90 days", range: { from: minus(90), to: today } },
    { key: "fy", label: "This FY", range: { from: fy, to: today } },
    { key: "lfy", label: "Last FY", range: { from: lastFyStart, to: lastFyEnd } },
    { key: "all", label: "All", range: { from: null, to: null } },
  ];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function DateRangeFields({ value, onChange }: { value: DateRange; onChange: (next: DateRange) => void }) {
  const presets = dateRangePresets();
  const active = presets.find((preset) => preset.range.from === value.from && preset.range.to === value.to)?.key ?? null;
  return (
    <View style={ui.rangeWrap}>
      <Row>
        {presets.map((preset) => (
          <Chip key={preset.key} label={preset.label} active={active === preset.key} onPress={() => onChange(preset.range)} />
        ))}
      </Row>
      <Row>
        <RangeInput label="From" value={value.from} onCommit={(from) => onChange({ ...value, from })} />
        <RangeInput label="To" value={value.to} onCommit={(to) => onChange({ ...value, to })} />
      </Row>
    </View>
  );
}

function RangeInput({ label, value, onCommit }: { label: string; value: string | null; onCommit: (next: string | null) => void }) {
  return (
    <View style={[ui.field, { width: 150 }]}>
      <Text style={ui.fieldLabel}>{label}</Text>
      <TextInput
        key={value ?? "none"}
        style={ui.input}
        defaultValue={value ?? ""}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={Theme.textMuted}
        onEndEditing={(event) => {
          const next = event.nativeEvent.text.trim();
          if (!next) onCommit(null);
          else if (ISO.test(next)) onCommit(next);
        }}
        onBlur={(event) => {
          const next = ((event as unknown as { nativeEvent?: { text?: string } }).nativeEvent?.text ?? "").trim();
          if (next && ISO.test(next) && next !== value) onCommit(next);
        }}
        accessibilityLabel={`${label} date`}
      />
    </View>
  );
}

export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: Theme.surface },
  pageContent: { padding: 16, paddingBottom: 32, gap: 14 },
  flex: { flex: 1, minWidth: 0 },
  right: { textAlign: "right" },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  titleCopy: { flex: 1, minWidth: 200, gap: 2 },
  titleActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  title: { fontSize: 15, fontWeight: "500", color: Theme.textPrimaryDark },
  hint: { fontSize: 12, fontWeight: "400", color: Theme.textMuted, lineHeight: 17 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowWrap: { flexWrap: "wrap" },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  chipText: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  chipTextOn: { color: Theme.buttonDarkText },
  button: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 8,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  buttonSecondary: { backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.primary },
  buttonDanger: { backgroundColor: Theme.teslaRed },
  buttonText: { color: Theme.buttonDarkText, fontSize: 13, fontWeight: "500" },
  buttonTextSecondary: { color: Theme.primary },
  disabled: { opacity: 0.45 },
  field: { gap: 4, minWidth: 120 },
  fieldGrow: { flexGrow: 1, flexBasis: 180 },
  fieldLabel: { fontSize: 11, fontWeight: "500", color: Theme.textSecondary },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
    fontSize: 13,
  },
  inputArea: { minHeight: 110, paddingTop: 10, textAlignVertical: "top" },
  inputError: { borderColor: Theme.teslaRed },
  fieldError: { fontSize: 11, color: Theme.teslaRed },
  card: {
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
    gap: 10,
  },
  cardWarning: { borderColor: Theme.warning, backgroundColor: Theme.warningMuted },
  cardDanger: { borderColor: Theme.teslaRed },
  note: { fontSize: 12, fontWeight: "400", color: Theme.textMuted, lineHeight: 18 },
  noteError: { color: Theme.teslaRed },
  noteSuccess: { color: Theme.success },
  noteWarning: { color: Theme.warning },
  metricRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: {
    flexGrow: 1,
    flexBasis: 130,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
    gap: 2,
  },
  metricLabel: { fontSize: 11, fontWeight: "500", color: Theme.textSecondary },
  metricValue: { fontSize: 16, fontWeight: "600", color: Theme.textPrimaryDark, fontVariant: ["tabular-nums"] },
  metricDanger: { color: Theme.teslaRed },
  pill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: Theme.surfaceBorder },
  pillOk: { backgroundColor: Theme.positiveMuted },
  pillWarn: { backgroundColor: Theme.warningMuted },
  pillBad: { backgroundColor: Theme.destructiveWash },
  pillText: { fontSize: 11, fontWeight: "500", color: Theme.textSecondary },
  pillTextOk: { color: Theme.success },
  pillTextWarn: { color: Theme.warning },
  pillTextBad: { color: Theme.teslaRed },
  state: { paddingVertical: 24, alignItems: "center" },
  stateRow: { gap: 8, alignItems: "flex-start" },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  trHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Theme.primary },
  th: { fontSize: 10, fontWeight: "500", letterSpacing: 0.4, color: Theme.buttonDarkText },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
  },
  trAlt: { backgroundColor: Theme.surface },
  rowOn: { backgroundColor: Theme.accentBrownMuted, borderLeftWidth: 3, borderLeftColor: Theme.primary },
  rowMuted: { opacity: 0.6 },
  cellBox: { justifyContent: "center" },
  cellRight: { alignItems: "flex-end" },
  td: { fontSize: 12, fontWeight: "400", color: Theme.textPrimaryDark },
  tdStrong: { fontSize: 13, fontWeight: "500", color: Theme.textPrimaryDark },
  num: { textAlign: "right", fontVariant: ["tabular-nums"] },
  cards: { gap: 8 },
  rowCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
    gap: 8,
  },
  cardLead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardFacts: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 6 },
  cardFact: { minWidth: 110, gap: 1 },
  cardFactLabel: { fontSize: 10, fontWeight: "500", color: Theme.textSecondary },
  backdrop: { flex: 1, backgroundColor: Theme.overlayBackdrop, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  sheet: { width: "100%", maxWidth: 720, maxHeight: "100%", borderRadius: 12, backgroundColor: Theme.cardWhite, overflow: "hidden" },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
  },
  sheetBody: { padding: 16 },
  sheetInner: { gap: 12 },
  sheetFoot: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
    justifyContent: "flex-end",
  },
  close: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  closeText: { fontSize: 13, fontWeight: "500", color: Theme.primary },
  rangeWrap: { gap: 8 },
});
