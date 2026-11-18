/**
 * Date filter for finance, entity trip tabs, and the load board.
 * Opens the same sheet as Filter trips, with period choices.
 */
import { useState } from "react";
import { Calendar } from "lucide-react-native";

import { SmartFilterButton } from "@/components/SmartFilterButton";
import type { FinancePeriodFilter } from "@/features/finance/types";
import { formatCalendarPeriodRangeLabel } from "@/lib/dateRangePresets";

const PERIODS: { id: FinancePeriodFilter; name: string; meta: string }[] = [
  { id: "TODAY", name: "Today", meta: "Records from today" },
  { id: "YESTERDAY", name: "Yesterday", meta: "The day before" },
  { id: "WEEK", name: "This week", meta: "This calendar week" },
  { id: "MONTH", name: "This month", meta: "This calendar month" },
];

export interface DatePresetPillBarProps {
  period: FinancePeriodFilter;
  onPeriodChange: (p: FinancePeriodFilter) => void;
  /** Opens custom range picker (parent owns modal). */
  onCustomRangePress: () => void;
  customFrom?: string | null;
  customTo?: string | null;
  /** Kept so existing callers compile. Every variant uses the same sheet. */
  variant?: "onDark" | "onLight" | "dropdown";
}

export function DatePresetPillBar({
  period,
  onPeriodChange,
  onCustomRangePress,
  customFrom,
  customTo,
}: DatePresetPillBarProps) {
  const [kind] = useState<"date">("date");
  const range =
    formatCalendarPeriodRangeLabel("CUSTOM", { customFrom, customTo }) ??
    "Choose a start and end";
  const current = PERIODS.find((item) => item.id === period);
  const triggerLabel =
    period === "CUSTOM" ? `Date · ${range}` : current ? `Date · ${current.name}` : "Date";

  return (
    <SmartFilterButton
      title="Filter by date"
      triggerLabel={triggerLabel}
      triggerActive={period !== "RANGE"}
      kind={kind}
      onKindChange={() => {}}
      kinds={[
        {
          id: "date",
          label: "Date",
          allLabel: "All dates",
          hint: "Which period to show",
          icon: Calendar,
          searchPlaceholder: "Search periods",
          selectedId: period === "RANGE" ? null : period,
          choices: [
            ...PERIODS.map((item) => ({ id: item.id, name: item.name, meta: item.meta })),
            { id: "CUSTOM", name: "Custom range", meta: range },
          ],
        },
      ]}
      onSelect={(_kind, id) => {
        if (id == null || id === "RANGE") {
          onPeriodChange("RANGE");
          return;
        }
        if (id === "CUSTOM") {
          onCustomRangePress();
          return;
        }
        onPeriodChange(id as FinancePeriodFilter);
      }}
    />
  );
}
