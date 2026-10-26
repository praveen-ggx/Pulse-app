/** Phone / compact-web breakpoint for the Compliance queue. */
export const COMPLIANCE_MOBILE_MAX_WIDTH = 768;

export function isComplianceMobileViewport(width: number): boolean {
  return width > 0 && width < COMPLIANCE_MOBILE_MAX_WIDTH;
}
