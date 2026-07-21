import type { OnboardingStep, StudioPath } from "@/types";

/** Business shell nav: Dashboard is home; whiteboard is opt-in (#135). */
export type BusinessHomeNav = "dashboard" | "workflow";

/**
 * Returning / post-setup business owners always default to the Dashboard.
 * The whiteboard is never the first room for business (#135, comment on opt-in).
 * `step` is accepted for call-site clarity; home does not depend on it today.
 */
export function defaultBusinessNav(
  step?: OnboardingStep | null,
): BusinessHomeNav {
  void step;
  return "dashboard";
}

/** After the path gate: business picks a template; developer owns the whiteboard. */
export function landingStepForPath(path: StudioPath): OnboardingStep {
  return path === "business" ? "template" : "done";
}

/**
 * When the business money book mounts instead of the whiteboard shell.
 * Developer path never shows it (AC-5).
 */
export function showBusinessDashboard(args: {
  path: StudioPath | null | undefined;
  step: OnboardingStep | null | undefined;
  businessNav: BusinessHomeNav;
}): boolean {
  if (args.path !== "business") return false;
  if (args.step === "dashboard") return true;
  if (args.step === "done" && args.businessNav === "dashboard") return true;
  return false;
}

/** Product copy for the opt-in whiteboard affordance (#135). */
export const SEE_HOW_IT_WORKS_LABEL = "See how it works";
