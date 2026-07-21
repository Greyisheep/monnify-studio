import { describe, expect, it } from "vitest";

import {
  SEE_HOW_IT_WORKS_LABEL,
  defaultBusinessNav,
  landingStepForPath,
  showBusinessDashboard,
} from "./businessHome";

describe("businessHome routing (#135)", () => {
  it("AC-1: business at dashboard step shows the money book", () => {
    expect(
      showBusinessDashboard({
        path: "business",
        step: "dashboard",
        businessNav: "dashboard",
      }),
    ).toBe(true);
  });

  it("AC-3: See how it works uses the product label", () => {
    expect(SEE_HOW_IT_WORKS_LABEL).toBe("See how it works");
  });

  it("AC-3: opt-in whiteboard hides the Dashboard shell", () => {
    expect(
      showBusinessDashboard({
        path: "business",
        step: "done",
        businessNav: "workflow",
      }),
    ).toBe(false);
  });

  it("AC-4: returning business (step done) defaults to Dashboard home", () => {
    expect(defaultBusinessNav("done")).toBe("dashboard");
    expect(
      showBusinessDashboard({
        path: "business",
        step: "done",
        businessNav: defaultBusinessNav("done"),
      }),
    ).toBe(true);
  });

  it("AC-5: developer door never mounts the business Dashboard", () => {
    expect(landingStepForPath("developer")).toBe("done");
    expect(
      showBusinessDashboard({
        path: "developer",
        step: "done",
        businessNav: "dashboard",
      }),
    ).toBe(false);
  });

  it("business door lands on template setup, not the whiteboard", () => {
    expect(landingStepForPath("business")).toBe("template");
  });
});
