import type { PartyEntityType } from "@/lib/partyAvatarDisplay";

export type RegistryNotificationAvatar = {
  name: string;
  entityType?: PartyEntityType;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  initialsColorSeed?: string | null;
};
