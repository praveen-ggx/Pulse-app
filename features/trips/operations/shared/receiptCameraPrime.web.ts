let pending: Promise<MediaStream | null> | null = null;

/** Start the camera inside the tap that opens the receipt screen. */
export function primeReceiptCamera(): void {
  if (pending || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
  pending = navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    })
    .catch(() => null);
}

/** Hands the in-tap camera stream to the full-screen preview. */
export function takePrimedReceiptCamera(): Promise<MediaStream | null> {
  const next = pending ?? Promise.resolve(null);
  pending = null;
  return next;
}
