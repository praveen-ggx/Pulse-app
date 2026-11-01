import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { DriverMultiOrderJobCard } from '@/features/driver/job-card/DriverMultiOrderJobCard';
import { persistStopDeliveryProof } from '@/features/driver/job-card/persistStopDeliveryProof';
import { updateTripStatus } from '@/features/trips/services/trips.service';
import type { DriverStopExecutionStop } from '@/features/driver/execution/driverStopExecution.types';
import type { TripRow } from '@/features/trips/services/trips.service';

const mockUseDriverCommerceMission = jest.fn();

jest.mock('react-native', () => jest.requireActual('react-native'));

jest.mock('@/components/driver/DriverTripSheetLayout', () => ({
  TRIP_SHEET_TOP_RADIUS: 16,
  TRIP_SHEET_BODY_PAD: { horizontal: 18, top: 12, bottom: 10, gap: 8 },
}));

jest.mock('@/features/driver/components/MissionCardLayout', () => {
  const { View } = require('react-native');
  return { MissionCardLayout: () => <View testID="mission-card-layout" /> };
});

jest.mock('@/components/LoadingIndicator', () => ({
  LoadingIndicator: () => null,
}));

jest.mock('@/contexts/DriverThemeContext', () => {
  const colors = {
    background: '#f8fafc',
    surface: '#fff',
    surfaceElevated: '#f1f5f9',
    border: '#e2e8f0',
    text: '#0f172a',
    textMuted: '#64748b',
    textOnPrimary: '#fff',
    primary: '#059669',
    emerald: '#047857',
    emeraldMuted: 'rgba(4,120,87,0.12)',
    emeraldBorder: 'rgba(4,120,87,0.38)',
  };
  return {
    useDriverThemeColors: () => colors,
    getDriverThemeColors: () => colors,
  };
});

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { uid: 'user-1' } }),
}));

jest.mock('@/features/trips/services/trips.service', () => ({
  updateTripStatus: jest.fn().mockResolvedValue({ error: null, trip: { id: 'trip-1', status: 'completed' } }),
  resolveDriverFacingTripLabel: () => 'TRP011',
}));

const mockExecuteDriverCommand = jest.fn();
jest.mock('@/features/driver/services/driverExecution.service', () => ({
  executeDriverCommand: (...args: unknown[]) => mockExecuteDriverCommand(...args),
  applyDriverCommandResult: (row: Record<string, unknown>, result: Record<string, unknown>) => ({
    ...row,
    status: result.trip_status ?? row.status,
    completed_at: result.completed_at ?? row.completed_at,
  }),
}));

jest.mock('@/features/driver/job-card/persistStopDeliveryProof', () => ({
  persistStopDeliveryProof: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('@/features/driver/commerce-mission/useDriverCommerceMission', () => ({
  useDriverCommerceMission: (...args: unknown[]) => mockUseDriverCommerceMission(...args),
}));

function trip(): TripRow {
  return { id: 'trip-1' } as TripRow;
}

function stop(
  extras: Partial<DriverStopExecutionStop> & Pick<DriverStopExecutionStop, 'stopId' | 'sequence' | 'stopType' | 'status'>,
): DriverStopExecutionStop {
  return {
    displayName: extras.displayName ?? extras.stopId,
    addressLine: extras.addressLine ?? '2464 Royal Ln',
    city: extras.city ?? 'Mesa',
    state: 'NJ',
    pincode: '45463',
    latitude: null,
    longitude: null,
    contactName: 'Holden',
    contactPhone: extras.contactPhone ?? null,
    podRequired: false,
    driverId: 'drv-1',
    arrivedAt: null,
    completedAt: null,
    skipReason: null,
    failureReason: null,
    ...extras,
  };
}

function execution(overrides: Record<string, unknown>) {
  return {
    tripId: 'trip-1',
    mutating: null,
    hydrated: true,
    arrive: jest.fn().mockResolvedValue({ ok: true }),
    complete: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

function missionWithOrders(stopOrders: Array<{ stopId: string; orders: Array<Record<string, unknown>> }>) {
  return {
    status: 'ready',
    mission: {
      tripId: 'trip-1',
      indentId: null,
      executionPlanId: 'plan-1',
      stops: stopOrders.map((s) => ({ stopId: s.stopId, orders: s.orders })),
    },
  };
}

describe('DriverMultiOrderJobCard', () => {
  const pickup = stop({ stopId: 'pu-1', sequence: 1, stopType: 'pickup', status: 'pending', displayName: 'Guindy Warehouse' });
  const dropA = stop({ stopId: 'dr-1', sequence: 2, stopType: 'drop', status: 'pending', displayName: 'Customer A' });
  const dropB = stop({ stopId: 'dr-2', sequence: 3, stopType: 'drop', status: 'pending', displayName: 'Customer B' });

  beforeEach(() => {
    (persistStopDeliveryProof as jest.Mock).mockClear();
    (updateTripStatus as jest.Mock).mockClear();
    (updateTripStatus as jest.Mock).mockResolvedValue({ error: null, trip: { id: 'trip-1', status: 'completed' } });
    mockExecuteDriverCommand.mockReset();
    mockExecuteDriverCommand.mockResolvedValue({
      error: null,
      result: { ok: true, applied: false, command: 'COMPLETE_TRIP', trip_status: 'completed', completed_at: 'c' },
    });
    mockUseDriverCommerceMission.mockReset();
    mockUseDriverCommerceMission.mockReturnValue(missionWithOrders([
      {
        stopId: 'pu-1',
            orders: [
              { salesOrderId: 'so-1', orderNumber: 'ORD-1042', customerName: 'Holden', lines: [{ salesOrderLineId: 'l1', quantity: 2 }, { salesOrderLineId: 'l2', quantity: 1 }] },
              { salesOrderId: 'so-2', orderNumber: 'ORD-1048', customerName: 'Holden', lines: [{ salesOrderLineId: 'l3', quantity: 4 }] },
            ],
      },
      { stopId: 'dr-1', orders: [{ salesOrderId: 'so-1', orderNumber: 'ORD-1042', customerName: 'Customer A', lines: [{ salesOrderLineId: 'l1', quantity: 2 }] }] },
    ]));
  });

  it('pickup current stop uses Ready to pick up', () => {
    const arrive = jest.fn().mockResolvedValue({ ok: true });
    const { getByLabelText, getAllByText, getByText, queryByLabelText } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        stopExecution={execution({
          stops: [pickup, dropA],
          currentStop: pickup,
          nextStop: dropA,
          arrive,
        })}
      />,
    );
    expect(getByText('Commerce Delivery')).toBeTruthy();
    expect(getAllByText('Guindy Warehouse').length).toBeGreaterThan(0);
    expect(getAllByText('ORD-1042').length).toBeGreaterThan(0);
    expect(getAllByText('ORD-1048').length).toBeGreaterThan(0);
    fireEvent.press(getByLabelText('Ready to pick up'));
    expect(arrive).toHaveBeenCalledTimes(1);
    expect(queryByLabelText('Confirm pickup')).toBeNull();
  });

  it('arrived pickup opens verification then Confirm pickup completes the stop', async () => {
    const complete = jest.fn().mockResolvedValue({ ok: true });
    const arrived = { ...pickup, status: 'arrived' as const };
    const { getByLabelText, queryByLabelText, getByText, getByTestId } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        stopExecution={execution({
          stops: [arrived, dropA],
          currentStop: arrived,
          nextStop: dropA,
          complete,
        })}
      />,
    );
    expect(getByText('At pickup')).toBeTruthy();
    fireEvent.press(getByLabelText('Verify pickup'));
    expect(complete).not.toHaveBeenCalled();
    expect(getByTestId('driver-stop-verification')).toBeTruthy();
    expect(getByText('Pickup detail')).toBeTruthy();
    fireEvent.press(getByLabelText('Collected from warehouse'));
    fireEvent.press(getByLabelText('Confirm pickup'));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(persistStopDeliveryProof).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'pickup', stopId: 'pu-1' }),
    );
    expect(queryByLabelText('Ready to pick up')).toBeNull();
  });

  it('delivery current stop uses Ready to deliver', () => {
    const arrive = jest.fn().mockResolvedValue({ ok: true });
    const { getByLabelText, getAllByText } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        stopExecution={execution({
          stops: [{ ...pickup, status: 'completed' }, dropA],
          currentStop: dropA,
          nextStop: null,
          arrive,
        })}
      />,
    );
    expect(getAllByText('Delivery').length).toBeGreaterThan(0);
    fireEvent.press(getByLabelText('Ready to deliver'));
    expect(arrive).toHaveBeenCalledTimes(1);
  });

  it('arrived delivery opens verification then Confirm delivery completes the stop', async () => {
    const complete = jest.fn().mockResolvedValue({ ok: true });
    const arrivedDrop = { ...dropA, status: 'arrived' as const };
    const { getByLabelText, queryByLabelText, getByTestId } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        stopExecution={execution({
          stops: [{ ...pickup, status: 'completed' }, arrivedDrop],
          currentStop: arrivedDrop,
          nextStop: null,
          complete,
        })}
      />,
    );
    fireEvent.press(getByLabelText('Verify delivery'));
    expect(complete).not.toHaveBeenCalled();
    expect(getByTestId('driver-stop-verification')).toBeTruthy();
    fireEvent.press(getByLabelText('Handed to recipient'));
    fireEvent.press(getByLabelText('Confirm delivery'));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(queryByLabelText('Ready to deliver')).toBeNull();
  });

  it('hides Call when no phone exists', () => {
    const { queryByLabelText } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        stopExecution={execution({
          stops: [pickup, dropA],
          currentStop: pickup,
          nextStop: dropA,
        })}
      />,
    );
    expect(queryByLabelText('Call warehouse')).toBeNull();
    expect(queryByLabelText('Call customer')).toBeNull();
  });

  it('shows Call warehouse when pickup has a phone', () => {
    const withPhone = { ...pickup, contactPhone: '9876543210' };
    const { getByLabelText } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        stopExecution={execution({
          stops: [withPhone, dropA],
          currentStop: withPhone,
          nextStop: dropA,
        })}
      />,
    );
    expect(getByLabelText('Call warehouse')).toBeTruthy();
  });

  it('keeps long addresses to two lines and lists later stops on the timeline', () => {
    const longPickup = stop({
      stopId: 'pu-1',
      sequence: 1,
      stopType: 'pickup',
      status: 'pending',
      displayName: 'Guindy Distribution Hub',
      addressLine: 'Plot 12, very long industrial estate road near the inner ring that should wrap',
    });
    const { getByText, getByTestId } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        variant="page"
        edgeToEdge
        stopExecution={execution({
          stops: [longPickup, dropA, dropB],
          currentStop: longPickup,
          nextStop: dropA,
        })}
      />,
    );
    expect(getByTestId('commerce-route-timeline')).toBeTruthy();
    expect(getByText('Customer B')).toBeTruthy();
    expect(getByText(/very long industrial estate/)).toBeTruthy();
  });

  it('renders the collapsed peek with the Commerce header', () => {
    const onToggleCollapse = jest.fn();
    const { getByLabelText, getByText } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        collapsed
        onToggleCollapse={onToggleCollapse}
        stopExecution={execution({ stops: [pickup, dropA], currentStop: pickup, nextStop: dropA })}
      />,
    );
    expect(getByText('Commerce Delivery')).toBeTruthy();
    fireEvent.press(getByLabelText("Open today's route"));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('puts expense on the current-stop card', () => {
    const onExpense = jest.fn();
    const { getByLabelText } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        onExpense={onExpense}
        stopExecution={execution({ stops: [pickup, dropA], currentStop: pickup, nextStop: dropA })}
      />,
    );
    fireEvent.press(getByLabelText('Add trip expense'));
    expect(onExpense).toHaveBeenCalledTimes(1);
  });

  it('expands product lines from memory without another commerce read', () => {
    mockUseDriverCommerceMission.mockReturnValue(missionWithOrders([{
      stopId: 'pu-1',
      orders: [{
        salesOrderId: 'so-1',
        orderNumber: 'ORD-1042',
        lines: [
          { salesOrderLineId: 'l1', quantity: 4, productId: 'p1', productName: 'Product A', productSku: 'SKU-123' },
        ],
      }],
    }]));
    const { getByLabelText, getByText, queryByText } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        stopExecution={execution({
          stops: [pickup],
          currentStop: pickup,
          nextStop: null,
        })}
      />,
    );
    expect(mockUseDriverCommerceMission).toHaveBeenCalledTimes(1);
    expect(queryByText('SKU-123')).toBeNull();
    fireEvent.press(getByLabelText('Order #ORD-1042, 1 product'));
    expect(getByText('Product A')).toBeTruthy();
    expect(getByText('SKU-123')).toBeTruthy();
    expect(getByText('× 4')).toBeTruthy();
    expect(mockUseDriverCommerceMission).toHaveBeenCalledTimes(1);
  });

  it('opens previous stop details without completing', () => {
    const complete = jest.fn().mockResolvedValue({ ok: true });
    const donePickup = { ...pickup, status: 'completed' as const };
    const { getByLabelText, getByTestId, queryByLabelText } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        stopExecution={execution({
          stops: [donePickup, dropA],
          currentStop: dropA,
          nextStop: null,
          complete,
        })}
      />,
    );
    fireEvent.press(getByLabelText('View Guindy Warehouse details'));
    expect(getByTestId('driver-stop-verification')).toBeTruthy();
    expect(queryByLabelText('Confirm pickup')).toBeNull();
    expect(complete).not.toHaveBeenCalled();
  });

  it('opens a full-sheet summary when every stop is done and marks the trip completed', async () => {
    const onTripCompleted = jest.fn();
    const donePickup = { ...pickup, status: 'completed' as const };
    const doneDropA = { ...dropA, status: 'completed' as const };
    const doneDropB = { ...dropB, status: 'completed' as const };
    const { getByTestId, getByLabelText, getByText } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        onTripCompleted={onTripCompleted}
        stopExecution={execution({
          stops: [donePickup, doneDropA, doneDropB],
          currentStop: null,
          nextStop: null,
        })}
      />,
    );
    expect(getByTestId('driver-trip-completion')).toBeTruthy();
    expect(getByText(/deliveries/)).toBeTruthy();
    fireEvent.press(getByLabelText('Mark delivery completed'));
    await waitFor(() => expect(mockExecuteDriverCommand).toHaveBeenCalledWith(
      { tripId: 'trip-1', command: 'COMPLETE_TRIP' },
      expect.objectContaining({ id: 'trip-1' }),
    ));
    await waitFor(() => expect(onTripCompleted).toHaveBeenCalledTimes(1));
    expect(getByText('Delivery completed')).toBeTruthy();
    expect(updateTripStatus).not.toHaveBeenCalled();
  });

  it('shows the server rejection when Mark delivery completed is refused', async () => {
    mockExecuteDriverCommand.mockResolvedValue({
      error: Object.assign(new Error('Finish every stop before completing this trip.'), { code: 'stops_incomplete' }),
      result: { ok: false, command: 'COMPLETE_TRIP', error_code: 'stops_incomplete' },
    });
    const onTripCompleted = jest.fn();
    const onTripUpdated = jest.fn();
    const done = [pickup, dropA, dropB].map((s) => ({ ...s, status: 'completed' as const }));
    const { getByLabelText, getAllByText } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        onTripCompleted={onTripCompleted}
        onTripUpdated={onTripUpdated}
        stopExecution={execution({ stops: done, currentStop: null, nextStop: null })}
      />,
    );
    fireEvent.press(getByLabelText('Mark delivery completed'));
    await waitFor(() => expect(getAllByText('Finish every stop before completing this trip.').length).toBeGreaterThan(0));
    expect(onTripCompleted).not.toHaveBeenCalled();
    expect(onTripUpdated).not.toHaveBeenCalled();
    expect(updateTripStatus).not.toHaveBeenCalled();
  });

  it('final stop completed by the server completes the trip once without another write', async () => {
    const onTripCompleted = jest.fn();
    const onTripUpdated = jest.fn();
    const arrivedDrop = { ...dropB, status: 'arrived' as const };
    const complete = jest.fn().mockResolvedValue({
      ok: true,
      command: {
        ok: true, applied: true, command: 'COMPLETE_STOP', trip_status: 'completed',
        previous_status: 'in_progress', trip_completed: true, completed_at: 'c',
      },
    });
    const { getByLabelText } = render(
      <DriverMultiOrderJobCard
        trip={{ id: 'trip-1', status: 'in_progress' } as TripRow}
        onTripCompleted={onTripCompleted}
        onTripUpdated={onTripUpdated}
        stopExecution={execution({
          stops: [{ ...pickup, status: 'completed' }, { ...dropA, status: 'completed' }, arrivedDrop],
          currentStop: arrivedDrop,
          nextStop: null,
          complete,
        })}
      />,
    );
    fireEvent.press(getByLabelText('Verify delivery'));
    fireEvent.press(getByLabelText('Handed to recipient'));
    fireEvent.press(getByLabelText('Confirm delivery'));
    await waitFor(() => expect(onTripCompleted).toHaveBeenCalledTimes(1));
    expect(onTripUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    expect(mockExecuteDriverCommand).not.toHaveBeenCalled();
    expect(updateTripStatus).not.toHaveBeenCalled();
  });

  it('first arrival that starts the trip reports the server status', async () => {
    const onTripUpdated = jest.fn();
    const arrive = jest.fn().mockResolvedValue({
      ok: true,
      command: { ok: true, applied: true, command: 'ARRIVE_STOP', trip_status: 'in_progress', previous_status: 'assigned', trip_started: true },
    });
    const { getByLabelText } = render(
      <DriverMultiOrderJobCard
        trip={{ id: 'trip-1', status: 'assigned' } as TripRow}
        onTripUpdated={onTripUpdated}
        stopExecution={execution({ stops: [pickup, dropA], currentStop: pickup, nextStop: dropA, arrive })}
      />,
    );
    fireEvent.press(getByLabelText('Ready to pick up'));
    await waitFor(() => expect(onTripUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' })));
  });

  it('a trip already completed on mount does not re-run mission completion', () => {
    const onTripCompleted = jest.fn();
    const done = [pickup, dropA, dropB].map((s) => ({ ...s, status: 'completed' as const }));
    render(
      <DriverMultiOrderJobCard
        trip={{ id: 'trip-1', status: 'completed' } as TripRow}
        onTripCompleted={onTripCompleted}
        stopExecution={execution({ stops: done, currentStop: null, nextStop: null })}
      />,
    );
    expect(onTripCompleted).not.toHaveBeenCalled();
  });

  it('does not offer Arrive/Complete when SES is empty even if Primitive A has stops', () => {
    const arrive = jest.fn().mockResolvedValue({ ok: true });
    const complete = jest.fn().mockResolvedValue({ ok: true });
    mockUseDriverCommerceMission.mockReturnValue({
      status: 'ready',
      mission: {
        tripId: 'trip-1',
        indentId: null,
        executionPlanId: 'plan-1',
        stops: [
          {
            stopId: 'plan-pu',
            sequence: 1,
            stopType: 'pickup',
            displayName: 'Warehouse',
            orders: [],
          },
          {
            stopId: 'plan-dr',
            sequence: 2,
            stopType: 'drop',
            displayName: 'Customer',
            orders: [],
          },
        ],
      },
    });
    const { getByText, getAllByText, queryByLabelText, getByTestId } = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        stopExecution={execution({
          stops: [],
          currentStop: null,
          nextStop: null,
          arrive,
          complete,
        })}
      />,
    );
    expect(getByText('Route setup pending')).toBeTruthy();
    expect(getByTestId('commerce-route-timeline')).toBeTruthy();
    expect(getAllByText('Warehouse').length).toBeGreaterThan(0);
    expect(getAllByText('Customer').length).toBeGreaterThan(0);
    expect(getByTestId('multi-order-action-idle')).toBeTruthy();
    expect(queryByLabelText('Ready to pick up')).toBeNull();
    expect(queryByLabelText('Ready to deliver')).toBeNull();
    expect(queryByLabelText('Verify pickup')).toBeNull();
    expect(queryByLabelText('Verify delivery')).toBeNull();
    expect(arrive).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('opens order details with product lines from the map details control', () => {
    mockUseDriverCommerceMission.mockReturnValue(missionWithOrders([{
      stopId: 'dr-2',
      orders: [{
        salesOrderId: 'so-9',
        orderNumber: 'ORD-2002',
        customerName: 'Customer B',
        lines: [
          { salesOrderLineId: 'l9', quantity: 3, productId: 'p9', productName: 'Rice bag', productSku: 'RICE-5' },
        ],
      }],
    }]));
    const view = render(
      <DriverMultiOrderJobCard
        trip={trip()}
        deliveryDetailsNonce={0}
        stopExecution={execution({
          stops: [pickup, dropA, dropB],
          currentStop: dropB,
          nextStop: null,
        })}
      />,
    );
    expect(view.queryByText('Rice bag')).toBeNull();
    view.rerender(
      <DriverMultiOrderJobCard
        trip={trip()}
        deliveryDetailsNonce={1}
        stopExecution={execution({
          stops: [pickup, dropA, dropB],
          currentStop: dropB,
          nextStop: null,
        })}
      />,
    );
    expect(view.getByTestId('delivery-details-preview')).toBeTruthy();
    expect(view.getByText('Rice bag')).toBeTruthy();
    expect(view.getByText('RICE-5')).toBeTruthy();
    expect(view.getByText('× 3')).toBeTruthy();
    expect(view.getByText(/Drop 2/)).toBeTruthy();
  });
});
