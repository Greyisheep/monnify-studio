/**
 * Catalog row reorder within a group (Figma `112:4924`).
 * Pure list/order math kept separate from NodePalette's DOM-facing drag
 * handlers so it's unit-testable without touching DataTransfer/DOM rects.
 */

export const PALETTE_ORDER_KEY = "monnify.studio.palette.order";

/** category label -> ordered catalog type keys */
export type PaletteOrder = Record<string, string[]>;

export function loadPaletteOrder(): PaletteOrder {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PALETTE_ORDER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: PaletteOrder = {};
    for (const [category, order] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(order) && order.every((key) => typeof key === "string")) {
        out[category] = order;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function savePaletteOrder(order: PaletteOrder): void {
  try {
    window.localStorage.setItem(PALETTE_ORDER_KEY, JSON.stringify(order));
  } catch {
    // private mode / storage full — reorder just won't persist this session
  }
}

/**
 * Lays `items` out per `storedOrder` (a list of keys), keeping any item not
 * mentioned in `storedOrder` in its existing relative position instead of
 * dropping it or forcing it to the end (AC-8).
 */
export function applyStoredOrder<T>(
  items: readonly T[],
  storedOrder: readonly string[] | undefined,
  getKey: (item: T) => string,
): T[] {
  if (!storedOrder || storedOrder.length === 0) return [...items];
  const byKey = new Map(items.map((item) => [getKey(item), item] as const));
  const ordered: T[] = [];
  const used = new Set<string>();
  for (const key of storedOrder) {
    const item = byKey.get(key);
    if (item && !used.has(key)) {
      ordered.push(item);
      used.add(key);
    }
  }
  for (const item of items) {
    const key = getKey(item);
    if (!used.has(key)) {
      ordered.push(item);
      used.add(key);
    }
  }
  return ordered;
}

/**
 * Moves the item at `fromIndex` so it lands at insertion point `toIndexRaw`
 * (an index into the *original* array, e.g. from `insertionIndexFor`).
 * No-ops (returns an equivalent-order copy) when the target resolves back
 * to the item's own slot (E-2).
 */
export function moveWithinList<T>(
  items: readonly T[],
  fromIndex: number,
  toIndexRaw: number,
): T[] {
  const length = items.length;
  if (fromIndex < 0 || fromIndex >= length) return [...items];
  const clampedRaw = Math.max(0, Math.min(toIndexRaw, length));
  const copy = [...items];
  const [moved] = copy.splice(fromIndex, 1);
  const adjusted = clampedRaw > fromIndex ? clampedRaw - 1 : clampedRaw;
  copy.splice(adjusted, 0, moved);
  return copy;
}

/**
 * Given the row index under the pointer and how far down that row's own
 * height the pointer sits (0 = top edge, 1 = bottom edge), resolves which
 * insertion slot (index into the original array) the drop targets.
 */
export function insertionIndexFor(hoverIndex: number, pointerFraction: number): number {
  return pointerFraction < 0.5 ? hoverIndex : hoverIndex + 1;
}
