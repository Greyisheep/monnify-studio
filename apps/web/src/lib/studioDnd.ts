/**
 * Palette → canvas drag MIME (#103 Drag & Drop Feature).
 */
export const STUDIO_DND_MIME = "application/x-monnify-studio-node";

export const DRAG_DROP_TIP_KEY = "monnify.studio.tip.drag-drop.dismissed";

export function readDragNodeType(dataTransfer: DataTransfer): string | null {
  const raw = dataTransfer.getData(STUDIO_DND_MIME).trim();
  return raw.length > 0 ? raw : null;
}

export function writeDragNodeType(
  dataTransfer: DataTransfer,
  typeKey: string,
): void {
  dataTransfer.setData(STUDIO_DND_MIME, typeKey);
  dataTransfer.effectAllowed = "copyMove";
}

export function isDragDropTipDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(DRAG_DROP_TIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistDragDropTipDismissed(): void {
  try {
    window.localStorage.setItem(DRAG_DROP_TIP_KEY, "1");
  } catch {
    // private mode
  }
}
