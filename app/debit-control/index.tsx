import { DebitControlScreen } from "@/features/debit-control/DebitControlScreen";
import { usePulseProductShell } from "@/features/product-shell/PulseProductShell";

export default function DebitControlRoute() {
  const inProductShell = usePulseProductShell() != null;
  return <DebitControlScreen embedded={inProductShell} />;
}
