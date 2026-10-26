import Theme from '@/constants/Theme';
import { StyleSheet, Text, View } from 'react-native';

type Badge = { kind: 'pickup' | 'drop' | 'other'; index: number };

type Props = {
  kind: 'pickup' | 'drop' | 'other';
  index: number;
  caption?: string;
  /** "+N next · Drop 2" hint for stacked stops. Not drawn yet. */
  nextLabel?: string | null;
  /** Pickup/drop numbers stacked under this pin. Not drawn yet. */
  badges?: ReadonlyArray<{ kind: 'pickup' | 'drop' | 'other'; index: number }>;
  emphasized?: boolean;
  /** Extra pins that share this coordinate, drawn beside the lead pin. */
  badges?: readonly Badge[];
  nextLabel?: string | null;
};

export function RoutePlanMapPin({ kind, index, caption, emphasized, badges, nextLabel }: Props) {
  const drop = kind === 'drop';
  const n = Number.isFinite(index) && index > 0 ? Math.min(99, Math.floor(index)) : 1;
  const label = caption ?? (drop ? `Drop ${n}` : kind === 'pickup' ? `Pickup ${n}` : `Stop ${n}`);
  const icons = badges && badges.length > 1 ? badges : [{ kind, index: n }];

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View
        style={[
          styles.chip,
          drop ? styles.chipDrop : styles.chipPickup,
          emphasized ? (drop ? styles.chipDropActive : styles.chipPickupActive) : null,
        ]}
      >
        <Text
          style={[styles.chipText, drop ? styles.chipTextDrop : styles.chipTextPickup]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {nextLabel ? (
        <Text style={styles.next} numberOfLines={1}>
          {nextLabel}
        </Text>
      ) : null}
      <View style={styles.iconRow}>
        {icons.map((badge) => {
          const badgeDrop = badge.kind === 'drop';
          const badgeN = Number.isFinite(badge.index) && badge.index > 0 ? Math.floor(badge.index) : 1;
          return (
            <View key={`${badge.kind}-${badgeN}`} style={styles.pin}>
              <View
                style={[
                  styles.head,
                  { backgroundColor: badgeDrop ? Theme.driverGold : Theme.driverEmerald },
                ]}
              >
                <Text style={styles.num}>{badgeN}</Text>
              </View>
              <View
                style={[
                  styles.tail,
                  { borderTopColor: badgeDrop ? Theme.driverGold : Theme.driverEmerald },
                ]}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 3,
  },
  chip: {
    maxWidth: 148,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: Theme.surfaceLight,
  },
  chipPickup: {
    borderColor: Theme.driverEmeraldBorder,
  },
  chipDrop: {
    borderColor: Theme.driverGold,
  },
  chipPickupActive: {
    borderColor: Theme.driverEmerald,
  },
  chipDropActive: {
    borderColor: Theme.driverGold,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  chipTextPickup: {
    color: Theme.driverEmerald,
  },
  chipTextDrop: {
    color: Theme.driverGold,
  },
  pin: {
    alignItems: 'center',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  next: {
    maxWidth: 148,
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMuted,
    backgroundColor: Theme.screenBackground,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  head: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: {
    color: Theme.screenBackground,
    fontSize: 10,
    fontWeight: '800',
  },
  tail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
