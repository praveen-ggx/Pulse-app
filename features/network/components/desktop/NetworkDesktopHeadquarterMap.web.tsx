import { LoadingIndicator } from "@/components/LoadingIndicator";
import { LeafletMap } from "@/components/driver/LeafletMap.web";
import {
  buildStaticMapImageUrl,
  isUsableMapCoordinate,
} from "@/features/chat/utils/staticMapUrl.util";
import type { OfficeMapCoordinate } from "@/features/network/hooks/useOrganizationOfficeMap";
import { networkDesktopHubStyles as styles } from "@/features/network/components/desktop/networkDesktopHub.styles";
import Theme from "@/constants/Theme";
import { MapPin } from "lucide-react-native";
import { useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

type Props = {
  orgName: string;
  addressLabel: string;
  coordinate: OfficeMapCoordinate | null;
  loading?: boolean;
};

export function NetworkDesktopHeadquarterMap({
  orgName,
  addressLabel,
  coordinate,
  loading = false,
}: Props) {
  const usableCoordinate =
    coordinate &&
    isUsableMapCoordinate(coordinate.latitude, coordinate.longitude)
      ? coordinate
      : null;

  const staticMapUrl = useMemo(() => {
    if (!usableCoordinate) return null;
    return buildStaticMapImageUrl(
      usableCoordinate.latitude,
      usableCoordinate.longitude,
      640,
      280,
    );
  }, [usableCoordinate]);

  const markers = useMemo(
    () =>
      usableCoordinate
        ? [
            {
              id: "headquarter",
              coordinate: usableCoordinate,
              label: orgName,
              color: "#50CD89",
            },
          ]
        : [],
    [usableCoordinate, orgName],
  );

  if (loading) {
    return (
      <View style={[styles.mapPlaceholder, styles.mapPlaceholderLoading]}>
        <LoadingIndicator color={Theme.primary} size="small" />
      </View>
    );
  }

  if (!usableCoordinate) {
    return (
      <View style={styles.mapPlaceholder}>
        <View style={styles.mapPinBubble}>
          <Text style={styles.mapPinBubbleText}>
            Registered office · {orgName}
          </Text>
          <Text style={styles.mapPinBubbleSub} numberOfLines={2}>
            {addressLabel}
          </Text>
        </View>
        <MapPin size={32} color="#50CD89" strokeWidth={2} />
      </View>
    );
  }

  return (
    <View style={styles.mapFrame}>
      {staticMapUrl ? (
        <Image
          source={{ uri: staticMapUrl }}
          style={styles.mapStaticImage}
          resizeMode="cover"
          accessibilityLabel={`Map showing ${orgName} headquarters`}
        />
      ) : (
        <LeafletMap
          style={StyleSheet.absoluteFill}
          center={usableCoordinate}
          zoom={14}
          markers={markers}
          showZoomControls={false}
          interactionLocked
        />
      )}
      <View style={styles.mapPinBubble} pointerEvents="none">
        <Text style={styles.mapPinBubbleText}>
          Registered office · {orgName}
        </Text>
        <Text style={styles.mapPinBubbleSub} numberOfLines={2}>
          {addressLabel}
        </Text>
      </View>
    </View>
  );
}
