/**
 * Experience milestone progress — single source of truth for driver + business
 * Experience Roadmap / Next Mile Objectives.
 *
 * Levels and goals come from `constants/DriverLevels.ts` (`LEVELS_CONFIG`).
 * Progress is sequential: you stay on the first unmet milestone.
 */
import { LEVELS_CONFIG } from "@/constants/DriverLevels";

export type ExperienceLevelConfig = (typeof LEVELS_CONFIG)[number];
export type ExperienceGoalType = ExperienceLevelConfig["type"];

export type ExperienceMetrics = {
  /** Signed-in / onboarded. */
  hasSignedUp: boolean;
  /** Completed / delivered / done trips (cumulative). */
  completedTrips: number;
  /** KYC verified (driver) or workspace established (business). */
  isVerified: boolean;
  /** Count of five-star ratings received. */
  fiveStarCount: number;
};

export type MilestoneCount = {
  done: number;
  target: number;
  pct: number;
};

export type ExperienceProgress = {
  currentLevel: number;
  currentLevelConfig: ExperienceLevelConfig;
  nextLevelConfig: ExperienceLevelConfig | null;
  /** 0–100 progress within the current milestone goal. */
  experiencePct: number;
  currentCount: MilestoneCount;
  /** Highest fully completed level (0 if none). */
  highestCompletedLevel: number;
  metrics: ExperienceMetrics;
  levels: readonly ExperienceLevelConfig[];
};

export function countFiveStarRatings(
  ratings: readonly { score: number }[] | null | undefined,
): number {
  if (!ratings?.length) return 0;
  return ratings.reduce((n, r) => n + (r.score >= 5 ? 1 : 0), 0);
}

export function isExperienceGoalMet(
  level: Pick<ExperienceLevelConfig, "type" | "target">,
  metrics: ExperienceMetrics,
): boolean {
  switch (level.type) {
    case "signup":
      return metrics.hasSignedUp;
    case "trips":
      return metrics.completedTrips >= level.target;
    case "verification":
      return metrics.isVerified;
    case "ratings":
      return metrics.fiveStarCount >= level.target;
    default:
      return false;
  }
}

export function getMilestoneCount(
  level: Pick<ExperienceLevelConfig, "type" | "target">,
  metrics: ExperienceMetrics,
): MilestoneCount {
  const target = Math.max(1, level.target);
  let done = 0;
  switch (level.type) {
    case "signup":
      done = metrics.hasSignedUp ? 1 : 0;
      break;
    case "trips":
      done = Math.min(metrics.completedTrips, target);
      break;
    case "verification":
      done = metrics.isVerified ? 1 : 0;
      break;
    case "ratings":
      done = Math.min(metrics.fiveStarCount, target);
      break;
    default:
      done = 0;
  }
  return {
    done,
    target,
    pct: Math.min(100, Math.floor((done / target) * 100)),
  };
}

/**
 * Sequential experience: current level = first unmet milestone (or max when all done).
 */
export function computeExperienceProgress(
  metrics: ExperienceMetrics,
): ExperienceProgress {
  const levels = LEVELS_CONFIG;
  let highestCompletedLevel = 0;

  for (const level of levels) {
    if (isExperienceGoalMet(level, metrics)) {
      highestCompletedLevel = level.level;
    } else {
      break;
    }
  }

  const maxLevel = levels[levels.length - 1]?.level ?? 1;
  const currentLevel =
    highestCompletedLevel >= maxLevel
      ? maxLevel
      : Math.min(maxLevel, highestCompletedLevel + 1);

  const currentLevelConfig =
    levels.find((l) => l.level === currentLevel) ?? levels[0]!;
  const nextLevelConfig =
    levels.find((l) => l.level === currentLevel + 1) ?? null;

  const currentCount = getMilestoneCount(currentLevelConfig, metrics);
  const allDone = highestCompletedLevel >= maxLevel;
  const experiencePct = allDone ? 100 : currentCount.pct;

  return {
    currentLevel,
    currentLevelConfig,
    nextLevelConfig,
    experiencePct,
    currentCount,
    highestCompletedLevel,
    metrics,
    levels,
  };
}

export function isMilestoneCompleted(
  level: number,
  progress: ExperienceProgress,
): boolean {
  return level <= progress.highestCompletedLevel;
}

/** First unmet milestone (false when current level is already fully cleared). */
export function isMilestoneInProgress(
  level: number,
  progress: ExperienceProgress,
): boolean {
  return (
    level === progress.currentLevel &&
    level > progress.highestCompletedLevel
  );
}

export function formatExperienceMilestoneTitle(
  config: Pick<ExperienceLevelConfig, "level" | "name">,
): string {
  return `L${config.level} ${config.name}`;
}

export function formatExperienceTierSubtitle(
  config: Pick<ExperienceLevelConfig, "tier" | "privilege">,
): string {
  return `${config.tier} tier · Unlocks ${config.privilege}`;
}

/** Label for the active milestone bar (never the *next* level name). */
export function formatMilestoneProgressLabel(
  progress: ExperienceProgress,
): string {
  const maxLevel = progress.levels[progress.levels.length - 1]?.level ?? 1;
  if (progress.highestCompletedLevel >= maxLevel) {
    return "All milestones complete";
  }
  return `Progress on ${progress.currentLevelConfig.name}`;
}

/** One-line status for the current milestone goal (type-aware metrics). */
export function formatMilestoneStatusLine(
  level: Pick<ExperienceLevelConfig, "type" | "goalText">,
  count: MilestoneCount,
  metrics: ExperienceMetrics,
  options?: { audience?: "business" | "driver" },
): string {
  const audience = options?.audience ?? "driver";
  switch (level.type) {
    case "signup":
      return count.done >= count.target ? "Signup complete" : "Complete signup to continue";
    case "trips":
      return `${count.done}/${count.target} trips completed`;
    case "verification":
      return metrics.isVerified
        ? audience === "business"
          ? "Business identity verified"
          : "Identity verified"
        : audience === "business"
          ? "Complete business verification"
          : "Complete identity verification";
    case "ratings":
      return audience === "business"
        ? `${count.done}/${count.target} five-star partner ratings`
        : `${count.done}/${count.target} five-star ratings`;
    default:
      return level.goalText;
  }
}

export type MilestoneGuideAudience = "driver" | "business";
export type MilestoneGuideStatus = "completed" | "in_progress" | "upcoming";
export type MilestoneGuideActionKind =
  | "documents"
  | "find_work"
  | "org_verification"
  | "org_trips";

export type MilestoneGuide = {
  title: string;
  goal: string;
  unlocks: string;
  status: MilestoneGuideStatus;
  statusLabel: string;
  intro: string;
  steps: string[];
  lockedHint: string | null;
  action: { kind: MilestoneGuideActionKind; label: string } | null;
};

function guideStatus(
  level: number,
  progress: ExperienceProgress,
): MilestoneGuideStatus {
  if (isMilestoneCompleted(level, progress)) return "completed";
  if (isMilestoneInProgress(level, progress)) return "in_progress";
  return "upcoming";
}

function priorMilestoneHint(
  level: ExperienceLevelConfig,
  progress: ExperienceProgress,
): string | null {
  if (isMilestoneCompleted(level.level, progress)) return null;
  if (isMilestoneInProgress(level.level, progress)) return null;
  const prior = progress.levels.find((l) => l.level === progress.currentLevel);
  if (!prior) return "Finish the earlier milestones on this roadmap first.";
  return `Complete L${prior.level} ${prior.name} first. This level unlocks after that.`;
}

/**
 * Copy for the “how to complete this level” sheet (driver + business roadmaps).
 */
export function getMilestoneGuide(
  level: ExperienceLevelConfig,
  progress: ExperienceProgress,
  options?: { audience?: MilestoneGuideAudience },
): MilestoneGuide {
  const audience = options?.audience ?? "driver";
  const isDriver = audience === "driver";
  // Captured before the exhaustive `switch (level.type)` below: in its
  // defensive `default` branch TS has narrowed `level` to `never`, so
  // `level.goalText` no longer resolves there even though it is always present.
  const goalText = level.goalText;
  const status = guideStatus(level.level, progress);
  const count = getMilestoneCount(level, progress.metrics);
  const lockedHint = priorMilestoneHint(level, progress);

  const statusLabel =
    status === "completed"
      ? "Completed"
      : status === "in_progress"
        ? "In progress"
        : "Locked";

  const remaining = Math.max(0, count.target - count.done);

  let intro = "";
  let steps: string[] = [];
  let action: MilestoneGuide["action"] = null;

  switch (level.type) {
    case "signup":
      intro =
        status === "completed"
          ? isDriver
            ? "Your Pulse Driver account is active. This milestone is already done."
            : "Your workspace is set up. This milestone is already done."
          : isDriver
            ? "Finish creating your Pulse Driver account to open the rest of the roadmap."
            : "Finish creating your organization workspace to open the rest of the roadmap.";
      steps = isDriver
        ? [
            "Complete signup with your phone or email.",
            "Set your name and profile so customers can recognise you.",
          ]
        : [
            "Create the organization and confirm you can sign in.",
            "Add your business name and logo on the workspace profile.",
          ];
      break;
    case "trips":
      intro =
        status === "completed"
          ? `You have completed this trip goal (${count.done}/${count.target}).`
          : remaining === 1
            ? "Complete 1 more delivered trip to finish this level."
            : `Complete ${remaining} more delivered trips to finish this level.`;
      steps = isDriver
        ? [
            "Open Find Work (or take an assigned job) and accept a load you can run.",
            "Finish pickup and delivery so the trip is marked completed.",
            `This level needs ${count.target} completed trip${count.target === 1 ? "" : "s"} — currently ${count.done}/${count.target}.`,
          ]
        : [
            "Create or assign trips in your workspace and run them to delivery.",
            "Only completed / delivered trips count toward this level.",
            `Need ${count.target} completed trips — currently ${count.done}/${count.target}.`,
          ];
      if (status !== "completed") {
        action = isDriver
          ? { kind: "find_work", label: "Find work" }
          : { kind: "org_trips", label: "Open trips" };
      }
      break;
    case "verification":
      intro =
        status === "completed"
          ? isDriver
            ? "Your identity is verified. Silver Status on this path is unlocked."
            : "Business identity is verified. This milestone is complete."
          : isDriver
            ? "Upload your ID documents and submit them for review. Approval completes this level."
            : "Complete business verification. Approval completes this level.";
      steps = isDriver
        ? [
            "Open Documents from your profile.",
            "Upload your driving licence, Aadhaar, and a clear selfie. PAN is optional.",
            "Submit for verification and wait for Pulse to approve.",
          ]
        : [
            "Open workspace verification / KYC.",
            "Upload the required business identity documents.",
            "Submit for review and wait for approval.",
          ];
      if (status !== "completed") {
        action = isDriver
          ? { kind: "documents", label: "Open documents" }
          : { kind: "org_verification", label: "Open verification" };
      }
      break;
    case "ratings":
      intro =
        status === "completed"
          ? `You have ${count.done} five-star rating${count.done === 1 ? "" : "s"} — this level is done.`
          : remaining === 1
            ? "You need 1 more five-star rating to finish this level."
            : `You need ${remaining} more five-star ratings to finish this level.`;
      steps = isDriver
        ? [
            "Complete trips on time and keep the load in good condition.",
            "After delivery, the shipper can leave a 5★ rating.",
            `This level needs ${count.target} five-star rating${count.target === 1 ? "" : "s"} — currently ${count.done}/${count.target}.`,
          ]
        : [
            "Deliver partner jobs well so customers leave five-star ratings.",
            "Ratings on your linked customer relationships count here.",
            `Need ${count.target} five-star partner ratings — currently ${count.done}/${count.target}.`,
          ];
      if (status !== "completed") {
        action = isDriver
          ? { kind: "find_work", label: "Find work" }
          : { kind: "org_trips", label: "Open trips" };
      }
      break;
    default:
      intro = goalText;
      steps = [goalText];
  }

  return {
    title: formatExperienceMilestoneTitle(level),
    goal: level.goalText,
    unlocks: level.privilege,
    status,
    statusLabel,
    intro,
    steps,
    lockedHint,
    action,
  };
}
