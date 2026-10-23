/** Current org shape for list/detail screens. Aligned with pulse-unified-base. */
export interface CurrentOrganization {
  id: string;
  name: string;
  /** Organization branding logo (storage path or http URL). Priority: logo_url → owner avatar → initials. */
  logo_url?: string | null;
  operatingModel?: 'ASSET_BASED' | 'NON_ASSET' | 'HYBRID';
  sourcingStrategy?: string;
  marketplaceEnabled?: boolean;
  capabilities?: {
    canPostIndent: boolean;
    canBid: boolean;
    canManageAssets: boolean;
    canUseMarketplace: boolean;
  };
}

export type OrgMemberRole =
  | 'owner'
  | 'admin'
  | 'member'
  | 'dispatcher'
  | 'finance'
  | 'driver';
export type OrgMemberStatus = 'active' | 'inactive' | 'pending';

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgMemberRole;
  status: OrgMemberStatus;
  permissions: Record<string, unknown>;
  joined_at: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  company_name?: string | null;
}

export interface UserProfileForInvite {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string | null;
}

export interface TeamInvite {
  id: string;
  organization_id: string;
  role: OrgMemberRole;
  joined_at: string;
  org_name: string;
}

/** Admin invite for someone without a Pulse account yet (phone-only). */
export interface PendingPhoneTeamInvite {
  id: string;
  organization_id: string;
  invitee_name: string;
  invitee_phone: string;
  invitee_email?: string | null;
  role: OrgMemberRole;
  permissions: Record<string, unknown>;
  status: 'pending';
  created_at: string;
  expires_at: string;
  /** Email on invite matches an existing Pulse account — signup path is invalid. */
  email_conflict?: boolean;
  conflict_org_names?: string[];
}

export type OrgTeamRoster = {
  members: OrgMember[];
  pendingPhoneInvites: PendingPhoneTeamInvite[];
};

// ─── Workspace KYC ────────────────────────────────────────────────────────────

export type KycVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export type RegistrationType =
  | 'individual'
  | 'proprietorship'
  | 'llp'
  | 'pvt_ltd'
  | 'public_ltd'
  | 'partnership';
export type AddressProofType = 'lease' | 'utility_bill' | 'other';

export interface WorkspaceKyc {
  id: string;
  name: string;
  logo_url: string | null;
  business_pan: string | null;
  gstin: string | null;
  gst_not_applicable: boolean;
  cin: string | null;
  msme_number: string | null;
  tan_number: string | null;
  iec_number: string | null;
  // Sprint 1: verification pipeline
  registration_type: RegistrationType | null;
  /** Signup-time business type on organizations; fallback source for registration_type. */
  business_type: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  address_pincode: string | null;
  /** Signup-time pincode on organizations; fallback when address_pincode is unset. */
  pincode: string | null;
  address_proof_path: string | null;
  address_proof_type: AddressProofType | null;
  frozen_at: string | null;
  submitted_at: string | null;
  verification_status: KycVerificationStatus;
  verified_at: string | null;
  kyc_rejected_reason: string | null;
  rejection_reasons: { checklist: string[]; notes: string } | null;
}

/** True when the profile is locked and mobile fields must be read-only. */
export function isVerificationFrozen(status: KycVerificationStatus): boolean {
  return status === 'pending' || status === 'verified';
}
