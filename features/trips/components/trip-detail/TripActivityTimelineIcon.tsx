import Feather from "@expo/vector-icons/Feather";
import type { TripAuditLogCategory } from "@/lib/trips/tripAuditLog.types";
import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";

type IconSpec = {
  name: ComponentProps<typeof Feather>["name"];
  color: string;
  bg: string;
  border: string;
};

function iconForEntry(
  category: TripAuditLogCategory,
  title: string,
  amountLabel?: string,
): IconSpec {
  const lower = title.toLowerCase();

  if (category === "payment") {
    const isIn = amountLabel?.startsWith("+");
    return isIn
      ? {
          name: "arrow-down-left",
          color: "#047857",
          bg: "rgba(16,185,129,0.12)",
          border: "rgba(16,185,129,0.24)",
        }
      : {
          name: "arrow-up-right",
          color: "#b91c1c",
          bg: "rgba(239,68,68,0.1)",
          border: "rgba(239,68,68,0.22)",
        };
  }

  if (category === "assignment") {
    if (lower.includes("reject") || lower.includes("declin")) {
      return {
        name: "user-x",
        color: "#b45309",
        bg: "rgba(245,158,11,0.12)",
        border: "rgba(245,158,11,0.24)",
      };
    }
    if (lower.includes("reassign")) {
      return {
        name: "repeat",
        color: "#1d4ed8",
        bg: "rgba(59,130,246,0.1)",
        border: "rgba(59,130,246,0.22)",
      };
    }
    return {
      name: "user-check",
      color: "#1d4ed8",
      bg: "rgba(59,130,246,0.1)",
      border: "rgba(59,130,246,0.22)",
    };
  }

  if (category === "trip") {
    return {
      name: "flag",
      color: "#4f46e5",
      bg: "rgba(99,102,241,0.1)",
      border: "rgba(99,102,241,0.22)",
    };
  }

  if (category === "document") {
    if (lower.includes("delet")) {
      return {
        name: "trash-2",
        color: "#b91c1c",
        bg: "rgba(239,68,68,0.1)",
        border: "rgba(239,68,68,0.22)",
      };
    }
    if (lower.includes("reject") || lower.includes("declin")) {
      return {
        name: "x-circle",
        color: "#b45309",
        bg: "rgba(245,158,11,0.12)",
        border: "rgba(245,158,11,0.24)",
      };
    }
    if (lower.includes("verif")) {
      return {
        name: "check-circle",
        color: "#047857",
        bg: "rgba(16,185,129,0.12)",
        border: "rgba(16,185,129,0.24)",
      };
    }
    return {
      name: "file-text",
      color: "#0369a1",
      bg: "rgba(14,165,233,0.1)",
      border: "rgba(14,165,233,0.22)",
    };
  }

  if (lower.includes("accept")) {
    return {
      name: "check-circle",
      color: "#047857",
      bg: "rgba(16,185,129,0.12)",
      border: "rgba(16,185,129,0.24)",
    };
  }
  if (lower.includes("pickup") || lower.includes("picked")) {
    return {
      name: "package",
      color: "#475569",
      bg: "rgba(148,163,184,0.14)",
      border: "rgba(148,163,184,0.24)",
    };
  }
  if (lower.includes("drop") || lower.includes("destination")) {
    return {
      name: "map-pin",
      color: "#475569",
      bg: "rgba(148,163,184,0.14)",
      border: "rgba(148,163,184,0.24)",
    };
  }
  if (lower.includes("transit") || lower.includes("started") || lower.includes("depart")) {
    return {
      name: "truck",
      color: "#475569",
      bg: "rgba(148,163,184,0.14)",
      border: "rgba(148,163,184,0.24)",
    };
  }
  if (lower.includes("complete") || lower.includes("deliver")) {
    return {
      name: "check",
      color: "#047857",
      bg: "rgba(16,185,129,0.12)",
      border: "rgba(16,185,129,0.24)",
    };
  }

  return {
    name: "activity",
    color: "#475569",
    bg: "rgba(148,163,184,0.14)",
    border: "rgba(148,163,184,0.24)",
  };
}

/** Metronic timeline node — standard icon in a soft tinted circle. */
export function TripActivityTimelineIcon({
  category,
  title,
  amountLabel,
  size = 28,
}: {
  category: TripAuditLogCategory;
  title: string;
  amountLabel?: string;
  size?: number;
}) {
  const spec = iconForEntry(category, title, amountLabel);
  const iconSize = Math.max(12, Math.round(size * 0.46));

  return (
    <View
      style={[
        styles.node,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: spec.bg,
          borderColor: spec.border,
        },
      ]}
    >
      <Feather name={spec.name} size={iconSize} color={spec.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  node: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
});
