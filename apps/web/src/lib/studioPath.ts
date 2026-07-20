export type StudioPath = "business" | "developer";

export const STUDIO_PATH_KEY = "monnify.studio.path";

export function readStudioPath(
  storage: Pick<Storage, "getItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
): StudioPath | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STUDIO_PATH_KEY);
    if (raw === "business" || raw === "developer") return raw;
    return null;
  } catch {
    return null;
  }
}

export function writeStudioPath(
  path: StudioPath,
  storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(STUDIO_PATH_KEY, path);
  } catch {
    // Private mode / quota — path still works for this session via React state.
  }
}
