import type { ConnectionRequestRow } from '@/features/connections/services/connectionRequests.service';

export type InboundPartnerDisplay = {
  organizationName: string;
  contactPerson: string;
  phone: string;
  /** organizations.logo_url — preferred for connection invite hero. */
  logoUrl?: string;
  /** Owner profile photo (not used in invite hero). */
  ownerAvatarUrl?: string;
  /** organizations.avatar_seed — org branding preset fallback. */
  orgAvatarSeed?: string;
  /** Resolved display URI (logo → owner photo → seed preset). */
  avatarUrl?: string;
  avatarSeed?: string;
  /** Partner org owner (from SECURITY DEFINER batch RPC; not readable via RLS SELECT). */
  ownerId?: string;
  orgCreatedAt?: string;
  tripCount?: number;
  averageRating?: number | null;
  ratingCount?: number;
  /** Admin KYC status from partner display RPC. */
  verificationStatus?: string | null;
};

export type InboundProtocolInviteItem = {
  id: string;
  name: string;
  /** Secondary line (phone, duplicate-contact hint). */
  subtitle?: string;
  type: string;
  partnerOrgId: string;
  /** Owner of the partner org — used to collapse duplicate-contact invites. */
  partnerOwnerId?: string;
  /** All pending request ids for this contact (recall withdraws every row). */
  linkedRequestIds?: string[];
  avatarUri: string | null;
  /** organizations.logo_url when available (hero uses logo before owner photo). */
  logoUrl?: string | null;
  ownerAvatarUrl?: string | null;
  /** Partner org owner display name (who sent the invite). */
  contactPerson?: string | null;
  senderAvatarSeed?: string | null;
  orgAvatarSeed?: string | null;
  orgCreatedAt?: string | null;
  tripCount?: number | null;
  averageRating?: number | null;
  ratingCount?: number | null;
  /** Admin KYC status for Verified / Not verified tags. */
  verificationStatus?: string | null;
  createdAt: string;
  /** Distinguishes org connection requests from fleet driver invitations. */
  kind?: 'connection' | 'driver';
  /** Driver invites (sent tab): pending | countered (driver asked changes) | rejected. */
  driverInviteStatus?: 'pending' | 'countered' | 'rejected';
  /** Driver invites: the inviting org (to refresh its sent list after an action). */
  fromOrgId?: string | null;
};

export type InboundProtocolSnapshot = {
  connectionRequestsReceived: ConnectionRequestRow[];
  connectionRequestsSent: ConnectionRequestRow[];
  partnerDisplayByOrgId: Record<string, InboundPartnerDisplay>;
  partnerAvatarUriByOrgId: Record<string, string | null>;
  partnerOwnerIdByOrgId: Record<string, string>;
};
