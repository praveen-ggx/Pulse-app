/**
 * Completion date + time for simulate — same pickers as vault / hard-copy POD.
 * Controlled: parent owns the value so Confirm Simulate saves exactly what is shown.
 * Optional minDateTime enforces Journey Log chronological order (same minute OK).
 */
import { HardCopyPodDateField } from "@/features/trips/components/trip-detail/HardCopyPodDateField";
import { HardCopyPodTimeField } from "@/features/trips/components/trip-detail/HardCopyPodTimeField";
import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  clampSimCompletionPickerValue,
  toSimCompletionPickerValue,
} from "../../utils/simulateTripStage.util";

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** Local picker floor `YYYY-MM-DDTHH:mm` — earlier dates/times disabled. */
  minDateTime?: string | null;
};

function splitPickerValue(value: string): { date: string; time: string } {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) {
    const fallback = toSimCompletionPickerValue();
    return {
      date: fallback.slice(0, 10),
      time: fallback.slice(11, 16),
    };
  }
  return { date: match[1], time: `${match[2]}:${match[3]}` };
}

function parseLocalPickerDateTime(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(
    String(value ?? "").trim(),
  );
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0,
  );
  return Number.isFinite(date.getTime()) ? date : null;
}

export function SimCompletionTimeField({
  value,
  onChange,
  minDateTime,
}: Props) {
  const minAt = useMemo(
    () => parseLocalPickerDateTime(minDateTime),
    [minDateTime],
  );

  // When the floor moves (Pickup edited after a revoke), drop any previous
  // stage selection and start from now, raised to the new floor. Keeping the
  // old value would leave the last In Transit instant on screen.
  useEffect(() => {
    const next = clampSimCompletionPickerValue(toSimCompletionPickerValue(), minAt);
    if (next !== value) onChange(next);
    // Parent onChange must not be a render dependency. User edits change
    // `value` only; those must not be snapped back to now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minAt?.getTime() ?? null]);

  const parts = splitPickerValue(value || toSimCompletionPickerValue());
  const minParts = minDateTime ? splitPickerValue(minDateTime) : null;
  const minTimeForSelectedDay =
    minParts && parts.date === minParts.date ? minParts.time : undefined;

  const write = (date: string, time: string) => {
    const nextDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : parts.date;
    let nextTime = /^\d{2}:\d{2}$/.test(time) ? time : parts.time;
    if (minParts && nextDate < minParts.date) {
      onChange(`${minParts.date}T${minParts.time}`);
      return;
    }
    if (minParts && nextDate === minParts.date && nextTime < minParts.time) {
      nextTime = minParts.time;
    }
    onChange(
      clampSimCompletionPickerValue(`${nextDate}T${nextTime}`, minAt),
    );
  };

  return (
    <View style={styles.row}>
      <View style={styles.col}>
        <HardCopyPodDateField
          quiet
          compact
          label="Date"
          required
          allowClear={false}
          minDate={minParts?.date}
          value={parts.date}
          onChange={(date) => write(date, parts.time)}
        />
      </View>
      <View style={styles.col}>
        <HardCopyPodTimeField
          quiet
          compact
          label="Time"
          required
          allowClear={false}
          hour12
          minuteStep={1}
          placeholder="hh:mm AM/PM"
          minTime={minTimeForSelectedDay}
          value={parts.time}
          onChange={(time) => write(parts.date, time)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
});
