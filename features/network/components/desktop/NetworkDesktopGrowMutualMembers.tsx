/**
 * Grow network cards — mutual count facepile.
 * Per-org RPC resolution is deferred to MutualConnectionsModal / profile.
 */
import { MutualConnectionsFacepile } from "@/features/network/components/MutualConnectionsFacepile";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";

type Props = {
  viewerOrgId: string;
  targetOrgId: string;
  mutualCount: number;
  listLayout?: boolean;
  onPressMutual?: (org: MutualConnectionRow) => void;
  onPressViewAll?: () => void;
};

export function NetworkDesktopGrowMutualMembers({
  viewerOrgId,
  targetOrgId,
  mutualCount,
  listLayout = false,
  onPressMutual,
  onPressViewAll,
}: Props) {
  if (mutualCount <= 0) return null;

  return (
    <MutualConnectionsFacepile
      viewerOrgId={viewerOrgId}
      targetOrgId={targetOrgId}
      mutualCount={mutualCount}
      faceSize={listLayout ? 28 : 26}
      showSectionLabel={false}
      compact
      onPressViewAll={onPressViewAll}
      onPressMutual={onPressMutual}
    />
  );
}
