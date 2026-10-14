import Theme from '@/constants/Theme';
import { VehicleTypeCatalogField } from '@/features/vehicles/components/VehicleTypeCatalogField';
import { createVehicle } from '@/features/vehicles/services/vehicles.service';
import { formatIndianVehicleNumber } from '@/lib/format';
import { applyIndianVehicleKeystroke } from '@/lib/indianVehicleInput.util';
import { useInvalidateVehicles } from '@/lib/queries/useVehiclesQuery';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { reassignStyles as s } from './reassign.styles';

type Props = {
  organizationId: string;
  onCreated: (vehicleId: string) => void;
};

export function AddVehicleForm({ organizationId, onCreated }: Props) {
  const invalidateVehicles = useInvalidateVehicles();
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const plate = formatIndianVehicleNumber(vehicleNumber).trim();
    if (!plate) {
      setError('Enter vehicle registration number.');
      return;
    }
    if (!vehicleType.trim()) {
      setError('Select a vehicle type.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: createErr, vehicle } = await createVehicle(organizationId, {
      vehicleSource: 'organization',
      vehicle_number: plate,
      vehicle_type: vehicleType,
      documents: {},
    });
    setSaving(false);
    if (createErr || !vehicle) {
      setError(createErr?.message ?? 'Could not add vehicle.');
      return;
    }
    invalidateVehicles(organizationId);
    onCreated(vehicle.id);
  }, [vehicleNumber, vehicleType, organizationId, invalidateVehicles, onCreated]);

  return (
    <View style={s.form}>
      <View>
        <Text style={s.label}>Registration</Text>
        <TextInput
          style={s.input}
          value={vehicleNumber}
          onChangeText={(t) => setVehicleNumber(applyIndianVehicleKeystroke(t))}
          placeholder="e.g. TN 18 D 2522"
          placeholderTextColor={Theme.textMuted}
          autoCapitalize="characters"
        />
      </View>
      <View>
        <Text style={s.label}>Type</Text>
        <VehicleTypeCatalogField
          value={vehicleType}
          onChange={(value) => setVehicleType(value)}
          style={s.input}
        />
      </View>
      {error ? <Text style={s.inlineError}>{error}</Text> : null}
      <TouchableOpacity
        style={[s.primaryBtn, saving && s.primaryBtnDisabled]}
        onPress={() => void submit()}
        disabled={saving}
        activeOpacity={0.9}
      >
        {saving ? (
          <ActivityIndicator color={Theme.textOnPrimary} />
        ) : (
          <Text style={s.primaryBtnText}>Add vehicle</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
