/**
 * Tour step config tests (#103).
 */
import { describe, expect, it } from "vitest";

import {
  BUSINESS_TOUR_STEPS,
  DEVELOPER_TOUR_STEPS,
  tourDismissKey,
  tourStepsFor,
} from "@/lib/tourSteps";

describe("tourSteps (#103)", () => {
  it("business tour has Figma 7 plain-words steps __AC2", () => {
    expect(tourStepsFor("business")).toHaveLength(7);
    expect(BUSINESS_TOUR_STEPS.map((s) => s.title)).toEqual([
      "Welcome to Monnify Studio",
      "Your money at a glance",
      "The right tool for business",
      "What’s been happening",
      "Find any payment",
      "Get around easily",
      "You’re all set",
    ]);
    for (const step of BUSINESS_TOUR_STEPS) {
      expect(step.chrome).toBe("dashboard");
      expect(step.target).toMatch(/^biz-/);
      expect(`${step.title} ${step.body}`.toLowerCase()).not.toMatch(
        /\bir\b|sse|node_type/,
      );
    }
  });

  it("developer tour has ≤3 steps pointing at catalog/chat/run __AC4 AC9", () => {
    expect(tourStepsFor("developer")).toHaveLength(3);
    expect(DEVELOPER_TOUR_STEPS.map((s) => s.target)).toEqual([
      "dev-catalog",
      "dev-chat",
      "dev-run",
    ]);
    for (const step of DEVELOPER_TOUR_STEPS) {
      expect(step.chrome).toBe("hover");
      expect(`${step.title} ${step.body}`.toLowerCase()).not.toMatch(
        /\bir\b|sse|node_type/,
      );
    }
  });

  it("uses stable dismiss keys __AC7", () => {
    expect(tourDismissKey("business")).toBe(
      "monnify.studio.tour.dismissed.business",
    );
    expect(tourDismissKey("developer")).toBe(
      "monnify.studio.tour.dismissed.developer",
    );
  });
});
