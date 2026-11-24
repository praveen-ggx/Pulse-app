import {
  buildFleetDisconnectConfirmMessage,
  fleetDisconnectConfirmTitle,
} from '../fleetDisconnectWarning.util';

describe('fleetDisconnectWarning.util', () => {
  it('titles with the fleet name', () => {
    expect(fleetDisconnectConfirmTitle('MK Logistics')).toBe(
      'Disconnect from MK Logistics?',
    );
    expect(fleetDisconnectConfirmTitle('  ')).toBe('Disconnect from this fleet?');
  });

  it('lists pending trip and salary amounts when present', () => {
    const msg = buildFleetDisconnectConfirmMessage({
      orgName: 'MK Logistics',
      pendingTripPayInr: 2500,
      pendingSalaryRequestInr: 1000,
      openSalaryRequestCount: 2,
    });
    expect(msg).toContain('You are disconnecting from MK Logistics.');
    expect(msg).toContain('Unsettled trip pay: ₹2,500');
    expect(msg).toContain('Open salary requests (2): ₹1,000');
    expect(msg).toContain('Settle or claim these offline');
    expect(msg).toContain('fleet owner will be notified');
  });

  it('uses offline reminder when nothing is pending', () => {
    const msg = buildFleetDisconnectConfirmMessage({
      orgName: 'Fleet Co',
      pendingTripPayInr: 0,
      pendingSalaryRequestInr: 0,
      openSalaryRequestCount: 0,
    });
    expect(msg).toContain('No open pending pay found');
    expect(msg).not.toContain('Unsettled trip pay');
  });
});
