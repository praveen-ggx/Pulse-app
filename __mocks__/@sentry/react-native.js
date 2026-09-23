/**
 * Jest mock for @sentry/react-native.
 *
 * The real package ships untranspiled ESM (`export { ... } from '@sentry/core'`),
 * which Jest cannot parse because node_modules is not transformed. Any test that
 * transitively reaches lib/crashReporter.ts (a very common chain:
 * finance.service -> authEngine -> crashReporter) failed to run with
 * "SyntaxError: Unexpected token 'export'".
 *
 * Crash reporting is a no-op in tests, so a stub is the right answer rather than
 * transforming the package: it is faster and keeps test output free of Sentry
 * side effects. Mirrors the surface used in app code (init / wrap /
 * captureException / captureMessage / setUser) plus common extras.
 */
const noop = () => {};
const scope = () => ({ setUser: noop, setTag: noop, setExtra: noop, clear: noop });
const span = () => ({ end: noop, setAttribute: noop });

module.exports = {
  init: jest.fn(),
  // Sentry.wrap is a HOC in the real SDK — pass the component straight through.
  wrap: jest.fn((component) => component),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  captureEvent: jest.fn(),
  captureFeedback: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  setTags: jest.fn(),
  setContext: jest.fn(),
  setExtra: jest.fn(),
  setExtras: jest.fn(),
  addBreadcrumb: jest.fn(),
  addIntegration: jest.fn(),
  addEventProcessor: jest.fn(),
  lastEventId: jest.fn(() => undefined),
  getClient: jest.fn(() => undefined),
  setCurrentClient: jest.fn(),
  getCurrentScope: jest.fn(scope),
  getGlobalScope: jest.fn(scope),
  getIsolationScope: jest.fn(scope),
  startSpan: jest.fn((_opts, cb) => (typeof cb === 'function' ? cb(span()) : undefined)),
  startInactiveSpan: jest.fn(span),
  startSpanManual: jest.fn((_opts, cb) =>
    typeof cb === 'function' ? cb(span()) : undefined,
  ),
  getActiveSpan: jest.fn(() => undefined),
  getRootSpan: jest.fn(() => undefined),
  withActiveSpan: jest.fn((_span, cb) => (typeof cb === 'function' ? cb() : undefined)),
  suppressTracing: jest.fn((cb) => (typeof cb === 'function' ? cb() : undefined)),
  spanToJSON: jest.fn(() => ({})),
  spanIsSampled: jest.fn(() => false),
  setMeasurement: jest.fn(),
  Scope: class Scope {
    setUser() {} setTag() {} setExtra() {} clear() {}
  },
  ReactNativeTracing: class ReactNativeTracing {},
  ReactNavigationInstrumentation: class ReactNavigationInstrumentation {},
};
