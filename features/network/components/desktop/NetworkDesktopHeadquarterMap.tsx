import { LoadingIndicator } from "@/components/LoadingIndicator";
import { buildStaticMapImageUrl } from "@/features/chat/utils/staticMapUrl.util";
import type { OfficeMapCoordinate } from "@/features/network/hooks/useOrganizationOfficeMap";
import {
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import Theme from "@/constants/Theme";
import { MapPin } from "lucide-react-native";
import { Image, Text, View, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  orgName: string;
  addressLabel: string;
  coordinate: OfficeMapCoordinate | null;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function NetworkDesktopHeadquarterMap({
  orgName,
  addressLabel,
  coordinate,
  loading = false,
  style,
}: Props) {
  const staticUrl =
    coordinate != null
      ? buildStaticMapImageUrl(
          coordinate.latitude,
          coordinate.longitude,
          480,
          240,
        )
      : null;

  if (loading) {
    return (
      <View style={[styles.mapPlaceholder, styles.mapPlaceholderLoading, style]}>
        <LoadingIndicator color={Theme.primary} size="small" />
      </View>
    );
  }

  return (
    <View style={[staticUrl ? styles.mapFrame : styles.mapPlaceholder, style]}>
      {staticUrl ? (
        <Image
          source={{ uri: staticUrl }}
          style={styles.mapStaticImage}
          resizeMode="cover"
          accessibilityLabel={`Map for ${orgName} headquarters`}
        />
      ) : (
        <MapPin size={32} color="#50CD89" strokeWidth={2} />
      )}
      <View style={styles.mapPinBubble} pointerEvents="none">
        <Text style={styles.mapPinBubbleText} numberOfLines={2}>
          Registered office · {orgName}
        </Text>
        <Text style={styles.mapPinBubbleSub} numberOfLines={2}>
          {addressLabel}
        </Text>
      </View>
    </View>
  );
}
