/**
 * Mobile dock slots follow member access: Ground Ops (Trip Ops domain +
 * trip_compliance.tab, no sales.chat) get Compliance instead of a dead Chat slot.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PulseBottomTabBar, type PulseBottomTabBarProps } from '../PulseBottomTabBar';

jest.mock('react-native', () => jest.requireActual('react-native'));
jest.mock('@/lib/preloadRoutes', () => ({
  preloadPulseLoadsRoute: jest.fn(),
  preloadTabScreen: jest.fn(),
}));

async function settlePress(node: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(node);
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

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
  it('Ground Ops: Trips and Compliance only — no Chat or Profile', async () => {
    const { queryByLabelText, getByLabelText, onTabChange } = renderBar({
      visibility: { finance: false, trips: true, network: false, loadCenter: false, compliance: true },
      showChat: false,
    });
    expect(getByLabelText('Trips')).toBeTruthy();
    expect(queryByLabelText('Profile')).toBeNull();
    expect(queryByLabelText('Chat')).toBeNull();
    expect(queryByLabelText('Home')).toBeNull();
    expect(queryByLabelText('Cash')).toBeNull();

    await settlePress(getByLabelText('Comply'));
    expect(onTabChange).toHaveBeenCalledWith('compliance');
  });

  it('hides Compliance when the member cannot open it', () => {
    const { queryByLabelText } = renderBar({
      visibility: { finance: true, trips: true, network: true, loadCenter: true, compliance: false },
    });
    expect(queryByLabelText('Comply')).toBeNull();
    expect(queryByLabelText('Chat')).toBeTruthy();
  });

  it('on a chat route only Chat is selected and badges show capped counts', async () => {
    const onOpenChat = jest.fn();
    const { getByLabelText, getByText } = renderBar({
      isChatRoute: true,
      messageUnreadCount: 14,
      activeLoadCount: 3,
      onOpenChat,
    });
    expect(getByLabelText('Chat').props.accessibilityState).toEqual({ selected: true });
    expect(getByLabelText('Trips').props.accessibilityState).toEqual({ selected: false });
    expect(getByText('9+')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    await settlePress(getByLabelText('Chat'));
    expect(onOpenChat).toHaveBeenCalled();
  });

  it('Marketplace replaces Loads and opens the load center from its own pill', async () => {
    const { getByLabelText, queryByLabelText, onTabChange } = renderBar({ activeTab: 'loadCenter' });
    expect(queryByLabelText('Loads')).toBeNull();
    expect(getByLabelText('Marketplace').props.accessibilityState).toEqual({ selected: true });
    expect(getByLabelText('Trips').props.accessibilityState).toEqual({ selected: false });
    await settlePress(getByLabelText('Marketplace'));
    expect(onTabChange).toHaveBeenCalledWith('loadCenter');
  });

  it('hides Marketplace without load center access', () => {
    const { queryByLabelText } = renderBar({
      visibility: { finance: true, trips: true, network: true, loadCenter: false, compliance: true },
    });
    expect(queryByLabelText('Marketplace')).toBeNull();
    expect(queryByLabelText('Trips')).toBeTruthy();
  });
});
