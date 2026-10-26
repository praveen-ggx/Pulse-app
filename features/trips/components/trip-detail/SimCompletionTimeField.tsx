/**
 * Completion date + time for simulate — same pickers as vault / hard-copy POD.
 */
import { HardCopyPodDateField } from "@/features/trips/components/trip-detail/HardCopyPodDateField";
import { HardCopyPodTimeField } from "@/features/trips/components/trip-detail/HardCopyPodTimeField";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { toSimCompletionPickerValue } from "../../utils/simulateTripStage.util";

type Props = {
  initialValue: string;
  onChange: (next: string) => void;
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

export function SimCompletionTimeField({ initialValue, onChange }: Props) {
  const [value, setValue] = useState(initialValue || toSimCompletionPickerValue());
  const parts = splitPickerValue(value);

  const write = (date: string, time: string) => {
    const nextDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : parts.date;
    const nextTime = /^\d{2}:\d{2}$/.test(time) ? time : parts.time;
    const next = `${nextDate}T${nextTime}`;
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
