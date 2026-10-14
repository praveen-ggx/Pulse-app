/**
 * Truck type images (from pulse-unified-base src/trucks/). Each vehicle type maps to a PNG.
 * Used for vehicle list and detail to show truck image instead of initial letter.
 */
import type { ImageSourcePropType } from 'react-native';
import { parseVehicleTypeSelection } from './vehicleTypeCatalog.model';

const truck19FT = require('../../../assets/trucks/19FT.png') as ImageSourcePropType;
const truck20FT = require('../../../assets/trucks/20FT.png') as ImageSourcePropType;
const truck32FT = require('../../../assets/trucks/32FT_Container.png') as ImageSourcePropType;
const lcv = require('../../../assets/trucks/LCV.png') as ImageSourcePropType;
const openBody = require('../../../assets/trucks/OpenBody.png') as ImageSourcePropType;
const tipper = require('../../../assets/trucks/Tipper.png') as ImageSourcePropType;

const TRUCK_IMAGES: Record<string, ImageSourcePropType> = {
  Truck: truck19FT,
  Trailer: truck32FT,
  'Mini Truck': lcv,
  Pickup: truck19FT,
  Container: truck20FT,
  '20ft Container': truck20FT,
  '32ft Container': truck32FT,
  '32FT Container': truck32FT,
  '40ft Container': truck32FT,
  Tipper: tipper,
  Tanker: truck19FT,
  Tempo: lcv,
  Other: truck19FT,
  'Open Body': openBody,
  'Open Trailer': openBody,
  'Covered Container': truck20FT,
  'Eicher Pro': lcv,
  'Tata 407': truck20FT,
  'Tata 709': truck20FT,
  'Eicher 14 Feet': truck20FT,
  'Eicher 17 Feet': truck32FT,
  'Ashok Leyland 17 Feet': truck32FT,
  'Ashok Leyland 19 Feet': truck32FT,
  'Tata Ace': lcv,
  'Tata 1109': truck32FT,
  'Market Truck': truck20FT,
  'Market Trailer': truck32FT,
};

/** Image for a global catalog value ("Open 20 Feet", "LCV Container 14 Feet", …). */
function catalogTruckImage(vehicleType: string): ImageSourcePropType | null {
  const sel = parseVehicleTypeSelection(vehicleType);
  if (!sel) return null;
  if (sel.group === 'Open') return openBody;
  if (sel.group === 'Container') return sel.type.startsWith('32 Feet') ? truck32FT : truck20FT;
  return lcv;
}

/** Get image source for a vehicle type (for use in Image source prop). */
export function getVehicleTypeImage(vehicleType: string | null | undefined): ImageSourcePropType {
  const key = (vehicleType || '').trim();
  return TRUCK_IMAGES[key] ?? catalogTruckImage(key) ?? truck19FT;
}
