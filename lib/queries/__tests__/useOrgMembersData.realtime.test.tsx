/**
 * Display panels use useOrgMembersData with refetchOnMount: false. Without a
 * membership listener their roster could stay stale for the 30-minute
 * staleTime; they now refresh when organization membership changes.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOrgMembersData } from '../useOrgMembersQuery';

const mockGetRoster = jest.fn();
let mockOnChange: (() => void) | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('@/features/organization/services/members.service', () => ({
  getMyTeamInvites: jest.fn(),
  getOrgTeamRoster: (...args: unknown[]) => mockGetRoster(...args),
  invalidateSharedOrganizationMembers: jest.fn(),
  subscribeToOrgTeamRoster: (_orgId: string, onChange: () => void) => {
    mockOnChange = onChange;
    return mockUnsubscribe;
  },
}));

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  mockGetRoster.mockReset();
  mockUnsubscribe.mockReset();
  mockOnChange = null;
});

test('refetches the roster when membership changes, and unsubscribes on unmount', async () => {
  mockGetRoster.mockResolvedValue({ error: null, roster: { members: [], pendingPhoneInvites: [] } });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result, unmount } = renderHook(() => useOrgMembersData('org-1'), { wrapper: wrapper(qc) });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockGetRoster).toHaveBeenCalledTimes(1);
  expect(mockOnChange).not.toBeNull();

  await act(async () => {
    mockOnChange!();
  });
  await waitFor(() => expect(mockGetRoster).toHaveBeenCalledTimes(2));

  unmount();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  qc.clear();
});

test('a remount within staleTime reuses the cache instead of refetching', async () => {
  mockGetRoster.mockResolvedValue({ error: null, roster: { members: [], pendingPhoneInvites: [] } });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const first = renderHook(() => useOrgMembersData('org-1'), { wrapper: wrapper(qc) });
  await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
  first.unmount();

  const second = renderHook(() => useOrgMembersData('org-1'), { wrapper: wrapper(qc) });
  await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
  expect(mockGetRoster).toHaveBeenCalledTimes(1);
  second.unmount();
  qc.clear();
});
