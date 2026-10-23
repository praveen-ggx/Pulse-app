/** Shared by client/supplier page loaders: keep a scoped bundle even when the RPC is missing. */
export function unwrapPartyBootstrapBundle<T>(res: {
  error: Error | null;
  bundle: T | null;
}): T | null {
  if (res.error) throw res.error;
  return res.bundle;
}
