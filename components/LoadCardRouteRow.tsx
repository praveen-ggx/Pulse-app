import Theme from "@/constants/Theme";
import { splitHubRouteLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const REF = {
  ink: "#1c1c1e",
  muted: "#9aa3ad",
} as const;

const ROUTE_PIN_SIZE = 8;
/** City line box — pins + arrow share this so the mid glyph sits on the city axis. */
const CITY_LINE = 15;
const CITY_LINE_COMPACT = 13;

export type LoadCardRouteRowProps = {
  origin: string;
  destination: string;
  /** Merged with the root row (e.g. margin overrides). */
  style?: StyleProp<ViewStyle>;
  /** Tighter type scale for hub grid / dense cards (matches trip ticket cards). */
  compact?: boolean;
};

function asRouteLabel(value: string): string {
  const t = (value || "—").trim();
  return t ? t.toUpperCase() : "—";
}

function RoutePin({ variant }: { variant: "origin" | "dest" }) {
  return (
    <View
      style={[
        styles.routePin,
        variant === "origin" ? styles.routePinOrigin : styles.routePinDest,
      ]}
    />
  );
}

function RouteLeg({
  location,
  variant,
  align,
  compact,
}: {
  location: string;
  variant: "origin" | "dest";
  align: "left" | "right";
  compact?: boolean;
}) {
  const { city, state } = splitHubRouteLocationDisplay(location);
  const end = align === "right";
  const cityLine = compact ? CITY_LINE_COMPACT : CITY_LINE;

  return (
    <View style={[styles.leg, end && styles.legEnd]}>
      <View style={[styles.legCityRow, end && styles.legCityRowEnd, { minHeight: cityLine }]}>
        <RoutePin variant={variant} />
        <Text
          style={[
            styles.legCity,
            compact && styles.legCityCompact,
            end && styles.textEnd,
            { lineHeight: cityLine },
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {asRouteLabel(city)}
        </Text>
      </View>
      <Text
        style={[
          styles.legState,
          compact && styles.legStateCompact,
          end && styles.textEnd,
          !state && styles.legStatePlaceholder,
          // Indent state under city so it clears the pin column on both sides.
          end ? styles.legStateEnd : styles.legStateStart,
        ]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {state ? asRouteLabel(state) : "\u00a0"}
      </Text>
    </View>
  );
}

/**
 * Origin → destination row used on Load Center cards and indent detail.
 * Aligned with `TripsHubMobileTripCard` route leg typography.
 */
export function LoadCardRouteRow({
  origin,
  destination,
  style,
  compact,
}: LoadCardRouteRowProps) {
  const cityLine = compact ? CITY_LINE_COMPACT : CITY_LINE;

  return (
    <View style={[styles.row, compact && styles.rowCompact, style]}>
      <RouteLeg location={origin} variant="origin" align="left" compact={compact} />
      <View style={[styles.routeMid, { height: cityLine }]}>
        <Text style={[styles.routeArrow, { lineHeight: cityLine, fontSize: compact ? 14 : 16 }]}>
          →
        </Text>
      </View>
      <RouteLeg
        location={destination}
        variant="dest"
        align="right"
        compact={compact}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginBottom: 8,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
    zIndex: 1,
  },
  rowCompact: {
    minHeight: 30,
    marginBottom: 0,
    gap: 3,
  },
  leg: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: "48%",
    overflow: "hidden",
  },
  legEnd: {
    alignItems: "flex-end",
  },
  legCityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    width: "100%",
  },
  legCityRowEnd: {
    flexDirection: "row-reverse",
    justifyContent: "flex-start",
  },
  routePin: {
    width: ROUTE_PIN_SIZE,
    height: ROUTE_PIN_SIZE,
    borderRadius: ROUTE_PIN_SIZE / 2,
    flexShrink: 0,
  },
  routePinOrigin: {
    backgroundColor: "#1a73e8",
  },
  routePinDest: {
    backgroundColor: Theme.positive,
  },
  legCity: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: REF.ink,
    letterSpacing: 0,
    textTransform: "uppercase",
    ...Platform.select({
      web: { width: "100%", whiteSpace: "pre-wrap" } as ViewStyle,
      default: {},
    }),
  },
  legCityCompact: {
    fontSize: 10,
  },
  legState: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "400",
    color: REF.muted,
    lineHeight: 12,
    width: "100%",
    letterSpacing: 0,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as ViewStyle,
      default: {},
    }),
  },
  legStateStart: {
    paddingLeft: ROUTE_PIN_SIZE + 6,
  },
  legStateEnd: {
    paddingRight: ROUTE_PIN_SIZE + 6,
    textAlign: "right",
  },
  legStateCompact: {
    fontSize: 8,
    lineHeight: 11,
  },
  legStatePlaceholder: {
    opacity: 0,
  },
  textEnd: {
    textAlign: "right",
  },
  routeMid: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  routeArrow: {
    fontWeight: "300",
    color: REF.muted,
    textAlign: "center",
    includeFontPadding: false,
  },
});
