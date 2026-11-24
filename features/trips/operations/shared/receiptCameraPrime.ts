/** Native cameras open from the full-screen view. Web primes the prompt in the tap. */
export function primeReceiptCamera(): void {}

/** Web hands the in-tap stream to the preview. Native starts the camera view itself. */
export function takePrimedReceiptCamera(): Promise<MediaStream | null> {
  return Promise.resolve(null);
}
