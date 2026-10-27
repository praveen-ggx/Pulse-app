import Theme from "@/constants/Theme";
import { StyleSheet, Text, View } from "react-native";

export function TripCompletionStatusTag({
  completed,
  compact = false,
}: {
  completed: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.tag,
        compact && styles.tagCompact,
        completed ? styles.tagReceived : styles.tagIncomplete,
      ]}
      accessibilityLabel={completed ? "Trip completed" : "Trip not completed"}
    >
      <Text
        style={[
          styles.tagText,
          compact && styles.tagTextCompact,
          completed ? styles.tagTextReceived : styles.tagTextIncomplete,
        ]}
        numberOfLines={1}
      >
        {completed ? "Completed" : "Not completed"}
      </Text>
    </View>
  );
}

export function TripNotCompletedTag({ compact = false }: { compact?: boolean }) {
  return <TripCompletionStatusTag completed={false} compact={compact} />;
}

/** Completion status always; POD chips only after the trip is delivered. */
export function TripCompletionOrPodTags({
  tripCompleted,
  softCopyReceived,
  hardCopyReceived,
  compact = false,
}: {
  tripCompleted: boolean;
  softCopyReceived: boolean;
  hardCopyReceived: boolean;
  compact?: boolean;
}) {
  return (
    <View style={styles.row} accessibilityRole="text">
      <TripCompletionStatusTag completed={tripCompleted} compact={compact} />
      {tripCompleted ? (
        <>
          <PodTag
            compact={compact}
            received={softCopyReceived}
            label="Soft"
            accessibilityLabel={
              softCopyReceived
                ? "Soft copy POD received"
                : "Soft copy POD missing"
            }
          />
          <PodTag
            compact={compact}
            received={hardCopyReceived}
            label="Hard"
            accessibilityLabel={
              hardCopyReceived
                ? "Hard copy POD received"
                : "Hard copy POD pending"
            }
          />
        </>
      ) : null}
    </View>
  );
}

/** `softCopyReceived: null` = document flags not loaded; the Soft chip is left out. */
export function TripPodStatusTags({
  softCopyReceived,
  hardCopyReceived,
  compact = false,
}: {
  softCopyReceived: boolean | null;
  hardCopyReceived: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.row, styles.rowInline]} accessibilityRole="text">
      {softCopyReceived == null ? null : (
        <PodTag
          compact={compact}
          received={softCopyReceived}
          label="Soft"
          accessibilityLabel={
            softCopyReceived ? "Soft copy POD received" : "Soft copy POD missing"
          }
        />
      )}
      <PodTag
        compact={compact}
        received={hardCopyReceived}
        label="Hard"
        accessibilityLabel={
          hardCopyReceived ? "Hard copy POD received" : "Hard copy POD pending"
        }
      />
    </View>
  );
}

function PodTag({
  received,
  label,
  compact,
  accessibilityLabel,
}: {
  received: boolean;
  label: string;
  compact: boolean;
  accessibilityLabel: string;
}) {
  return (
    <View
      style={[
        styles.tag,
        compact && styles.tagCompact,
        received ? styles.tagReceived : styles.tagPending,
      ]}
      accessibilityLabel={accessibilityLabel}
    >
      <Text
        style={[
          styles.tagText,
          compact && styles.tagTextCompact,
          received ? styles.tagTextReceived : styles.tagTextPending,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  rowInline: {
    flexWrap: "nowrap",
  },
  tag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 0,
  },
  tagCompact: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagReceived: {
    backgroundColor: Theme.positiveMuted,
  },
  tagPending: {
    backgroundColor: Theme.negativeMuted,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  tagTextCompact: {
    fontSize: 10,
    letterSpacing: 0,
  },
  tagTextReceived: {
    color: Theme.positive,
  },
  tagTextPending: {
    color: Theme.negative,
  },
  tagIncomplete: {
    backgroundColor: Theme.warningMuted,
  },
  tagTextIncomplete: {
    color: Theme.warning,
  },
});
