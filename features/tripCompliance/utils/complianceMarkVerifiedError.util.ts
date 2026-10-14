/**
 * The Review UI gates Mark Compliance Verified on LR / E-way Bill / Invoice.
 * Until the aligned RPC is applied on remote, `mark_trip_compliance_verified`
 * may still reject with insurance/rc as trip_documents. Keep that message
 * readable; do not invent a client-side bypass.
 */
export function formatMarkComplianceVerifiedError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("must resubmit it before it can be verified")) {
    return "This trip is on hold or rejected. Ground Ops must fix it and Resubmit before it can be verified.";
  }
  if (lower.includes("required documents not yet verified")) {
    const missing = raw.replace(/^.*required documents not yet verified:\s*/i, "").trim();
    return `Approve these trip documents first: ${missing || "LR, E-way bill and Invoice"}.`;
  }
  return raw.trim() || "Couldn't mark compliance verified.";
}
