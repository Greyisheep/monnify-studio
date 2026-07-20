import { describe, expect, it } from "vitest";

import { placeFreeOfNodes } from "./placeNode";

describe("placeFreeOfNodes", () => {
  it("returns origin when canvas is empty", () => {
    expect(placeFreeOfNodes([], { w: 180, h: 72 }, { x: 40, y: 50 })).toEqual({
      x: 40,
      y: 50,
    });
  });

  it("avoids overlapping an existing node at origin", () => {
    const next = placeFreeOfNodes([{ x: 80, y: 80 }], { w: 180, h: 72 }, {
      x: 80,
      y: 80,
    });
    expect(next).not.toEqual({ x: 80, y: 80 });
    const overlaps =
      Math.abs(next.x - 80) < 180 && Math.abs(next.y - 80) < 72;
    expect(overlaps).toBe(false);
  });
});
