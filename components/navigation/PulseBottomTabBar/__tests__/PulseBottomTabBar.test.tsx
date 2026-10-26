/**
 * Mobile dock slots follow member access: Ground Ops (Trip Ops domain +
 * trip_compliance.tab, no sales.chat) get Compliance instead of a dead Chat slot.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PulseBottomTabBar, type PulseBottomTabBarProps } from '../PulseBottomTabBar';

jest.mock('react-native', () => jest.requireActual('react-native'));
jest.mock('@/lib/preloadRoutes', () => ({
  preloadPulseLoadsRoute: jest.fn(),
  preloadTabScreen: jest.fn(),
}));

function renderBar(overrides: Partial<PulseBottomTabBarProps> = {}) {
  const onTabChange = jest.fn();
  const props: PulseBottomTabBarProps = {
    activeTab: 'trips',
    isChatRoute: false,
    isCompactMobile: true,
    footerPadBottom: 0,
    messageUnreadCount: 0,
    pendingInvites: 0,
    activeLoadCount: 0,
    onTabChange,
    onOpenChat: jest.fn(),
    onCollapseNetworkDock: jest.fn(),
    ...overrides,
  };
  return { ...render(<PulseBottomTabBar {...props} />), onTabChange };
}

describe('PulseBottomTabBar', () => {
  it('Ground Ops: Trips, Compliance, Profile — no Chat', () => {
    const { queryByLabelText, getByLabelText, onTabChange } = renderBar({
      visibility: { finance: false, trips: true, network: false, loadCenter: false, compliance: true },
      showChat: false,
    });
    expect(getByLabelText('Trips')).toBeTruthy();
    expect(getByLabelText('Profile')).toBeTruthy();
    expect(queryByLabelText('Chat')).toBeNull();
    expect(queryByLabelText('Home')).toBeNull();
    expect(queryByLabelText('Cash')).toBeNull();

    fireEvent.press(getByLabelText('Comply'));
    expect(onTabChange).toHaveBeenCalledWith('compliance');
  });

  it('hides Compliance when the member cannot open it', () => {
    const { queryByLabelText } = renderBar({
      visibility: { finance: true, trips: true, network: true, loadCenter: true, compliance: false },
    });
    expect(queryByLabelText('Comply')).toBeNull();
    expect(queryByLabelText('Chat')).toBeTruthy();
  });
});
