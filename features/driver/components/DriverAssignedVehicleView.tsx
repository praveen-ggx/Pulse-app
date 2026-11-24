/**
 * Fleet-assigned vehicle technical detail (shared by DCO onboarding).
 */
import Theme from '@/constants/Theme';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import type { AssignedVehicleDisplay } from '@/features/driver/utils/driverAssignedVehicleDisplay.util';
import {
  Dna,
  Fuel,
  Gauge,
  Thermometer,
  Truck,
  Wrench,
} from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

const SLATE_900 = '#0f172a';

export function DriverAssignedVehicleView({
  vehicleDisplay,
}: {
  vehicleDisplay: AssignedVehicleDisplay;
}) {
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';
  const muted = colors.textMuted;

  return (
    <View style={styles.root}>
      <View style={styles.heroDark}>
        <View style={[styles.heroWatermark, { padding: 28 }]}>
          <Truck size={120} color="rgba(255,255,255,0.1)" />
        </View>
        <View style={styles.vehicleHeroTop}>
          <View style={styles.fleetBadge}>
            <Text style={styles.fleetBadgeText}>{vehicleDisplay.fleetId}</Text>
          </View>
          <View style={styles.connectedRow}>
            <View style={styles.pulseDot} />
            <Text style={styles.connectedText}>Connected</Text>
          </View>
        </View>
        <Text style={styles.vehicleModel}>{vehicleDisplay.model}</Text>
        <Text style={styles.vehiclePlate}>{vehicleDisplay.plate}</Text>
        <View style={styles.vehicleGrid2}>
          <View style={styles.vehicleStatDark}>
            <Text style={styles.vehicleStatLabel}>ASSIGNED ON</Text>
            <Text style={styles.vehicleStatValue}>{vehicleDisplay.assignedOn}</Text>
          </View>
          <View style={styles.vehicleStatDark}>
            <Text style={styles.vehicleStatLabel}>SUPERVISOR</Text>
            <Text style={styles.vehicleStatValue}>{vehicleDisplay.supervisor}</Text>
          </View>
        </View>
      </View>

      <View style={styles.triGaugeRow}>
        <View style={[styles.gaugeCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
          <Fuel size={20} color={Theme.driverEmerald} />
          <Text style={[styles.gaugeVal, { color: colors.text }]}>{vehicleDisplay.fuel}</Text>
          <Text style={[styles.gaugeLbl, { color: muted }]}>FUEL</Text>
        </View>
        <View style={[styles.gaugeCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
          <Gauge size={20} color="#3b82f6" />
          <Text style={[styles.gaugeVal, { color: colors.text }]}>{vehicleDisplay.odometer}</Text>
          <Text style={[styles.gaugeLbl, { color: muted }]}>KM</Text>
        </View>
        <View style={[styles.gaugeCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
          <Thermometer size={20} color="#f43f5e" />
          <Text style={[styles.gaugeVal, { color: colors.text }]}>{vehicleDisplay.engineTemp}</Text>
          <Text style={[styles.gaugeLbl, { color: muted }]}>TEMP</Text>
        </View>
      </View>

      <View style={[styles.whiteCardLg, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
        <View style={styles.cardHeadRow}>
          <Dna size={16} color={muted} />
          <Text style={[styles.cardHeadTitle, { color: muted }]}>TECH SPECS</Text>
        </View>
        {vehicleDisplay.specs.map((spec, i) => (
          <View
            key={spec.label}
            style={[styles.specRow, i < vehicleDisplay.specs.length - 1 && styles.specRowBorder]}
          >
            <Text style={[styles.specLabel, { color: muted }]}>{spec.label}</Text>
            <Text style={[styles.specValue, { color: colors.text }]}>{spec.value}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.whiteCardLg, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
        <View style={styles.cardHeadRow}>
          <Wrench size={16} color={muted} />
          <Text style={[styles.cardHeadTitle, { color: muted }]}>HEALTH DIAGNOSTICS</Text>
        </View>
        {vehicleDisplay.health.map((h) => (
          <View
            key={h.label}
            style={[styles.healthRow, { backgroundColor: isDark ? colors.surfaceElevated : '#f8fafc' }]}
          >
            <Text style={[styles.healthLabel, { color: colors.text }]}>{h.label}</Text>
            <Text style={[styles.healthValue, { color: h.color }]}>{h.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, paddingBottom: 8 },
  heroDark: {
    backgroundColor: SLATE_900,
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
  },
  heroWatermark: { position: 'absolute', top: 0, right: 0, padding: 16 },
  vehicleHeroTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  fleetBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  fleetBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 1.2 },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pulseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.driverEmerald },
  connectedText: { fontSize: 10, fontWeight: '600', color: Theme.driverPrimary },
  vehicleModel: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  vehiclePlate: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(148,163,184,0.95)',
    letterSpacing: 2,
  },
  vehicleGrid2: { flexDirection: 'row', gap: 10, marginTop: 14 },
  vehicleStatDark: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  vehicleStatLabel: {
    fontSize: 10,
    color: 'rgba(148,163,184,0.85)',
    fontWeight: '600',
    marginBottom: 4,
  },
  vehicleStatValue: { fontSize: 12, fontWeight: '700', color: '#fff' },
  triGaugeRow: { flexDirection: 'row', gap: 8 },
  gaugeCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  gaugeVal: { fontSize: 16, fontWeight: '800' },
  gaugeLbl: { fontSize: 8, fontWeight: '700', letterSpacing: 1.2 },
  whiteCardLg: { borderRadius: 16, padding: 14, borderWidth: 1 },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardHeadTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  specRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(226,232,240,0.8)',
  },
  specLabel: { fontSize: 12, fontWeight: '600' },
  specValue: { fontSize: 12, fontWeight: '700' },
  healthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
  },
  healthLabel: { fontSize: 12, fontWeight: '600' },
  healthValue: { fontSize: 10, fontWeight: '700' },
});
