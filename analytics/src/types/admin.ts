// ─── KYC primitive types (owned here; kyc.ts re-exports) ─────────────────────

export type EntityType     = 'Pvt Ltd' | 'LLP' | 'Proprietorship' | 'Partnership' | 'Public Ltd' | 'Individual';
export type AppStatus      = 'Pending' | 'Approved' | 'Rejected' | 'Escalated' | 'Under Review';
export type RiskLevel      = 'Low' | 'Medium' | 'High';
export type DocumentType =
  | 'COI'
  | 'PAN Card'
  | 'Board Resolution'
  | 'GST Certificate'
  | 'Address Proof'
  | 'MOA/AOA'
  | 'Partnership Deed'
  | 'LLP Agreement'
  | 'MSME / Udyam'
  | 'IEC'
  | 'Aadhaar'
  | 'Activity Proof';
export type DocumentStatus = 'Valid' | 'Pending' | 'Flagged' | 'Unreadable' | 'Missing' | 'Expired';
export type CheckStatus    = 'Passed' | 'Failed' | 'Pending' | 'Manual Review' | 'N/A';
export type AuditActorType = 'system' | 'admin' | 'applicant';
export type AuditEventType =
  | 'submitted' | 'pre_check_started' | 'pre_check_passed' | 'pre_check_failed'
  | 'assigned' | 'document_flagged' | 'approved' | 'rejected' | 'escalated'
  | 'comment' | 'reopened';

export interface AutomatedCheck {
  id: string; label: string; status: CheckStatus; detail?: string; checked_at?: string;
  /** Structure-driven: GSTIN/PAN always; CIN for limited companies; required doc slots. */
  required?: boolean;
}

export interface BusinessDocument {
  id: string; type: DocumentType; file_name: string; status: DocumentStatus;
  flag_reason?: string; uploaded_at: string; url: string;
  /** Original storage object path — required to re-sign preview URLs. */
  storage_path: string;
  /** Original upload MIME (jpeg/png/webp/heic/pdf). Keep as-is for re-preview. */
  mime_type: string;
  size_kb: number; page_count?: number;
  /** True when this slot is mandatory for the org's registration type. */
  required?: boolean;
}

export interface Director {
  name: string; din: string;
  designation: 'Managing Director' | 'Director' | 'Designated Partner' | 'Partner' | 'Proprietor';
}

export interface AuditEntry {
  id: string; timestamp: string; actor: string; actor_type: AuditActorType;
  event_type: AuditEventType; title: string; detail?: string;
}

export interface BusinessApplication {
  id: string; company_name: string; trade_name?: string; entity_type: EntityType;
  gstin: string; pan: string; cin?: string; registration_date: string;
  directors: Director[];
  registered_address: string; pincode: string; city: string; state: string;
  contact_name: string; contact_email: string; contact_phone: string;
  submission_date: string; status: AppStatus; risk_score: RiskLevel; risk_factors: string[];
  assigned_to: string;
  rejection_reason?: string; rejection_notes?: string; escalation_reason?: string;
  approval_notes?: string;
  automated_checks: AutomatedCheck[];
  documents: BusinessDocument[];
  audit_trail: AuditEntry[];
}

export type QueueFilter = AppStatus | 'All';

export const REJECTION_REASONS = [
  'Blurry or unreadable document',
  'Name mismatch on PAN',
  'GSTIN inactive or cancelled',
  'Expired Certificate of Incorporation',
  'Director DIN not found in MCA',
  'Address does not match GST records',
  'Board Resolution missing or unsigned',
  'Forged or tampered document suspected',
  'Pincode outside serviceable zone',
] as const;

export type RejectionReason = typeof REJECTION_REASONS[number];

export const APPROVAL_QUICK_NOTES = [
  'All documents verified — clean approval',
  'Verified via manual registry cross-check',
  'Minor discrepancy noted, approved with review',
] as const;

// ─── Organization-level additions ─────────────────────────────────────────────

export type BillingTier = 'Starter' | 'Growth' | 'Enterprise';
export type UserRole    = 'Owner' | 'Admin' | 'Member';
export type UserStatus  = 'Active' | 'Suspended' | 'Invited';

export interface OrgUser {
  id: string; name: string; email: string;
  role: UserRole; status: UserStatus; lastLogin: string | null;
}

export interface UsageMetric {
  id: string; label: string;
  pct: number;        // 0–100 display percentage
  detail: string;     // human-readable "used / limit"
  variant: 'default' | 'warning' | 'danger';
}

export interface FeatureFlag {
  id: string; label: string; description: string; enabled: boolean;
}

// ─── Organization — superset of BusinessApplication ──────────────────────────

export interface Organization extends BusinessApplication {
  billing_tier:  BillingTier;
  api_usage:     number;        // 0–100 %
  users:         OrgUser[];
  usage_metrics: UsageMetric[];
  feature_flags: FeatureFlag[];
}

// ─── Admin context value ──────────────────────────────────────────────────────

export interface AdminContextValue {
  // Data
  applications:       Organization[];
  selectedId:         string | null;
  selectedApp:        Organization | null;
  selectedOrg:        Organization | null;       // alias for selectedApp

  // Selection
  selectApplication:  (id: string) => void;
  setSelectedOrgById: (id: string) => void;      // alias for selectApplication

  // Filters
  searchQuery:        string;
  setSearchQuery:     (q: string) => void;

  // Async state
  isLoading:          boolean;
  error:              string | null;
  refreshData:        () => Promise<void>;
  isActing:           boolean;

  // Async actions — all return Promise<void>; error surfaces via alert
  approveApp:         (id: string, notes?: string) => Promise<void>;
  rejectApp:          (id: string, reason: string, notes: string) => Promise<void>;
  escalateApp:        (id: string, reason: string) => Promise<void>;
  suspendUser:        (orgId: string, userId: string) => Promise<void>;
  toggleFeatureFlag:  (orgId: string, flagId: string) => Promise<void>;
}
