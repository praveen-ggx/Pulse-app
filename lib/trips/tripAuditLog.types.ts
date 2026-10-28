import type { RegistryNotificationAvatar } from "@/lib/alertRegistry/registryNotificationAvatar.util";

export type TripAuditLogCategory =
  | "payment"
  | "trip"
  | "assignment"
  | "status"
  | "document"
  | "compliance";

export type TripAuditFilterTab =
  | "all"
  | "updates"
  | "assignment"
  | "payment"
  | "documents"
  | "activity"
  | "compliance";

export type TripAuditLogPerson = {
  name: string;
  role?: string;
  /** Workspace or party organization when it is not the same as `name`. */
  orgLabel?: string;
  avatar: RegistryNotificationAvatar;
};

export type TripAuditLogEntry = {
  id: string;
  at: string;
  category: TripAuditLogCategory;
  categoryLabel: string;
  title: string;
  recordedAtLabel: string;
  recordedBy: string;
  actorAvatar: RegistryNotificationAvatar;
  /** Secondary context in meta line — e.g. Payment · Assignment */
  contextLabel?: string;
  detail: string;
  detailLines?: string[];
  amountLabel?: string;
  headlineTarget?: string;
  /** Other people involved (driver, party, previous assignee). */
  people?: TripAuditLogPerson[];
};
