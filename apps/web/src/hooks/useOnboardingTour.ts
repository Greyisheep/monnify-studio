/**
 * Dismissible post-door tour controller (#103).
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  tourDismissKey,
  tourStepsFor,
  type TourPath,
  type TourStep,
} from "@/lib/tourSteps";

function readDismissed(path: TourPath): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(tourDismissKey(path)) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(path: TourPath) {
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
    if (!ready || !path || steps.length === 0) {
      setActive(false);
      return;
    }
    if (readDismissed(path)) {
      setActive(false);
      return;
    }
    setStepIndex(0);
    setActive(true);
  }, [ready, path, steps.length]);

  const step: TourStep | null = active ? (steps[stepIndex] ?? null) : null;

  const dismiss = useCallback(() => {
    if (path) writeDismissed(path);
    setActive(false);
  }, [path]);

  const next = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      dismiss();
      return;
    }
    setStepIndex((i) => i + 1);
  }, [dismiss, stepIndex, steps.length]);

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
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
