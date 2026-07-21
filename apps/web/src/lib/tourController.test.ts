/**
 * Tour controller pure helpers (#103).
 */
import { describe, expect, it } from "vitest";

import {
  nextStepIndex,
  prevStepIndex,
  primaryActionLabel,
  progressLabel,
  shouldActivateTour,
} from "@/lib/tourController";
import { tourStepsFor } from "@/lib/tourSteps";

describe("tourController (#103)", () => {
  it("activates business when ready and not dismissed __AC1", () => {
    expect(
      shouldActivateTour({ path: "business", ready: true, dismissed: false }),
    ).toBe(true);
  });

  it("activates developer when ready and not dismissed __AC3", () => {
    expect(
      shouldActivateTour({ path: "developer", ready: true, dismissed: false }),
    ).toBe(true);
  });

  it("does not activate during unfinished chrome (ready false) __AC10", () => {
    expect(
      shouldActivateTour({ path: "business", ready: false, dismissed: false }),
    ).toBe(false);
    expect(
      shouldActivateTour({ path: null, ready: true, dismissed: false }),
    ).toBe(false);
  });

  it("business ready gate requires caller to pass products/data __AC1", () => {
    // StudioApp sets ready=false until profile.products.length > 0
    expect(
      shouldActivateTour({ path: "business", ready: false, dismissed: false }),
    ).toBe(false);
    expect(
      shouldActivateTour({ path: "business", ready: true, dismissed: false }),
    ).toBe(true);
  });

  it("does not re-activate after dismiss __AC7", () => {
    expect(
      shouldActivateTour({ path: "business", ready: true, dismissed: true }),
    ).toBe(false);
  });

  it("advances and finishes steps __AC5", () => {
    const count = tourStepsFor("business").length;
    expect(nextStepIndex(0, count)).toEqual({ index: 1, finished: false });
    expect(nextStepIndex(count - 1, count)).toEqual({
      index: count - 1,
      finished: true,
    });
    expect(prevStepIndex(0)).toBe(0);
    expect(prevStepIndex(2)).toBe(1);
  });

  it("uses Figma progress and Done/Got it labels __AC5 AC6", () => {
    expect(progressLabel("dashboard", 0, 7)).toBe("Step 1 of 7");
    expect(progressLabel("hover", 1, 3)).toBe("2/3");
    expect(primaryActionLabel("dashboard", false)).toBe("Next");
    expect(primaryActionLabel("dashboard", true)).toBe("Done");
    expect(primaryActionLabel("hover", true)).toBe("Got it");
  });
});
