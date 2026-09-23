/**
 * Shared Find Work card — Reach sponsored loads and Marketplace bids.
 */
import { PartyAvatar } from '@/components/PartyAvatar';
import Theme from '@/constants/Theme';
import { splitLocationParts } from '@/features/network/utils/storyDisplay';
import { withWebSafeShadows } from '@/lib/platformViewStyle.util';
import { ArrowRight, Calendar, Package, Truck } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type WorkOpportunityBadge = 'boosted' | 'open' | 'awarded' | 'quoted' | null;

export type WorkOpportunityPrimaryCta = {
  title: string;
  hint?: string | null;
  onPress: () => void;
  variant?: 'primary' | 'quoted' | 'info';
};

function formatPickupChip(iso?: string | null): string | null {
  const raw = (iso ?? '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function DriverWorkOpportunityCard({
  orgName,
  orgLogoUrl,
  orgAvatarSeed,
  orgSeed,
  kicker,
  badge,
  origin,
  destination,
  vehicleType,
  material,
  pickupDate,
  fleetMatch,
  targetLabel,
  targetValue,
  extra,
  primaryCta,
  secondaryCta,
}: {
  orgName: string;
  orgLogoUrl?: string | null;
  orgAvatarSeed?: string | null;
  orgSeed?: string | null;
  kicker: string;
  badge?: WorkOpportunityBadge;
  origin?: string | null;
  destination?: string | null;
  vehicleType?: string | null;
  material?: string | null;
  pickupDate?: string | null;
  fleetMatch?: boolean;
  targetLabel?: string | null;
  targetValue?: string | null;
  extra?: ReactNode;
  primaryCta?: WorkOpportunityPrimaryCta | null;
  secondaryCta?: { title: string; onPress: () => void } | null;
}) {
  const pickupCity = splitLocationParts(origin).city;
  const dropCity = splitLocationParts(destination).city;
  const pickup = pickupCity && pickupCity !== '—' ? pickupCity : 'Pickup';
  const drop = dropCity && dropCity !== '—' ? dropCity : 'Drop';
  const vehicle = vehicleType?.trim() || null;
  const goods = material?.trim() || null;
  const dateLabel = formatPickupChip(pickupDate);
  const badgeLabel =
    badge === 'boosted'
      ? 'Boosted'
      : badge === 'open'
        ? 'Market'
        : badge === 'awarded'
          ? 'Awarded'
          : badge === 'quoted'
            ? 'Quoted'
            : null;

  return (
    <View style={[styles.card, badge === 'awarded' && styles.cardAwarded]}>
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={styles.orgRow}>
            <PartyAvatar
              name={orgName || 'Shipper'}
              initialsColorSeed={orgSeed ?? orgName}
              organizationImageUrl={orgLogoUrl}
              organizationAvatarSeed={orgAvatarSeed}
              entityType="client"
              size={32}
              shape="rounded"
            />
            <View style={styles.orgText}>
              <Text style={styles.orgName} numberOfLines={1}>
                {orgName || 'Shipper'}
              </Text>
              <Text style={[styles.kicker, badge === 'awarded' && styles.kickerAwarded]}>
                {kicker}
              </Text>
            </View>
          </View>
          {badgeLabel ? (
            <View
              style={[
                styles.badge,
                badge === 'awarded' ? styles.badgeAwarded : styles.badgeBoosted,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  badge === 'awarded' && styles.badgeTextAwarded,
                ]}
              >
                {badgeLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.routeBlock}>
          <View style={styles.routeCityCol}>
            <Text style={styles.routeCity} numberOfLines={1}>
              {pickup}
            </Text>
            <Text style={styles.routeMeta}>Pickup</Text>
          </View>
          <View style={styles.routeArrowWrap}>
            <ArrowRight size={13} color={Theme.textMuted} strokeWidth={2.2} />
          </View>
          <View style={[styles.routeCityCol, styles.routeCityColEnd]}>
            <Text style={[styles.routeCity, styles.routeCityEnd]} numberOfLines={1}>
              {drop}
            </Text>
            <Text style={[styles.routeMeta, styles.routeMetaEnd]}>Drop</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          {vehicle ? (
            <View style={styles.metaItem}>
              <Truck size={11} color={Theme.textMuted} strokeWidth={2} />
              <Text style={styles.metaText} numberOfLines={1}>
                {vehicle}
              </Text>
            </View>
          ) : null}
          {goods ? (
            <View style={styles.metaItem}>
              <Package size={11} color={Theme.textMuted} strokeWidth={2} />
              <Text style={styles.metaText} numberOfLines={1}>
                {goods}
              </Text>
            </View>
          ) : null}
          {fleetMatch ? (
            <View style={styles.matchPill}>
              <Text style={styles.matchPillText}>Fleet match</Text>
            </View>
          ) : null}
          {dateLabel ? (
            <View
              style={styles.dateChip}
              accessibilityLabel={`Pickup ${dateLabel}`}
            >
              <Calendar size={11} color={Theme.textMuted} strokeWidth={2} />
              <Text style={styles.dateChipText} numberOfLines={1}>
                {dateLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {targetLabel && targetValue ? (
          <View style={styles.targetRow}>
            <Text style={styles.targetLabel}>{targetLabel}</Text>
            <Text style={styles.targetValue}>{targetValue}</Text>
          </View>
        ) : null}

        {extra}
      </View>

      {primaryCta || secondaryCta ? (
        <View style={styles.actionsRow}>
          {primaryCta ? (
            <View style={styles.actionPrimary}>
              {primaryCta.variant === 'info' ? (
                <View style={styles.infoPill}>
                  <Text style={styles.infoPillText}>{primaryCta.title}</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={primaryCta.variant === 'quoted' ? styles.quotedBtn : styles.ctaBtn}
                  activeOpacity={0.88}
                  onPress={primaryCta.onPress}
                >
                  <Text
                    style={primaryCta.variant === 'quoted' ? styles.quotedBtnText : styles.ctaBtnText}
                    numberOfLines={1}
                  >
                    {primaryCta.title}
                  </Text>
                  {primaryCta.hint ? (
                    <Text
                      style={
                        primaryCta.variant === 'quoted' ? styles.quotedBtnHint : styles.ctaBtnHint
                      }
                      numberOfLines={1}
                    >
                      {primaryCta.hint}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              )}
            </View>
          ) : null}
          {secondaryCta ? (
            <TouchableOpacity
              style={styles.fullViewBtn}
              activeOpacity={0.88}
              onPress={secondaryCta.onPress}
              accessibilityRole="button"
              accessibilityLabel={secondaryCta.title}
            >
              <Text style={styles.fullViewBtnText}>{secondaryCta.title}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// withWebSafeShadows maps over a STYLE SHEET (Record<string, AnyStyle>), so it
// wraps StyleSheet.create — not an individual entry. Wrapping one entry passed
// that entry's own properties as if they were styles, typing each as AnyStyle.
const styles = withWebSafeShadows(
  StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d7dee8',
    padding: 12,
    gap: 10,
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  cardAwarded: {
    borderColor: Theme.darkGreen,
    borderWidth: 1,
    backgroundColor: Theme.positiveMuted,
  },
  body: { gap: 10 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  orgRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  orgText: { flex: 1, minWidth: 0, gap: 1 },
  orgName: { fontSize: 12, fontWeight: '700', color: Theme.textPrimaryDark },
  kicker: {
    fontSize: 9,
    fontWeight: '600',
    color: Theme.textMuted,
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  kickerAwarded: { color: Theme.darkGreen, fontWeight: '700' },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    flexShrink: 0,
  },
  badgeBoosted: { backgroundColor: Theme.accentBrown },
  badgeAwarded: {
    borderRadius: 4,
    backgroundColor: Theme.positiveMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.darkGreen,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.textOnPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  badgeTextAwarded: { color: Theme.darkGreen },
  routeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  routeCityCol: { flex: 1, minWidth: 0, gap: 1 },
  routeCityColEnd: { alignItems: 'flex-end' },
  routeCity: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  routeCityEnd: { textAlign: 'right' },
  routeMeta: {
    fontSize: 9,
    fontWeight: '600',
    color: Theme.textMuted,
    letterSpacing: 0.25,
    textTransform: 'uppercase',
  },
  routeMetaEnd: { textAlign: 'right' },
  routeArrowWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '42%',
  },
  metaText: { fontSize: 11, fontWeight: '500', color: Theme.textSecondary },
  matchPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.positiveMuted,
    flexShrink: 0,
  },
  matchPillText: { fontSize: 9, fontWeight: '700', color: Theme.success },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
  },
  dateChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
    lineHeight: 13,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  targetLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textMuted,
    letterSpacing: 0.15,
  },
  targetValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  actionPrimary: { flex: 1, minWidth: 0, justifyContent: 'center' },
  ctaBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  ctaBtnText: { fontSize: 12, fontWeight: '700', color: Theme.buttonPrimaryText },
  ctaBtnHint: {
    fontSize: 9,
    fontWeight: '600',
    color: Theme.buttonPrimaryText,
    opacity: 0.75,
  },
  quotedBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  quotedBtnText: { fontSize: 12, fontWeight: '700', color: Theme.textPrimaryDark },
  quotedBtnHint: { fontSize: 9, fontWeight: '600', color: Theme.textMuted },
  infoPill: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  infoPillText: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    color: Theme.textMuted,
  },
  fullViewBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  fullViewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
}),
);
