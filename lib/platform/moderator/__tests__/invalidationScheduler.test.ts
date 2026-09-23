import {
  scheduleInvalidation,
  flushInvalidations,
  configureInvalidationWindow,
  getInvalidationSchedulerMetrics,
  __resetInvalidationSchedulerForTests,
} from '../invalidationScheduler';

type FakeClient = { invalidateQueries: jest.Mock };
const makeClient = (): FakeClient => ({ invalidateQueries: jest.fn() });

// The scheduler only needs invalidateQueries; a stub keeps this a unit test.
const asClient = (c: FakeClient) => c as unknown as Parameters<typeof scheduleInvalidation>[0];

beforeEach(() => {
  jest.useFakeTimers();
  __resetInvalidationSchedulerForTests();
});
afterEach(() => jest.useRealTimers());

it('collapses duplicate keys within the window into one invalidation', () => {
  const c = makeClient();
  for (let i = 0; i < 20; i++) scheduleInvalidation(asClient(c), ['trips', 'org1']);

  expect(c.invalidateQueries).not.toHaveBeenCalled();   // nothing fires synchronously
  jest.advanceTimersByTime(100);

  expect(c.invalidateQueries).toHaveBeenCalledTimes(1);
  expect(getInvalidationSchedulerMetrics().batched).toBe(20);
});

it('keeps distinct keys distinct', () => {
  const c = makeClient();
  scheduleInvalidation(asClient(c), ['trips', 'org1']);
  scheduleInvalidation(asClient(c), ['transactions', 'org1']);
  jest.advanceTimersByTime(100);
  expect(c.invalidateQueries).toHaveBeenCalledTimes(2);
});

it('starts a fresh window after a flush', () => {
  const c = makeClient();
  scheduleInvalidation(asClient(c), ['trips']);
  jest.advanceTimersByTime(100);
  scheduleInvalidation(asClient(c), ['trips']);
  jest.advanceTimersByTime(100);
  expect(c.invalidateQueries).toHaveBeenCalledTimes(2);
});

it('flushInvalidations runs queued work immediately', () => {
  const c = makeClient();
  scheduleInvalidation(asClient(c), ['trips']);
  flushInvalidations();
  expect(c.invalidateQueries).toHaveBeenCalledTimes(1);
  // And the pending timer must not double-fire afterwards.
  jest.advanceTimersByTime(100);
  expect(c.invalidateQueries).toHaveBeenCalledTimes(1);
});

it('flushes the previous client when a different one appears mid-window', () => {
  const a = makeClient();
  const b = makeClient();
  scheduleInvalidation(asClient(a), ['trips']);
  scheduleInvalidation(asClient(b), ['trips']);
  expect(a.invalidateQueries).toHaveBeenCalledTimes(1);  // flushed, not dropped
  jest.advanceTimersByTime(100);
  expect(b.invalidateQueries).toHaveBeenCalledTimes(1);
});

it('honours a configured window', () => {
  const c = makeClient();
  configureInvalidationWindow(500);
  scheduleInvalidation(asClient(c), ['trips']);
  jest.advanceTimersByTime(100);
  expect(c.invalidateQueries).not.toHaveBeenCalled();
  jest.advanceTimersByTime(400);
  expect(c.invalidateQueries).toHaveBeenCalledTimes(1);
});
