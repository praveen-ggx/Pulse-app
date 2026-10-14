export type { AddVehicleCompletePayload, VehicleSource } from './utils/addVehiclePayload.model';
export {
  AddVehicleEntryModal,
  VEHICLE_ENTRY_CATEGORIES,
  PAYMENT_MODES,
  type VehicleEntryType,
  type TripOption as VehicleEntryTripOption,
  type DriverOption as VehicleEntryDriverOption,
} from './components/AddVehicleEntryModal';
export { VehicleAvatar } from './components/VehicleAvatar';
export { default as VehicleDetailScreen } from './components/VehicleDetailScreen';
export { VehicleAnalyticsFullScreen } from './components/VehicleAnalyticsFullScreen';
export { GarrageTab, type GarrageTabProps, type GarrageViewTab } from './components/GarrageTab';
export { getAvailablePeriodOptions, type GarragePeriodValue } from './pnl';
export {
  getVehiclesByOrganization,
  getVehicleById,
  createVehicle,
  updateVehicle,
  type VehicleRow,
  type VehicleInsert,
  type UpdateVehicleData,
} from './services/vehicles.service';
