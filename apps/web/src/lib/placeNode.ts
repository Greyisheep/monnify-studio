export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

function overlaps(
  a: Point,
  b: Point,
  size: Size,
): boolean {
  return !(
    a.x + size.w <= b.x ||
    b.x + size.w <= a.x ||
    a.y + size.h <= b.y ||
    b.y + size.h <= a.y
  );
}

/** Find a canvas position that does not fully overlap existing node boxes. */
export function placeFreeOfNodes(
  existing: Point[],
  size: Size = { w: 180, h: 72 },
  origin: Point = { x: 80, y: 80 },
): Point {
  const gap = 24;
  const candidates: Point[] = [origin];
  for (let ring = 1; ring <= 12; ring += 1) {
    for (let i = 0; i < ring * 4; i += 1) {
      const side = Math.floor(i / ring) % 4;
      const step = i % ring;
      const offset = (size.w + gap) * (step + 1);
      if (side === 0) candidates.push({ x: origin.x + offset, y: origin.y });
      if (side === 1) candidates.push({ x: origin.x, y: origin.y + offset });
      if (side === 2) candidates.push({ x: origin.x - offset, y: origin.y });
      if (side === 3) candidates.push({ x: origin.x, y: origin.y - offset });
    }
  }

  for (const candidate of candidates) {
    const blocked = existing.some((point) => overlaps(candidate, point, size));
    if (!blocked) return candidate;
  }
  return {
    x: origin.x + (size.w + gap) * (existing.length + 1),
    y: origin.y,
  };
}
