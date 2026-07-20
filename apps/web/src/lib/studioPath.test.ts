import { describe, expect, it } from "vitest";

import {
  readStudioPath,
  STUDIO_PATH_KEY,
  writeStudioPath,
} from "./studioPath";

function memoryStorage(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

describe("studioPath", () => {
  it("reads business and developer", () => {
    expect(
      readStudioPath(memoryStorage({ [STUDIO_PATH_KEY]: "business" })),
    ).toBe("business");
    expect(
      readStudioPath(memoryStorage({ [STUDIO_PATH_KEY]: "developer" })),
    ).toBe("developer");
  });

  it("treats corrupt values as unset", () => {
    expect(readStudioPath(memoryStorage({ [STUDIO_PATH_KEY]: "admin" }))).toBe(
      null,
    );
    expect(readStudioPath(memoryStorage({}))).toBe(null);
  });

  it("writes the chosen path", () => {
    const storage = memoryStorage();
    writeStudioPath("business", storage);
    expect(storage.getItem(STUDIO_PATH_KEY)).toBe("business");
  });
});
