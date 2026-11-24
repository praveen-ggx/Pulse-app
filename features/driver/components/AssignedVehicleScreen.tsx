/**
 * Fleet-assigned vehicle detail route — opened from DCO onboarding.
 */
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { DriverAssignedVehicleView } from '@/features/driver/components/DriverAssignedVehicleView';
import { useDriverAssignedVehicleDisplay } from '@/features/driver/hooks/useDriverAssignedVehicleDisplay';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AssignedVehicleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const { vehicleDisplay, isLoading } = useDriverAssignedVehicleDisplay(profile?.uid);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/dco-status');
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <DriverSubScreenHeader
        title="Assigned vehicle"
        subtitle="Fleet assigned"
        onBack={handleBack}
      />
      {isLoading ? (
        <CenteredLoadingView />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
            paddingTop: 12,
          }}
          showsVerticalScrollIndicator={false}
        >
          <DriverAssignedVehicleView vehicleDisplay={vehicleDisplay} />
        </ScrollView>
      )}
    </View>
  );
}
