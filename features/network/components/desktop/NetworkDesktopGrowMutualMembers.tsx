/**
 * Grow network cards — named mutual connections with tappable avatars.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import { MutualConnectionsFacepile } from "@/features/network/components/MutualConnectionsFacepile";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { useMutualConnectionsQuery } from "@/lib/queries/useMutualConnectionsQuery";
import { Pressable, Text, View } from "react-native";

type Props = {
  viewerOrgId: string;
  targetOrgId: string;
  mutualCount: number;
  listLayout?: boolean;
  onPressMutual?: (org: MutualConnectionRow) => void;
  onPressViewAll?: () => void;
};

const PREVIEW_LIMIT_GRID = 2;
const PREVIEW_LIMIT_LIST = 3;

export function NetworkDesktopGrowMutualMembers({
  viewerOrgId,
  targetOrgId,
  mutualCount,
  listLayout = false,
  onPressMutual,
  onPressViewAll,
}: Props) {
  const canQuery = Boolean(viewerOrgId && targetOrgId);
  const { data: mutuals = [], isLoading } = useMutualConnectionsQuery(
    viewerOrgId,
    targetOrgId,
    mutualCount > 0 && canQuery,
  );

  if (mutualCount <= 0) return null;

  const previewLimit = listLayout ? PREVIEW_LIMIT_LIST : PREVIEW_LIMIT_GRID;
  const preview = mutuals.slice(0, previewLimit);
  const overflow = Math.max(0, mutualCount - preview.length);
  const avatarSize = listLayout ? 28 : 26;

  if (isLoading && preview.length === 0) {
    return (
      <View style={styles.growMutualMembersLoading}>
        <LoadingIndicator size={14} color={METRONIC.link} />
      </View>
    );
  }

  if (preview.length === 0) {
    return (
      <MutualConnectionsFacepile
        viewerOrgId={viewerOrgId}
        targetOrgId={targetOrgId}
        mutualCount={mutualCount}
        faceSize={avatarSize}
        showSectionLabel={false}
        compact
        onPressViewAll={onPressViewAll}
        onPressMutual={onPressMutual}
      />
    );
  }

  return (
    <View
      style={[
        styles.growMutualMembersCol,
        listLayout && styles.growMutualMembersColList,
      ]}
    >
      {preview.map((row) => (
        <Pressable
          key={row.id}
          onPress={(e) => {
            e.stopPropagation?.();
            onPressMutual?.(row);
          }}
          disabled={!onPressMutual}
          style={({ pressed }) => [
            styles.growMutualMemberRow,
            listLayout && styles.growMutualMemberRowList,
            pressed && onPressMutual && styles.growMutualMemberRowPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`View ${row.name} profile`}
        >
          <PartyAvatar
            name={row.name}
            initialsColorSeed={row.id}
            organizationImageUrl={row.avatar_url}
            avatarUrl={row.avatar_url}
            avatarSeed={row.avatar_seed ?? row.id}
            entityType="client"
            isIntegrated
            size={avatarSize}
          />
          <Text
            style={[
              styles.growMutualMemberName,
              listLayout && styles.growMutualMemberNameList,
            ]}
            numberOfLines={1}
          >
            {row.name}
          </Text>
        </Pressable>
      ))}
      {overflow > 0 && onPressViewAll ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onPressViewAll();
          }}
          hitSlop={6}
          style={({ pressed }) => [
            styles.growMutualMoreBtn,
            pressed && styles.growMutualMemberRowPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${overflow} more mutual connections`}
        >
          <Text style={styles.growMutualMoreText}>+{overflow} more</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
