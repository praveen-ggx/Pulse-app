import Theme from '@/constants/Theme';
import { SearchBar } from '@/components/SearchBar';
import type { DriverRow } from '@/features/drivers/services/drivers.service';
import { searchExistingDriversByPhone } from '@/features/drivers/services/drivers.service';
import {
  getDriverAvailabilityByPhone,
  getDriverAvailabilityByPhoneGlobal,
} from '@/features/trips/services/trips.service';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { formatMobileNumber } from '@/lib/format';
import { isSameDriverPhone } from '@/features/trips/utils/reassignChangeDetection.util';
import { validatePhone } from '@/lib/phoneValidation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AddDriverForm } from './AddDriverForm';
import { ReassignSegmentedControl } from './ReassignSegmentedControl';
import {
  filterDriversForReassign,
  pilotCodeFromName,
} from './reassignMaster.util';
import { reassignStyles as s } from './reassign.styles';

export type DriverReassignMode = 'existing' | 'add' | 'phone';

type Props = {
  organizationId: string;
  driverAssignOrgId: string | null;
  tripId: string;
  isAggregate: boolean;
  currentDriverId: string | null;
  currentDriverName: string | null;
  drivers: DriverRow[];
  driversLoading: boolean;
  busyDriverIds: Set<string>;
  tripLabelByDriverId: Record<string, string>;
  mode: DriverReassignMode;
  onModeChange: (mode: DriverReassignMode) => void;
  selectedDriverId: string | null;
  onSelectDriverId: (id: string | null) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  driverName: string;
  onDriverNameChange: (value: string) => void;
  phoneBusy: boolean;
  onPhoneBusyChange: (busy: boolean) => void;
  /** Hide title / current card / segment — parent workspace owns chrome. */
  embedded?: boolean;
  /**
   * When the parent already runs `useAggregateDriverPhoneLookup`, pass that
   * result so this section does not issue a second 400ms lookup.
   */
  phoneLookup?: {
    suggestedName: string | null;
    inTrip: boolean;
    busyTripLabel: string | null;
    loading: boolean;
  } | null;
};

export function DriverReassignSection({
  organizationId,
  driverAssignOrgId,
  tripId,
  isAggregate,
  currentDriverId,
  currentDriverName,
  drivers,
  driversLoading,
  busyDriverIds,
  tripLabelByDriverId,
  mode,
  onModeChange,
  selectedDriverId,
  onSelectDriverId,
  phone,
  onPhoneChange,
  driverName,
  onDriverNameChange,
  phoneBusy,
  onPhoneBusyChange,
  embedded = false,
  phoneLookup = null,
}: Props) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [phoneName, setPhoneName] = useState<string | null>(null);
  const [phoneBusyLabel, setPhoneBusyLabel] = useState<string | null>(null);
  const phoneLookupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneLookupRequestRef = useRef(0);

  const segmentOptions = useMemo(() => {
    if (isAggregate) {
      return [{ id: 'phone' as const, label: 'Name & phone' }];
    }
    return [
      { id: 'existing' as const, label: 'From fleet' },
      { id: 'add' as const, label: 'Add new' },
      { id: 'phone' as const, label: 'Assign by phone' },
    ];
  }, [isAggregate]);

  const filtered = useMemo(
    () => filterDriversForReassign(drivers, debouncedSearch),
    [drivers, debouncedSearch],
  );

  useEffect(() => {
    if (isAggregate && mode !== 'phone') onModeChange('phone');
  }, [isAggregate, mode, onModeChange]);

  useEffect(() => {
    if (!phoneLookup || mode !== 'phone') return;
    setPhoneName(phoneLookup.suggestedName);
    setPhoneBusyLabel(phoneLookup.busyTripLabel);
    onPhoneBusyChange(phoneLookup.inTrip);
  }, [mode, onPhoneBusyChange, phoneLookup]);

  useEffect(() => {
    if (phoneLookup) return;
    if (mode !== 'phone') {
      setPhoneName(null);
      onPhoneBusyChange(false);
      return;
    }
    const trimmed = phone.trim();
    if (!trimmed) {
      setPhoneName(null);
      onPhoneBusyChange(false);
      setPhoneBusyLabel(null);
      return;
    }
    if (phoneLookupRef.current) clearTimeout(phoneLookupRef.current);
    const requestId = ++phoneLookupRequestRef.current;

    phoneLookupRef.current = setTimeout(() => {
      phoneLookupRef.current = null;
      const normalized = trimmed.replace(/\s+/g, '');
      if (normalized.length < 10) {
        if (requestId !== phoneLookupRequestRef.current) return;
        setPhoneName(null);
        onPhoneBusyChange(false);
        setPhoneBusyLabel(null);
        return;
      }
      void searchExistingDriversByPhone(normalized).then(async ({ matches }) => {
        if (requestId !== phoneLookupRequestRef.current) return;
        setPhoneName(matches[0]?.full_name ?? null);
        const orgForDriver =
          (driverAssignOrgId ?? organizationId).trim() || organizationId;
        const { result } = driverAssignOrgId
          ? await getDriverAvailabilityByPhoneGlobal(normalized, {
              excludeTripId: tripId,
              anyOpenTripBlocks: true,
              requireAuthoritativeRpc: true,
            })
          : await getDriverAvailabilityByPhone(orgForDriver, normalized, {
              excludeTripId: tripId,
            });
        if (requestId !== phoneLookupRequestRef.current) return;
        const currentPhone =
          drivers.find((d) => d.id === currentDriverId)?.phone ?? null;
        const editingCurrent = isSameDriverPhone(normalized, currentPhone);
        onPhoneBusyChange(Boolean(result.isBusy) && !editingCurrent);
        setPhoneBusyLabel(
          editingCurrent ? null : result.ongoingTripLabel ?? null,
        );
      });
    }, 280);

    return () => {
      phoneLookupRequestRef.current += 1;
      if (phoneLookupRef.current) clearTimeout(phoneLookupRef.current);
    };
  }, [
    currentDriverId,
    driverAssignOrgId,
    drivers,
    mode,
    onPhoneBusyChange,
    organizationId,
    phone,
    phoneLookup,
    tripId,
  ]);

  useEffect(() => {
    if (mode !== 'phone' || !phoneName) return;
    if (driverName.trim()) return;
    onDriverNameChange(phoneName);
  }, [mode, phoneName, driverName, onDriverNameChange]);

  const driverNameTrimmed = driverName.trim();
  const driverNameError =
    mode === 'phone' && driverNameTrimmed.length > 0 && driverNameTrimmed.length < 2
      ? 'Enter at least 2 characters.'
      : null;

  return (
    <View style={[s.section, embedded && { marginBottom: 0 }]}>
      {embedded ? null : <Text style={s.sectionTitle}>Driver</Text>}
      {!embedded && currentDriverName ? (
        <View style={s.currentCard}>
          <Text style={s.currentName}>{currentDriverName}</Text>
          <Text style={s.currentMeta}>Currently assigned</Text>
        </View>
      ) : null}

      {!embedded && !isAggregate ? (
        <ReassignSegmentedControl
          options={segmentOptions}
          value={mode}
          onChange={(id) => {
            onModeChange(id);
            if (id === 'phone') onSelectDriverId(null);
          }}
        />
      ) : null}

      {!isAggregate && mode === 'existing' ? (
        <>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search drivers…"
            style={{ marginBottom: 10 }}
          />
          {driversLoading ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={Theme.primary} />
          ) : (
            <ScrollView style={s.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <View style={s.empty}>
                  <Text style={s.emptyText}>No drivers match your search.</Text>
                  <TouchableOpacity
                    style={s.emptyCta}
                    onPress={() => onModeChange('add')}
                    activeOpacity={0.9}
                  >
                    <Text style={s.emptyCtaText}>Add new driver</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                filtered.map((d) => {
                  const busy = busyDriverIds.has(d.id) && d.id !== currentDriverId;
                  const selected = selectedDriverId === d.id;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[s.row, selected && s.rowSelected, busy && s.rowBusy]}
                      onPress={() => !busy && onSelectDriverId(d.id)}
                      disabled={busy}
                      activeOpacity={busy ? 1 : 0.85}
                    >
                      <View style={s.avatar}>
                        <Text style={s.avatarText}>{pilotCodeFromName(d.name ?? '?')}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[s.rowTitle, busy && s.rowTitleMuted]}
                          numberOfLines={1}
                        >
                          {d.name ?? '—'}
                        </Text>
                        <Text style={s.rowSub} numberOfLines={1}>
                          {busy
                            ? `On ${tripLabelByDriverId[d.id] ?? 'another trip'}`
                            : d.phone ?? 'No phone'}
                        </Text>
                      </View>
                      {selected ? (
                        <FontAwesome name="check-circle" size={20} color={Theme.primary} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}
        </>
      ) : null}

      {!isAggregate && mode === 'add' ? (
        <AddDriverForm
          organizationId={organizationId}
          onCreated={(id) => {
            onSelectDriverId(id);
            onModeChange('existing');
          }}
        />
      ) : null}

      {mode === 'phone' || isAggregate ? (
        <View style={[s.form, embedded && { padding: 0, backgroundColor: 'transparent' }]}>
          <Text style={s.label}>Driver name *</Text>
          <TextInput
            style={s.input}
            value={driverName}
            onChangeText={onDriverNameChange}
            placeholder="e.g. Suresh Kumar"
            placeholderTextColor={Theme.textMuted}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {driverNameError ? (
            <Text style={s.inlineError}>{driverNameError}</Text>
          ) : null}
          <Text style={[s.label, { marginTop: 12 }]}>Driver phone *</Text>
          <TextInput
            style={s.input}
            value={phone}
            onChangeText={(v) => onPhoneChange(formatMobileNumber(v))}
            placeholder="e.g. +91 98765 43210"
            placeholderTextColor={Theme.textMuted}
            keyboardType="phone-pad"
          />
          {phoneName && driverName.trim() !== phoneName.trim() ? (
            <TouchableOpacity
              onPress={() => onDriverNameChange(phoneName)}
              accessibilityRole="button"
              accessibilityLabel={`Use app name ${phoneName}`}
            >
              <Text style={[s.rowSub, { marginTop: 4 }]} numberOfLines={2}>
                App name: {phoneName}. Tap to use.
              </Text>
            </TouchableOpacity>
          ) : phoneName ? (
            <Text style={[s.rowSub, { marginTop: 4 }]} numberOfLines={2}>
              Existing driver matched by phone. Local name is saved on this trip.
            </Text>
          ) : null}
          {phoneBusy ? (
            <Text style={s.inlineError}>
              Driver on {phoneBusyLabel ?? 'another ongoing trip'} — choose another driver or
              confirm availability first.
            </Text>
          ) : null}
          {phone.trim() && validatePhone(phone.trim()) ? (
            <Text style={s.inlineError}>{validatePhone(phone.trim())}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
