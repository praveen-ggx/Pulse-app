import { PulseBrandMark } from '@/components/brand/PulseBrandMark';
import { PULSE_PILOT_BRAND_WORD } from '@/lib/brand/pulseBrandMark.tokens';
import type { StyleProp, TextStyle } from 'react-native';

type Props = {
  color?: string;
  style?: StyleProp<TextStyle>;
};

/** Driver shell brand label — pulsepilot. wordmark. */
export function DriverBrandMark({ color, style }: Props) {
  return (
    <PulseBrandMark
      word={PULSE_PILOT_BRAND_WORD}
      size="xs"
      wordColor={color}
      textStyle={style}
      numberOfLines={1}
    />
  );
}
