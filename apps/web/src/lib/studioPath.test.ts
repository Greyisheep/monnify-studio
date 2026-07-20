import { describe, expect, it } from "vitest";

import type { StudioPath } from "./studioPath";

describe("studioPath type re-export", () => {
  it("accepts business and developer", () => {
    const paths: StudioPath[] = ["business", "developer"];
    expect(paths).toHaveLength(2);
  });
});
