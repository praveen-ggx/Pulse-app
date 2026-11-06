/**
 * Copy for the fleet disconnect confirm (Vasanth-style themed confirmDialog).
 * Warns about pending pay so the driver can settle offline before leaving.
 */

export type FleetDisconnectWarningInput = {
  orgName: string;
  /** Unsettled trip earnings for this fleet (₹). */
  pendingTripPayInr?: number | null;
  /** Sum of open salary requests for this fleet (₹). */
  pendingSalaryRequestInr?: number | null;
  openSalaryRequestCount?: number | null;
};

function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/** Title for confirmDialog / ThemedConfirmModal. */
export function fleetDisconnectConfirmTitle(orgName: string): string {
  const name = orgName.trim() || 'this fleet';
  return `Disconnect from ${name}?`;
}

/**
 * Body: you are disconnecting + pending pay bullets + offline settle reminder.
 * Always safe to show even when pending amounts are 0.
 */
export function buildFleetDisconnectConfirmMessage(
  input: FleetDisconnectWarningInput,
): string {
  const name = input.orgName.trim() || 'this fleet';
  const pendingTrip = Math.max(0, Math.round(Number(input.pendingTripPayInr) || 0));
  const pendingSalary = Math.max(
    0,
    Math.round(Number(input.pendingSalaryRequestInr) || 0),
  );
  const openCount = Math.max(0, Math.round(Number(input.openSalaryRequestCount) || 0));
  const hasPending = pendingTrip > 0 || pendingSalary > 0 || openCount > 0;

  const lines: string[] = [
    `You are disconnecting from ${name}.`,
    'You will stop receiving trip assignments from this fleet. Your passbook stays in history.',
  ];

  if (hasPending) {
    lines.push('');
    lines.push('Pending with this fleet:');
    if (pendingTrip > 0) {
      lines.push(`• Unsettled trip pay: ${formatInr(pendingTrip)}`);
    }
    if (pendingSalary > 0 || openCount > 0) {
      const salaryLabel =
        openCount > 0
          ? `• Open salary requests (${openCount}): ${formatInr(pendingSalary || 0)}`
          : `• Open salary requests: ${formatInr(pendingSalary)}`;
      lines.push(salaryLabel);
    }
    lines.push('');
    lines.push(
      'Settle or claim these offline before you leave if you still need payment from the fleet.',
    );
  } else {
    lines.push('');
    lines.push(
      'No open pending pay found here. If you have informal dues, settle them offline before disconnecting.',
    );
  }

  lines.push('');
  lines.push('The fleet owner will be notified that you disconnected.');

  return lines.join('\n');
}
