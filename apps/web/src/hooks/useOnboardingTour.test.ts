/**
 * Tour dismiss persistence helpers (#103).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isTourDismissed,
  persistTourDismissed,
} from "@/hooks/useOnboardingTour";
import { tourDismissKey } from "@/lib/tourSteps";

function installMemoryStorage() {
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

describe("tour dismiss persistence (#103)", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  afterEach(() => {
    window.localStorage.removeItem(tourDismissKey("business"));
    window.localStorage.removeItem(tourDismissKey("developer"));
  });

  it("starts undismissed then persists skip __AC7", () => {
    expect(isTourDismissed("business")).toBe(false);
    persistTourDismissed("business");
    expect(isTourDismissed("business")).toBe(true);
    expect(isTourDismissed("developer")).toBe(false);
  });

  it("paths dismiss independently __AC7 E-2", () => {
    persistTourDismissed("developer");
    expect(isTourDismissed("developer")).toBe(true);
    expect(isTourDismissed("business")).toBe(false);
  });
});
