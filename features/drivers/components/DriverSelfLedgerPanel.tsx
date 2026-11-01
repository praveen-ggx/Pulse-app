/**
 * Fleet Owner Cash → SELF — full driver_ledger list (Business Finance-like).
 * Employer / open-trips blocks stay on Fleet for employed drivers only.
 */
import {
  driverBodySecondary,
  driverUIBold,
  driverUISemiBold,
} from '@/constants/DriverTypography';
import Theme from '@/constants/Theme';
import { DriverLedgerReceiptPreviewModal, type DriverLedgerReceiptPreview } from '@/features/drivers/components/DriverLedgerReceiptPreviewModal';
import type { DriverLedgerRow } from '@/features/drivers/services/drivers.service';
import {
  buildDriverLedgerReceiptDetails,
  deriveDriverPaymentMode,
  extractDriverPaymentUtr,
} from '@/features/driver/tripSettlement/driverTripSettlement.util';
import { phonePeMetaDate } from '@/features/driver/utils/driverGpayTransactions.util';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const LEDGER_TYPE_LABELS: Record<string, string> = {
  settlement: 'Settlement',
  salary: 'Salary',
  advance: 'Advance',
  reimbursement: 'Reimbursement',
  adjustment: 'Adjustment',
  deduction: 'Deduction',
  incentive: 'Incentive',
  reward: 'Reward',
};

function ledgerTypeLabel(type: string): string {
  return LEDGER_TYPE_LABELS[type] ?? (type || 'Transaction').replace(/_/g, ' ');
}

function formatSectionLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  ) {
    return 'Today';
  }
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return 'Yesterday';
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

type Props = {
  entries: DriverLedgerRow[];
  orgNameById: Record<string, string>;
  colors: {
    text: string;
    textMuted: string;
    surface: string;
    border: string;
    emerald: string;
    emeraldMuted: string;
    borderSubtle?: string;
  };
  isDark: boolean;
};

export function DriverSelfLedgerPanel({ entries, orgNameById, colors, isDark }: Props) {
export function DriverSelfLedgerPanel({ entries, orgNameById, tripNumberById, colors, isDark }: Props) {
  const [preview, setPreview] = useState<DriverLedgerReceiptPreview | null>(null);
    const sorted = [...entries].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const map = new Map<string, DriverLedgerRow[]>();
    for (const e of sorted) {
      const key = formatSectionLabel(e.created_at);
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return [...map.entries()].map(([label, rows]) => ({ label, rows }));
  }, [entries]);

  const totals = useMemo(() => {
    let inAmt = 0;
    let outAmt = 0;
    for (const e of entries) {
      const n = Number(e.amount) || 0;
      if (n >= 0) inAmt += n;
      else outAmt += Math.abs(n);
    }
    return { inAmt: Math.round(inAmt), outAmt: Math.round(outAmt), net: Math.round(inAmt - outAmt) };
  }, [entries]);

  if (entries.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.title, { color: colors.text }]}>Self transactions</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Settlements, salary, and adjustments from your ledger — same cash movements Business
          Finance tracks.
        </Text>
        <View
          style={[
            styles.emptyCard,
            {
              backgroundColor: colors.surface,
              borderColor: isDark ? colors.borderSubtle ?? colors.border : Theme.borderLight,
            },
          ]}
        >
          <FontAwesome name="list-alt" size={22} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No transactions yet</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            When trips settle or salary/incentives post, they appear here.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.text }]}>Self transactions</Text>
      <Text style={[styles.sub, { color: colors.textMuted }]}>
        Your driver ledger — in, out, and adjustments.
      </Text>

      <View
        style={[
          styles.summaryRow,
          {
            backgroundColor: colors.surface,
            borderColor: isDark ? colors.borderSubtle ?? colors.border : Theme.borderLight,
          },
        ]}
      >
        <View style={styles.summaryCell}>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>In</Text>
          <Text style={[styles.summaryValue, { color: colors.emerald }]}>
            ₹{totals.inAmt.toLocaleString('en-IN')}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: isDark ? colors.borderSubtle : Theme.borderLight }]} />
        <View style={styles.summaryCell}>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Out</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            ₹{totals.outAmt.toLocaleString('en-IN')}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: isDark ? colors.borderSubtle : Theme.borderLight }]} />
        <View style={styles.summaryCell}>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Net</Text>
          <Text
            style={[
              styles.summaryValue,
              { color: totals.net >= 0 ? colors.emerald : Theme.negative },
            ]}
          >
            ₹{Math.abs(totals.net).toLocaleString('en-IN')}
          </Text>
        </View>
      </View>

      {sections.map(({ label, rows }) => (
        <View key={label} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{label}</Text>
          <View
            style={[
              styles.group,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? colors.borderSubtle ?? colors.border : Theme.borderLight,
              },
            ]}
          >
            {rows.map((entry, idx) => {
              const raw = Number(entry.amount) || 0;
              const isCredit = raw >= 0;
              const abs = Math.abs(Math.round(raw));
              const typeLabel = ledgerTypeLabel(entry.type);
              const desc = (entry.description ?? '').trim();
              const orgName =
                orgNameById[String(entry.organization_id ?? '')]?.trim() || 'Self / fleet';
              const amountLabel = `${isCredit ? '+' : '−'} ₹${abs.toLocaleString('en-IN')}`;
              const isLast = idx === rows.length - 1;
              return (
              const tripId = String(entry.trip_id ?? '').trim();
              const tripDisplay = tripId
                ? tripNumberById?.[tripId] ?? tripId.slice(0, 8).toUpperCase()
                : null;
              const paymentMode = deriveDriverPaymentMode(desc) ?? '—';
              const reference = extractDriverPaymentUtr(desc) ?? '—';
              return (
                <TouchableOpacity
                  key={entry.id}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel={`${typeLabel} ${amountLabel}`}
                  onPress={() =>
                    setPreview({
                      statusLabel: isCredit ? 'Payment received' : 'Payment sent',
                      title: typeLabel,
                      amount: abs,
                      isIn: isCredit,
                      partyAvatar: {
                        name: orgName,
                        entityType: 'supplier',
                        initialsColorSeed: String(entry.organization_id ?? orgName),
                      },
                      details: buildDriverLedgerReceiptDetails({
                        paymentDateRaw: entry.created_at,
                        partyName: orgName,
                        tripDisplay,
                        paymentMode,
                        reference,
                      }),
                    })
                  }
                    styles.row,
                    !isLast && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: isDark
                        ? colors.borderSubtle ?? colors.border
                        : Theme.borderLight,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.iconSq,
                      {
                        backgroundColor: isCredit
                          ? colors.emeraldMuted
                          : isDark
                            ? 'rgba(248,113,113,0.12)'
                            : Theme.negativeMuted,
                      },
                    ]}
                  >
                    <FontAwesome
                      name={isCredit ? 'arrow-down' : 'arrow-up'}
                      size={14}
                      color={isCredit ? colors.emerald : Theme.negative}
                    />
                  </View>
                  <View style={styles.mid}>
                    <Text style={[styles.primary, { color: colors.text }]} numberOfLines={1}>
                      {typeLabel}
                    </Text>
                    <Text style={[styles.secondary, { color: colors.textMuted }]} numberOfLines={2}>
                      {desc || orgName}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                      {phonePeMetaDate(entry.created_at)}
                      {desc ? ` · ${orgName}` : ''}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.amount,
                      { color: isCredit ? colors.emerald : colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {amountLabel}
                  </Text>
                </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      <DriverLedgerReceiptPreviewModal
        visible={!!preview}
        receipt={preview}
        onClose={() => setPreview(null)}
      />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  title: {
    ...driverUIBold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sub: {
    ...driverBodySecondary,
    fontSize: 11,
    lineHeight: 15,
    marginTop: -4,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    marginTop: 2,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  summaryLabel: {
    ...driverUISemiBold,
    fontSize: 9,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  summaryValue: {
    ...driverUIBold,
    fontSize: 13,
    letterSpacing: -0.2,
  },
  section: { gap: 6 },
  sectionLabel: {
    ...driverUISemiBold,
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
  },
  group: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  iconSq: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { flex: 1, minWidth: 0, gap: 2 },
  primary: {
    ...driverUIBold,
    fontSize: 12,
  },
  secondary: {
    ...driverBodySecondary,
    fontSize: 11,
    lineHeight: 14,
  },
  meta: {
    ...driverBodySecondary,
    fontSize: 10,
    marginTop: 1,
  },
  amount: {
    ...driverUIBold,
    fontSize: 12,
    letterSpacing: -0.2,
    maxWidth: 110,
    textAlign: 'right',
  },
  emptyCard: {
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 28,
    paddingHorizontal: 18,
  },
  emptyTitle: {
    ...driverUIBold,
    fontSize: 13,
  },
  emptyBody: {
    ...driverBodySecondary,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
});
