import { DriverCapturePaymentButton } from '@/features/drivers/components/DriverCapturePaymentButton';
import { resolveDriverOrgAvatarUri } from '@/features/drivers/utils/resolveDriverOrgAvatar.util';
import { useOrgBrandingByIds } from '@/lib/hooks/useOrgBrandingByIds';
import { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { PendingEarningsTripItem } from '../hooks/useDriverPendingEarnings';

type Colors = {
  text: string;
  textMuted: string;
  emerald: string;
  emeraldMuted: string;
  borderSubtle: string;
  surfaceElevated: string;
};

type Props = {
  item: PendingEarningsTripItem;
  colors: Colors;
  cardBg: string;
  isDark: boolean;
  onPress: () => void;
};

export function PendingEarningsTripCard({
  item,
  colors,
  cardBg,
  isDark,
  onPress,
}: Props) {
  const orgId = String(item.trip.organization_id ?? '');
  const brandingById = useOrgBrandingByIds([orgId]);
  const fleetAvatarUri = useMemo(
    () =>
      resolveDriverOrgAvatarUri({
        orgId,
        orgName: item.provider,
        branding: brandingById[orgId],
        logoUrl: item.organizationImageUrl,
        avatarSeed: item.organizationAvatarSeed,
        avatarUrl: item.organizationAvatarUrl,
      }),
    [
      orgId,
      item.provider,
      brandingById,
      item.organizationImageUrl,
      item.organizationAvatarSeed,
      item.organizationAvatarUrl,
    ],
  );

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.9)',
          shadowColor: isDark ? '#000' : 'rgba(15,23,42,0.10)',
        },
      ]}
    >
      <TouchableOpacity style={styles.cardInner} activeOpacity={0.82} onPress={onPress}>
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: isDark
                    ? colors.surfaceElevated
                    : 'rgba(248,250,252,0.92)',
                },
              ]}
            >
              <Image source={{ uri: fleetAvatarUri }} style={styles.iconImage} resizeMode="cover" />
            </View>
            <View style={styles.headText}>
              <Text style={[styles.tripId, { color: colors.text }]} numberOfLines={1}>
                {item.displayId}
              </Text>
              <View style={styles.metaRow}>
                <Text style={[styles.metaText, { color: colors.textMuted }]}>{item.time}</Text>
                <Text style={[styles.metaDot, { color: colors.emerald }]}>•</Text>
                <Text style={[styles.metaText, { color: colors.textMuted }]} numberOfLines={1}>
                  {item.provider}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.amountCol}>
            <Text style={[styles.amount, { color: colors.text }]}>
              ₹{Math.round(item.amount).toLocaleString('en-IN')}
            </Text>
            {item.expectedAmount > 0 && item.expectedAmount !== item.amount ? (
              <Text style={[styles.amountSub, { color: colors.textMuted }]}>
                of ₹{Math.round(item.expectedAmount).toLocaleString('en-IN')}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.routeBlock, { borderTopColor: isDark ? colors.borderSubtle : '#f1f5f9' }]}>
          <View style={styles.routeRow}>
            <Text style={[styles.routeLabel, { color: colors.textMuted }]}>From</Text>
            <Text style={[styles.routeValue, { color: colors.text }]} numberOfLines={2}>
              {item.from || '—'}
            </Text>
          </View>
          <View style={styles.routeRow}>
            <Text style={[styles.routeLabel, { color: colors.textMuted }]}>To</Text>
            <Text style={[styles.routeValue, { color: colors.text }]} numberOfLines={2}>
              {item.to || '—'}
            </Text>
          </View>
        </View>

      </TouchableOpacity>
      <View
        style={[
          styles.footer,
          {
            borderTopColor: isDark ? colors.borderSubtle : '#f1f5f9',
            paddingHorizontal: 12,
            paddingBottom: 10,
          },
        ]}
      >
        <Text style={[styles.statusPill, styles.statusPending]} numberOfLines={1}>
          {item.statusLabel.toUpperCase()}
        </Text>
        <DriverCapturePaymentButton
          tripId={item.trip.id}
          due={Math.round(item.amount)}
          lane="fleet"
          partyName={item.provider}
          compact
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardInner: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  topLeft: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  headText: {
    flex: 1,
    minWidth: 0,
  },
  tripId: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  metaText: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  metaDot: {
    fontSize: 8,
    fontWeight: '400',
  },
  amountCol: {
    alignItems: 'flex-end',
    flexShrink: 0,
    paddingTop: 1,
  },
  amount: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  amountSub: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: 1,
    textAlign: 'right',
  },
  routeBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  routeLabel: {
    width: 34,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingTop: 2,
  },
  routeValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  statusPill: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
  },
  statusPending: {
    color: '#d97706',
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.28)',
  },
});
