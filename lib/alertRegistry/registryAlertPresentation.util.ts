/** Presentation tokens for alert registry cards — status + tag tones. */
export type RegistryTagVariant = "default" | "success" | "danger" | "warning" | "neutral";

export type RegistryTag = {
  label: string;
  variant?: RegistryTagVariant;
};

export type RegistryStatusTone = "success" | "danger" | "neutral" | "warning";

const TAG_STYLES: Record<
  RegistryTagVariant,
  { bg: string; text: string; border: string }
> = {
  default: {
    bg: "#F1F1F4",
    text: "#78829D",
    border: "#DBDFE9",
  },
  neutral: {
    bg: "#F1F1F4",
    text: "#78829D",
    border: "#DBDFE9",
  },
  success: {
    bg: "#E8FFF3",
    text: "#047857",
    border: "rgba(80, 205, 137, 0.35)",
  },
  danger: {
    bg: "#FFF5F8",
    text: "#D9214E",
    border: "rgba(241, 65, 108, 0.28)",
  },
  warning: {
    bg: "#FFF8DD",
    text: "#B45309",
    border: "rgba(245, 158, 11, 0.35)",
  },
};

const STATUS_STYLES: Record<
  RegistryStatusTone,
  { bg: string; text: string; border: string }
> = {
  success: TAG_STYLES.success,
  danger: TAG_STYLES.danger,
  warning: TAG_STYLES.warning,
  neutral: TAG_STYLES.neutral,
};

export function registryTagStyle(variant: RegistryTagVariant = "default") {
  return TAG_STYLES[variant];
}

export function registryStatusStyle(tone: RegistryStatusTone) {
  return STATUS_STYLES[tone];
}

export function formatRegistryLabel(raw: string | null | undefined): string {
  return String(raw ?? "unknown")
    .replace(/_/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function formatRegistryStatusLabel(raw: string | null | undefined): string {
  return formatRegistryLabel(raw);
}

export function salaryRequestStatusTone(
  status: string | null | undefined,
): RegistryStatusTone {
  const s = String(status ?? "").toLowerCase();
  if (s === "approved" || s === "paid") return "success";
  if (s === "rejected") return "danger";
  if (s === "pending") return "warning";
  return "neutral";
}

export function sharedNotificationStatusTone(
  status: string | null | undefined,
): RegistryStatusTone {
  const s = String(status ?? "").toLowerCase();
  if (s === "resolved" || s === "handled") return "success";
  if (s === "read") return "neutral";
  if (s === "open") return "warning";
  return "neutral";
}

export function opsAlertTagVariant(category: string): RegistryTagVariant {
  if (category === "payment_received") return "success";
  if (category === "payment_paid") return "warning";
  if (category === "unassigned_trip") return "warning";
  if (category === "late_log" || category === "vehicle_idle") return "warning";
  return "neutral";
}
