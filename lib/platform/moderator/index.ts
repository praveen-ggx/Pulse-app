/**
 * Requests Moderator — public surface.
 * @see docs/DB_LOAD_ARCHITECTURE_REVIEW.md
 */
export {
  moderate,
  recordOutcome,
  recordShapeViolation,
  configureModerator,
  getModeratorConfig,
  getModeratorMetrics,
  RequestShedError,
  __resetModeratorForTests,
} from './requestModerator';
export { classifyRequest, LANE_HEADER } from './requestClassifier';
export { moderatedFetch } from './moderatedFetch';
export type { RequestClassification } from './requestClassifier';
export {
  scheduleInvalidation,
  flushInvalidations,
  configureInvalidationWindow,
  getInvalidationSchedulerMetrics,
  __resetInvalidationSchedulerForTests,
} from './invalidationScheduler';
export {
  DEFAULT_MODERATOR_CONFIG,
  LANE_PRIORITY,
  type ModeratorConfig,
  type ModeratorMetrics,
  type RequestLane,
  type ShapeViolation,
} from './types';
