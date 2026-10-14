/**
 * In-app signal that a supplier's payout account changed, so screens that
 * keep bank details in local state (compliance bank docs) refresh without a reload.
 */

type Listener = (supplierId: string) => void;

const listeners = new Set<Listener>();

export function emitSupplierBankChanged(supplierId: string): void {
  for (const listener of listeners) listener(supplierId);
}

export function subscribeSupplierBankChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
