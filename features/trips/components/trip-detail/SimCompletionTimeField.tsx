/**
 * Completion date + time for simulate — same pickers as vault / hard-copy POD.
 * Optional minDateTime enforces Journey Log chronological order (same minute OK).
 */
import { HardCopyPodDateField } from "@/features/trips/components/trip-detail/HardCopyPodDateField";
import { HardCopyPodTimeField } from "@/features/trips/components/trip-detail/HardCopyPodTimeField";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  clampSimCompletionPickerValue,
  toSimCompletionPickerValue,
} from "../../utils/simulateTripStage.util";

type Props = {
  initialValue: string;
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
  initialValue,
  onChange,
  minDateTime,
}: Props) {
  const minAt = useMemo(
    () => parseLocalPickerDateTime(minDateTime),
    [minDateTime],
  );

  const [value, setValue] = useState(() =>
    clampSimCompletionPickerValue(
      initialValue || toSimCompletionPickerValue(),
      minAt,
    ),
  );

  useEffect(() => {
    setValue((prev) => {
      const next = clampSimCompletionPickerValue(prev, minAt);
      if (next !== prev) onChange(next);
      return next;
    });
    // Floor only — parent onChange is a ref write and must not re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minAt?.getTime() ?? null]);

  const parts = splitPickerValue(value);
  const minParts = minDateTime ? splitPickerValue(minDateTime) : null;
  const minTimeForSelectedDay =
    minParts && parts.date === minParts.date ? minParts.time : undefined;

  const write = (date: string, time: string) => {
    const nextDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : parts.date;
    let nextTime = /^\d{2}:\d{2}$/.test(time) ? time : parts.time;
    if (minParts && nextDate < minParts.date) {
      const clamped = `${minParts.date}T${minParts.time}`;
      setValue(clamped);
      onChange(clamped);
      return;
    }
    if (minParts && nextDate === minParts.date && nextTime < minParts.time) {
      nextTime = minParts.time;
    }
    const next = clampSimCompletionPickerValue(
      `${nextDate}T${nextTime}`,
      minAt,
    );
    setValue(next);
    onChange(next);
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
