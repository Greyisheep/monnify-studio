/**
 * Catalog row reorder math (Figma `112:4924`).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyStoredOrder,
  insertionIndexFor,
  loadPaletteOrder,
  moveWithinList,
  PALETTE_ORDER_KEY,
  savePaletteOrder,
  type PaletteOrder,
} from "@/lib/paletteOrder";

describe("moveWithinList __AC4", () => {
  const items = ["A", "B", "C", "D"];

  it("moves an item forward to a later insertion point", () => {
    expect(moveWithinList(items, 0, 2)).toEqual(["B", "A", "C", "D"]);
  });

  it("moves an item backward to an earlier insertion point", () => {
    expect(moveWithinList(items, 3, 1)).toEqual(["A", "D", "B", "C"]);
  });

  it("no-ops when the drop resolves to the item's own slot __E-2", () => {
    expect(moveWithinList(items, 1, 1)).toEqual(items);
    expect(moveWithinList(items, 1, 2)).toEqual(items);
  });

  it("clamps out-of-range indices instead of throwing", () => {
    expect(moveWithinList(items, 0, 99)).toEqual(["B", "C", "D", "A"]);
    expect(moveWithinList(items, -1, 2)).toEqual(items);
    expect(moveWithinList(items, 9, 2)).toEqual(items);
  });
});

describe("insertionIndexFor __AC3", () => {
  it("targets before the hovered row when pointer is in its top half", () => {
    expect(insertionIndexFor(2, 0)).toBe(2);
    expect(insertionIndexFor(2, 0.49)).toBe(2);
  });

  it("targets after the hovered row when pointer is in its bottom half", () => {
    expect(insertionIndexFor(2, 0.5)).toBe(3);
    expect(insertionIndexFor(2, 1)).toBe(3);
  });
});

describe("applyStoredOrder __AC8", () => {
  const items = [{ type: "a" }, { type: "b" }, { type: "c" }];
  const getKey = (item: { type: string }) => item.type;

  it("lays items out per the stored order", () => {
    expect(applyStoredOrder(items, ["c", "a", "b"], getKey).map(getKey)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("keeps items missing from stored order in their existing relative position", () => {
    expect(applyStoredOrder(items, ["b"], getKey).map(getKey)).toEqual(["b", "a", "c"]);
  });

  it("ignores stored keys no longer present in the catalog __E-4", () => {
    expect(applyStoredOrder(items, ["zzz", "c", "a"], getKey).map(getKey)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("returns items unchanged when there is no stored order", () => {
    expect(applyStoredOrder(items, undefined, getKey)).toEqual(items);
    expect(applyStoredOrder(items, [], getKey)).toEqual(items);
  });
});

describe("palette order persistence __AC4", () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
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
  });

  afterEach(() => {
    window.localStorage.removeItem(PALETTE_ORDER_KEY);
  });

  it("round-trips an order per category", () => {
    expect(loadPaletteOrder()).toEqual({});
    const order: PaletteOrder = { "Accept Payments": ["monnify.invoice", "monnify.sell"] };
    savePaletteOrder(order);
    expect(loadPaletteOrder()).toEqual(order);
  });

  it("ignores malformed stored JSON instead of throwing", () => {
    window.localStorage.setItem(PALETTE_ORDER_KEY, "{not json");
    expect(loadPaletteOrder()).toEqual({});
  });

  it("ignores a stored shape that isn't category -> string[]", () => {
    window.localStorage.setItem(
      PALETTE_ORDER_KEY,
      JSON.stringify({ "Accept Payments": [1, 2, 3] }),
    );
    expect(loadPaletteOrder()).toEqual({});
  });
});
