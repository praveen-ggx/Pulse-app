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

export type TripAuditLogDocPreview = {
  storagePath: string;
  fileName?: string | null;
  source?:
    | "trip"
    | "vehicle"
    | "vehicle-vault"
    | "compliance"
    | "entity"
    | "driver-kyc"
    | "supplier-kyc";
  organizationId?: string | null;
  entityId?: string | null;
  docType?: string | null;
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
  /** Open the uploaded file from Activity when present. */
  preview?: TripAuditLogDocPreview | null;
};
