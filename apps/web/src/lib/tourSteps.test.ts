import { describe, expect, it } from "vitest";

import { tourDismissKey, tourStepsFor } from "@/lib/tourSteps";

describe("tourSteps (#103)", () => {
  it("has at most 3 plain-words steps per path", () => {
    expect(tourStepsFor("business")).toHaveLength(3);
    expect(tourStepsFor("developer")).toHaveLength(3);
    for (const step of [
      ...tourStepsFor("business"),
      ...tourStepsFor("developer"),
    ]) {
      expect(step.body.toLowerCase()).not.toMatch(/\bir\b|sse|node_type/);
    }
  });

  it("uses stable dismiss keys", () => {
    expect(tourDismissKey("business")).toBe(
      "monnify.studio.tour.dismissed.business",
    );
  });
});
