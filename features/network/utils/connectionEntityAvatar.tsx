import { EntityAvatar } from "@/components/EntityAvatar";
import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";

export function entityTypeForConnectionRole(
  role: ConnectedOrg["role"],
): PartyEntityType {
  if (role === "DRIVER") return "driver";
  if (role === "SUPPLIER") return "supplier";
  return "client";
}

/** Network connection row avatar — same hierarchy as finance ledger (`EntityAvatar` / `PartyAvatar`). */
export function ConnectionEntityAvatar({
  item,
  size,
  showIntegrationBadge = true,
}: {
  item: Pick<
    ConnectedOrg,
    "name" | "role" | "avatar_url" | "avatar_seed" | "is_integrated"
  >;
  size: number;
  showIntegrationBadge?: boolean;
}) {
  return (
    <EntityAvatar
      name={item.name}
      organizationImageUrl={item.avatar_url}
      avatarUrl={item.avatar_url}
      avatarSeed={item.avatar_seed}
      entityType={entityTypeForConnectionRole(item.role)}
      isIntegrated={item.is_integrated}
      size={size}
      showIntegrationBadge={showIntegrationBadge}
    />
  );
}
