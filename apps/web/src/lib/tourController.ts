/**
 * Pure tour controller helpers (#103) — unit-testable without React.
 */
import type { TourPath, TourStep } from "@/lib/tourSteps";
import { tourStepsFor } from "@/lib/tourSteps";

export function shouldActivateTour(options: {
  path: TourPath | null;
  ready: boolean;
  dismissed: boolean;
}): boolean {
  const { path, ready, dismissed } = options;
  if (!ready || !path) return false;
  if (dismissed) return false;
  return tourStepsFor(path).length > 0;
}

export function nextStepIndex(
  stepIndex: number,
  stepCount: number,
): { index: number; finished: boolean } {
  if (stepIndex >= stepCount - 1) return { index: stepIndex, finished: true };
  return { index: stepIndex + 1, finished: false };
}

export function prevStepIndex(stepIndex: number): number {
  return Math.max(0, stepIndex - 1);
}

export function progressLabel(
  chrome: TourStep["chrome"],
  stepIndex: number,
  stepCount: number,
): string {
  return chrome === "dashboard"
    ? `Step ${stepIndex + 1} of ${stepCount}`
    : `${stepIndex + 1}/${stepCount}`;
}

export function primaryActionLabel(
  chrome: TourStep["chrome"],
  isLast: boolean,
): string {
  if (!isLast) return "Next";
  return chrome === "dashboard" ? "Done" : "Got it";
}
