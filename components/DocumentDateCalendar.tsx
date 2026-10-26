/**
 * Document date calendar — Apple-style month/year jump, then a day grid.
 * Used for expiry, LR date, e-way valid till, and other document dates.
 */
import Theme from "@/constants/Theme";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type PickerView = "day" | "month" | "year";

function parseIso(iso: string | null | undefined): Date {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T12:00:00`);
  return new Date();
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clampDay(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

export function DocumentDateCalendar({
  selectedIso,
  onSelect,
  minDate,
  maxDate,
}: {
  selectedIso: string;
  onSelect: (iso: string) => void;
  minDate?: string;
  maxDate?: string;
}) {
  const selected = parseIso(selectedIso);
  const [view, setView] = useState<PickerView>("day");
  const [year, setYear] = useState(selected.getFullYear());
  const [month, setMonth] = useState(selected.getMonth());

  useEffect(() => {
    const next = parseIso(selectedIso);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setView("day");
  }, [selectedIso]);

  const min = minDate ? parseIso(minDate) : null;
  const max = maxDate ? parseIso(maxDate) : null;
  const todayIso = toISODate(new Date());

  const yearStart = min ? min.getFullYear() : new Date().getFullYear() - 10;
  const yearEnd = max ? max.getFullYear() : new Date().getFullYear() + 20;
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = yearStart; y <= yearEnd; y += 1) list.push(y);
    return list;
  }, [yearEnd, yearStart]);

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setView("day");
  };

  const applyYear = (nextYear: number) => {
    setYear(nextYear);
    const keepDay = selected.getDate();
    onSelect(toISODate(clampDay(nextYear, month, keepDay)));
    setView("day");
  };

  const applyMonth = (nextMonth: number) => {
    setMonth(nextMonth);
    const keepDay = selected.getDate();
    onSelect(toISODate(clampDay(year, nextMonth, keepDay)));
    setView("day");
  };

  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const gridStart = new Date(year, month, 1 - firstWeekday);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + index,
      );
      const iso = toISODate(date);
      const beforeMin = min ? date < new Date(min.getFullYear(), min.getMonth(), min.getDate()) : false;
      const afterMax = max ? date > new Date(max.getFullYear(), max.getMonth(), max.getDate()) : false;
      return {
        iso,
        day: date.getDate(),
        inMonth: date.getMonth() === month,
        disabled: beforeMin || afterMax,
      };
    });
  }, [max, min, month, year]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable
          style={styles.nav}
          onPress={() => shiftMonth(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <ChevronLeft size={18} color={Theme.brandBlueInk} strokeWidth={2.2} />
        </Pressable>
        <View style={styles.headerPickers}>
          <Pressable
            style={[styles.headerChip, view === "month" && styles.headerChipActive]}
            onPress={() => setView((current) => (current === "month" ? "day" : "month"))}
            accessibilityRole="button"
            accessibilityLabel="Choose month"
          >
            <Text style={[styles.headerChipText, view === "month" && styles.headerChipTextActive]}>
              {MONTHS[month]}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.headerChip, view === "year" && styles.headerChipActive]}
            onPress={() => setView((current) => (current === "year" ? "day" : "year"))}
            accessibilityRole="button"
            accessibilityLabel="Choose year"
          >
            <Text style={[styles.headerChipText, view === "year" && styles.headerChipTextActive]}>
              {year}
            </Text>
          </Pressable>
        </View>
        <Pressable
          style={styles.nav}
          onPress={() => shiftMonth(1)}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <ChevronRight size={18} color={Theme.brandBlueInk} strokeWidth={2.2} />
        </Pressable>
      </View>

      {view === "year" ? (
        <ScrollView style={styles.yearList} contentContainerStyle={styles.yearListContent}>
          {years.map((item) => {
            const active = item === year;
            return (
              <Pressable
                key={item}
                style={[styles.yearRow, active && styles.yearRowActive]}
                onPress={() => applyYear(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Year ${item}`}
              >
                <Text style={[styles.yearText, active && styles.yearTextActive]}>{item}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {view === "month" ? (
        <View style={styles.monthGrid}>
          {MONTHS.map((label, index) => {
            const active = index === month;
            return (
              <Pressable
                key={label}
                style={[styles.monthCell, active && styles.monthCellActive]}
                onPress={() => applyMonth(index)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
              >
                <Text style={[styles.monthText, active && styles.monthTextActive]}>
                  {label.slice(0, 3)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {view === "day" ? (
        <>
          <View style={styles.week}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={styles.weekText}>
                {day}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((cell) => {
              const selectedDay = cell.iso === selectedIso;
              const today = cell.iso === todayIso;
              return (
                <Pressable
                  key={cell.iso}
                  disabled={cell.disabled}
                  style={[styles.day, selectedDay && styles.daySelected, cell.disabled && styles.dayDisabled]}
                  onPress={() => onSelect(cell.iso)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${cell.iso}`}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !cell.inMonth && styles.dayMuted,
                      today && !selectedDay && styles.dayToday,
                      selectedDay && styles.dayTextSelected,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", gap: 10 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  nav: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerPickers: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    minWidth: 0,
  },
  headerChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  headerChipActive: {
    backgroundColor: Theme.accentGold,
    borderColor: Theme.accentGold,
  },
  headerChipText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  headerChipTextActive: {
    color: Theme.brandBlueInk,
  },
  yearList: { maxHeight: 260 },
  yearListContent: { gap: 4, paddingVertical: 4 },
  yearRow: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  yearRowActive: {
    backgroundColor: Theme.brandBlueInk,
  },
  yearText: {
    fontSize: 17,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  yearTextActive: {
    color: Theme.cardWhite,
    fontWeight: "800",
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  monthCell: {
    width: "30%",
    flexGrow: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  monthCellActive: {
    backgroundColor: Theme.brandBlueInk,
    borderColor: Theme.brandBlueInk,
  },
  monthText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  monthTextActive: {
    color: Theme.cardWhite,
  },
  week: { flexDirection: "row" },
  weekText: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  day: {
    width: `${100 / 7}%`,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  daySelected: {
    backgroundColor: Theme.brandBlueInk,
  },
  dayDisabled: { opacity: 0.28 },
  dayText: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  dayMuted: { color: Theme.textMuted },
  dayToday: { color: Theme.brandBlueInk, fontWeight: "800" },
  dayTextSelected: { color: Theme.cardWhite, fontWeight: "700" },
});
