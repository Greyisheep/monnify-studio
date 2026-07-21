/**
 * Dismissible post-door tour controller (#103).
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  nextStepIndex,
  prevStepIndex,
  shouldActivateTour,
} from "@/lib/tourController";
import {
  tourDismissKey,
  tourStepsFor,
  type TourPath,
  type TourStep,
} from "@/lib/tourSteps";

export function isTourDismissed(path: TourPath): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(tourDismissKey(path)) === "1";
  } catch {
    return false;
  }
}

export function persistTourDismissed(path: TourPath) {
  try {
    window.localStorage.setItem(tourDismissKey(path), "1");
  } catch {
    // private mode — tour may reappear; still dismiss in-session
  }
}

export function useOnboardingTour(options: {
  path: TourPath | null;
  ready: boolean;
}) {
  const { path, ready } = options;
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(
    () => (path ? tourStepsFor(path) : []),
    [path],
  );

  useEffect(() => {
    const dismissed = path ? isTourDismissed(path) : true;
    if (!shouldActivateTour({ path, ready, dismissed })) {
      setActive(false);
      return;
    }
    setStepIndex(0);
    setActive(true);
  }, [ready, path, steps.length]);

  const step: TourStep | null = active ? (steps[stepIndex] ?? null) : null;

  const dismiss = useCallback(() => {
    if (path) persistTourDismissed(path);
    setActive(false);
  }, [path]);

  const next = useCallback(() => {
    const { finished, index } = nextStepIndex(stepIndex, steps.length);
    if (finished) {
      dismiss();
      return;
    }
    setStepIndex(index);
  }, [dismiss, stepIndex, steps.length]);

  const back = useCallback(() => {
    setStepIndex((i) => prevStepIndex(i));
  }, []);

  return {
    active,
    stepIndex,
    stepCount: steps.length,
    step,
    next,
    back,
    skip: dismiss,
    done: dismiss,
  };
}
