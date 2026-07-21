/**
 * Palette drag MIME + tip persistence tests.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DRAG_DROP_TIP_KEY,
  isDragDropTipDismissed,
  persistDragDropTipDismissed,
  readDragNodeType,
  STUDIO_DND_MIME,
  writeDragNodeType,
} from "@/lib/studioDnd";

describe("studioDnd (#103)", () => {
  it("round-trips node type on DataTransfer __AC2", () => {
    const store = new Map<string, string>();
    const dt = {
      setData(type: string, value: string) {
        store.set(type, value);
      },
      getData(type: string) {
        return store.get(type) ?? "";
      },
      effectAllowed: "none",
    } as DataTransfer;
    writeDragNodeType(dt, "monnify.invoice");
    expect(store.get(STUDIO_DND_MIME)).toBe("monnify.invoice");
    expect(readDragNodeType(dt)).toBe("monnify.invoice");
    expect(
      readDragNodeType({ getData: () => "" } as unknown as DataTransfer),
    ).toBeNull();
  });

  describe("tip dismiss __AC7", () => {
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
      window.localStorage.removeItem(DRAG_DROP_TIP_KEY);
    });

    it("persists dismiss", () => {
      expect(isDragDropTipDismissed()).toBe(false);
      persistDragDropTipDismissed();
      expect(isDragDropTipDismissed()).toBe(true);
    });
  });
});
