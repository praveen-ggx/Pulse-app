/**
 * Add personal owner vehicle — Phase 1b (no documents / no org).
 */
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { createOwnerVehicle } from '@/features/driver/services/ownerVehicles.service';
import { applyIndianVehicleKeystroke } from '@/lib/indianVehicleInput.util';
import { useDriverOperatingModeQuery } from '@/lib/queries/useDriverOperatingModeQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import { ROUTES } from '@/lib/routes';
import { validateIndianVehicleNumber } from '@/lib/validation';
import { VehicleTypeCatalogField } from '@/features/vehicles/components/VehicleTypeCatalogField';
import { passingTonRange } from '@/features/vehicles/utils/vehicleTypeCatalog.model';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FUEL_OPTIONS = ['Diesel', 'CNG', 'Petrol', 'Electric', 'Other'] as const;

export default function AddOwnerVehicleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const { canManageOwnerVehicles: canOwnVehicles } = useDriverOperatingModeQuery(uid);
  const { invalidate } = useOwnerVehiclesQuery(uid);

  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<string>('');
  const [capacity, setCapacity] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [fuelType, setFuelType] = useState<string>(FUEL_OPTIONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numberError = useMemo(
    () => validateIndianVehicleNumber(vehicleNumber),
    [vehicleNumber],
  );

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(ROUTES.driverMyFleet());
  }, [router]);

  const handleSave = useCallback(async () => {
    if (!uid || !canOwnVehicles) {
      setError('Approved DCO status required.');
      return;
    }
    const ve = validateIndianVehicleNumber(vehicleNumber);
    if (ve) {
      setError(ve);
      return;
    }
    if (!vehicleType.trim()) {
      setError('Select a vehicle type.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: createError, vehicle } = await createOwnerVehicle(uid, {
        vehicle_number: vehicleNumber,
        vehicle_type: vehicleType,
        capacity,
        vehicle_brand: brand,
        vehicle_model: model,
        fuel_type: fuelType,
      });
      if (createError || !vehicle) {
        setError(createError?.message ?? 'Could not add vehicle.');
        return;
      }
      invalidate();
      router.replace(
        ROUTES.driverMyFleetVehicle(vehicle.id) as Parameters<typeof router.replace>[0],
      );
    } finally {
      setBusy(false);
    }
  }, [
    uid,
    canOwnVehicles,
    vehicleNumber,
    vehicleType,
    capacity,
    brand,
    model,
    fuelType,
    invalidate,
    router,
  ]);

  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';
  const inputBg = isDark ? colors.surfaceElevated : '#f8fafc';

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader title="Add Vehicle" subtitle="Your personal fleet" onBack={handleBack} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
            paddingTop: 12,
            gap: 14,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Vehicle number</Text>
            <TextInput
              value={vehicleNumber}
              onChangeText={(t) => setVehicleNumber(applyIndianVehicleKeystroke(t))}
              placeholder="e.g. TN 18 D 2522"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              style={[
                styles.input,
                { color: colors.text, backgroundColor: inputBg, borderColor: cardBorder },
              ]}
            />
            {numberError && vehicleNumber.trim().length > 0 ? (
              <Text style={styles.fieldError}>{numberError}</Text>
            ) : null}

            <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>
              Vehicle type
            </Text>
            <VehicleTypeCatalogField
              value={vehicleType}
              tons={capacity}
              onChange={(value, passingTon) => {
                setVehicleType(value);
                // Passing ton → capacity when capacity is still empty.
                const max = passingTonRange(passingTon)?.max;
                if (max != null && !capacity.trim()) setCapacity(`${max}T`);
              }}
              style={[styles.input, { backgroundColor: inputBg, borderColor: cardBorder }]}
              textStyle={{ color: colors.text }}
            />

            <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>
              Capacity
            </Text>
            <TextInput
              value={capacity}
              onChangeText={setCapacity}
              placeholder="e.g. 4T / 16T"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.input,
                { color: colors.text, backgroundColor: inputBg, borderColor: cardBorder },
              ]}
            />

            <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>
              Make
            </Text>
            <TextInput
              value={brand}
              onChangeText={setBrand}
              placeholder="e.g. Tata"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.input,
                { color: colors.text, backgroundColor: inputBg, borderColor: cardBorder },
              ]}
            />

            <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>
              Model
            </Text>
            <TextInput
              value={model}
              onChangeText={setModel}
              placeholder="e.g. 407"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.input,
                { color: colors.text, backgroundColor: inputBg, borderColor: cardBorder },
              ]}
            />

            <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>
              Fuel type
            </Text>
            <View style={styles.chipWrap}>
              {FUEL_OPTIONS.map((label) => {
                const on = fuelType === label;
                return (
                  <Pressable
                    key={label}
                    onPress={() => setFuelType(label)}
                    style={[
                      styles.chip,
                      {
                        borderColor: on ? colors.emerald : cardBorder,
                        backgroundColor: on
                          ? isDark
                            ? colors.emeraldMuted
                            : 'rgba(167,243,208,0.45)'
                          : inputBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: on ? colors.emerald : colors.text },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            onPress={() => void handleSave()}
            disabled={busy || Boolean(numberError)}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: colors.emerald,
                opacity: pressed || busy || numberError ? 0.75 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={Theme.textOnPrimary} />
            ) : (
              <Text style={styles.ctaText}>Add Vehicle</Text>
            )}
          </Pressable>

          <Text style={[styles.footnote, { color: colors.textMuted }]}>
            Registers a vehicle on your DCO (owner-operator) profile only. It does not
            create trips or Business organization assets.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  fieldError: { marginTop: 6, color: Theme.negative, fontSize: 12, fontWeight: '600' },
  errorText: { color: Theme.negative, fontSize: 13, fontWeight: '600' },
  cta: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: Theme.textOnPrimary, fontSize: 15, fontWeight: '700' },
  footnote: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
