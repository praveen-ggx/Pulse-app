import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { Stack } from 'expo-router';

export default function DriverReceivableLayout() {
  return <Stack screenOptions={routeStackScreenOptions} />;
}
