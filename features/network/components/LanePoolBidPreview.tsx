import Theme from "@/constants/Theme";
import { previewStandingLaneBids } from "@/features/network/services/standingLaneBids.service";
import {
  standingLaneBidLines,
  standingLaneBidNotice,
} from "@/features/network/utils/standingLaneBids.util";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";

export function LanePoolBidPreview({
  pickup,
  drop,
  vehicleType,
  marketplaceOn,
}: {
  pickup: string;
  drop: string;
  vehicleType: string;
  marketplaceOn: boolean;
}) {
  const ready = Boolean(pickup.trim() && drop.trim() && vehicleType.trim());
  const previewQ = useQuery({
    queryKey: ["marketplace", "standing-lane-bids", pickup.trim(), drop.trim(), vehicleType.trim()],
    queryFn: async () => {
      const { error, bids } = await previewStandingLaneBids(pickup, drop, vehicleType);
      if (error) throw error;
      return bids;
    },
    enabled: ready,
    staleTime: 30_000,
  });
  const notice = standingLaneBidNotice(previewQ.data ?? [], marketplaceOn);
  if (!ready || !notice) return null;
  const lines = standingLaneBidLines(previewQ.data ?? []);

  return (
    <View style={styles.card}>
      <Text style={styles.notice}>{notice}</Text>
      {lines.map((line) => (
        <Text key={line} style={styles.line} numberOfLines={1}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Theme.brandBlueSoft,
  },
  notice: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: Theme.primaryText,
  },
  line: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
});
