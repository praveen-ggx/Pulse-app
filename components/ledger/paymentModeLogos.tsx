/**
 * Payment mode marks — clean slate line icons (no brand fills).
 */
import { memo, type ReactNode } from "react";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import Theme from "@/constants/Theme";

export interface PaymentModeLogoProps {
  size?: number;
  /** Override stroke/ink. Defaults to slate line color. */
  color?: string;
}

const LINE = Theme.textRouteCard; // #64748b — professional slate

function LogoSvg({
  size,
  viewBox,
  children,
}: {
  size: number;
  viewBox: string;
  children: ReactNode;
}) {
  return (
    <Svg width={size} height={size} viewBox={viewBox}>
      {children}
    </Svg>
  );
}

/** Cash — banknote with centered rupee. */
export const CashLogo = memo(function CashLogo({
  size = 48,
  color = LINE,
}: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 48 48">
      <Rect
        x={7}
        y={12}
        width={34}
        height={24}
        rx={3.5}
        fill="none"
        stroke={color}
        strokeWidth={1.9}
      />
      <Path
        d="M11 16.5 H15 M33 16.5 H37 M11 31.5 H15 M33 31.5 H37"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Circle cx={24} cy={24} r={7.2} fill="none" stroke={color} strokeWidth={1.7} />
      <Path
        d="M21.2 21.2 H26.2 C27.5 21.2 28.4 22.1 28.4 23.2 C28.4 24.3 27.5 25.2 26.2 25.2 H21.2
           M21.2 25.2 H26.6 C27.9 25.2 28.8 26.1 28.8 27.2 C28.8 28.3 27.9 29.2 26.6 29.2 H21.2
           M24 19.4 V30.6"
        fill="none"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </LogoSvg>
  );
});

/** UPI — QR code (scan-to-pay), monoline. */
export const UpiLogo = memo(function UpiLogo({
  size = 48,
  color = LINE,
}: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 48 48">
      <G
        fill="none"
        stroke={color}
        strokeWidth={1.85}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Rect x={8} y={8} width={32} height={32} rx={3} />
        <Rect x={12} y={12} width={9} height={9} rx={1.2} />
        <Rect x={14.5} y={14.5} width={4} height={4} rx={0.6} fill={color} stroke="none" />
        <Rect x={27} y={12} width={9} height={9} rx={1.2} />
        <Rect x={29.5} y={14.5} width={4} height={4} rx={0.6} fill={color} stroke="none" />
        <Rect x={12} y={27} width={9} height={9} rx={1.2} />
        <Rect x={14.5} y={29.5} width={4} height={4} rx={0.6} fill={color} stroke="none" />
        <Rect x={25} y={25} width={3.2} height={3.2} rx={0.4} fill={color} stroke="none" />
        <Rect x={30.5} y={25} width={3.2} height={3.2} rx={0.4} fill={color} stroke="none" />
        <Rect x={25} y={30.5} width={3.2} height={3.2} rx={0.4} fill={color} stroke="none" />
        <Rect x={30.5} y={30.5} width={3.2} height={3.2} rx={0.4} fill={color} stroke="none" />
        <Rect x={35} y={25} width={3.2} height={3.2} rx={0.4} fill={color} stroke="none" />
        <Rect x={25} y={35} width={3.2} height={3.2} rx={0.4} fill={color} stroke="none" />
      </G>
    </LogoSvg>
  );
});

/** Bank transfer — classical façade. */
export const BankLogo = memo(function BankLogo({
  size = 48,
  color = LINE,
}: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 48 48">
      <G
        fill="none"
        stroke={color}
        strokeWidth={1.85}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M8 18 L24 9 L40 18" />
        <Path d="M10 18 H38" />
        <Path d="M13 18 V33" />
        <Path d="M20.5 18 V33" />
        <Path d="M27.5 18 V33" />
        <Path d="M35 18 V33" />
        <Path d="M9 33 H39" />
        <Path d="M7 36.5 H41" />
        <Path d="M24 9 V12.5" />
      </G>
    </LogoSvg>
  );
});

/** Cheque leaf — form lines + signature. */
export const ChequeLogo = memo(function ChequeLogo({
  size = 48,
  color = LINE,
}: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 48 48">
      <Rect
        x={6.5}
        y={11}
        width={35}
        height={26}
        rx={3}
        fill="none"
        stroke={color}
        strokeWidth={1.9}
      />
      <Path
        d="M11 17.5 H22 M11 22.5 H37 M11 27 H33"
        stroke={color}
        strokeWidth={1.55}
        strokeLinecap="round"
      />
      <Path
        d="M11 33.5 H19"
        stroke={color}
        strokeWidth={1.55}
        strokeLinecap="round"
      />
      <Path
        d="M28.5 31.2 C30.2 28.8 32.4 28.6 34.2 30.4 C35.2 31.4 36.6 33.2 37.5 34.2"
        fill="none"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={36.2} cy={16.8} r={2.2} fill="none" stroke={color} strokeWidth={1.4} />
    </LogoSvg>
  );
});

/** FASTag — toll tag with signal arc. */
export const FastagLogo = memo(function FastagLogo({
  size = 48,
  color = LINE,
}: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 48 48">
      <Path
        d="M14 14 H30 C33.5 14 36 16.5 36 20 V28 C36 31.5 33.5 34 30 34 H18 L12 39 V14 Z"
        fill="none"
        stroke={color}
        strokeWidth={1.85}
        strokeLinejoin="round"
      />
      <Path
        d="M20 20.5 H30 M20 25 H27"
        stroke={color}
        strokeWidth={1.55}
        strokeLinecap="round"
      />
      <Path
        d="M38.5 17.5 C41 20 41 28 38.5 30.5"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Path
        d="M41.5 14.5 C45.5 18.5 45.5 29.5 41.5 33.5"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </LogoSvg>
  );
});

/** Fuel card — card + pump nozzle. */
export const FuelCardLogo = memo(function FuelCardLogo({
  size = 48,
  color = LINE,
}: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 48 48">
      <Rect
        x={7}
        y={12}
        width={26}
        height={24}
        rx={3}
        fill="none"
        stroke={color}
        strokeWidth={1.85}
      />
      <Path d="M7 19.5 H33" stroke={color} strokeWidth={1.7} />
      <Path
        d="M12 27 H22"
        stroke={color}
        strokeWidth={1.55}
        strokeLinecap="round"
      />
      <G
        fill="none"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M36 14 V30 C36 32.2 37.8 34 40 34" />
        <Path d="M36 14 H40 V18" />
        <Path d="M40 18 C42.5 18 43.5 20 43.5 22.5 V26" />
      </G>
    </LogoSvg>
  );
});

/** On-account credit — clock. */
export const CreditLogo = memo(function CreditLogo({
  size = 48,
  color = LINE,
}: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 48 48">
      <Circle cx={24} cy={24} r={14} fill="none" stroke={color} strokeWidth={1.9} />
      <Path
        d="M24 15.5 V24.5 L31 28"
        fill="none"
        stroke={color}
        strokeWidth={1.85}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={24} cy={24} r={1.5} fill={color} />
    </LogoSvg>
  );
});

export const PaymentModeLogo = memo(function PaymentModeLogo({
  modeId,
  size = 48,
  color,
}: PaymentModeLogoProps & { modeId: string }) {
  const props = { size, color };
  switch (modeId.toUpperCase()) {
    case "UPI":
      return <UpiLogo {...props} />;
    case "FASTAG":
      return <FastagLogo {...props} />;
    case "CASH":
      return <CashLogo {...props} />;
    case "BANK":
      return <BankLogo {...props} />;
    case "CHEQUE":
      return <ChequeLogo {...props} />;
    case "FUEL_CARD":
      return <FuelCardLogo {...props} />;
    case "CREDIT":
      return <CreditLogo {...props} />;
    default:
      return <CashLogo {...props} />;
  }
});
