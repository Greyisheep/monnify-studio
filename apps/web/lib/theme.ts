// Design tokens (#38, D14). Everything visual lives here so the designer's real
// palette drops in as a one-file swap. Direction: premium workflow-builder
// (Framer / Chronicle dark, Zapier icon-led cards).

export const theme = {
  bg: "#08080c",
  bgElevated: "#0e0e15",
  panel: "#0c0c12",
  panelBorder: "#1c1c28",
  card: "#13131c",
  cardTop: "#181824",
  cardBorder: "#242433",
  text: "#ececf5",
  textDim: "#9a9aad",
  textFaint: "#5c5c6e",
  dot: "#1a1a26",
  accent: "#7c5cff",
  accentSoft: "rgba(124, 92, 255, 0.15)",
  radius: 14,
  radiusSm: 8,
};

export interface CategoryMeta {
  color: string;
  label: string;
}

export const CATEGORY: Record<string, CategoryMeta> = {
  monnify: { color: "#5b8cff", label: "Monnify" },
  safety: { color: "#2fd28a", label: "Safety" },
  event: { color: "#f5b13d", label: "Event" },
  control: { color: "#9aa4b2", label: "Control" },
  app: { color: "#b57bff", label: "App" },
};

export const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ff5c5c",
  high: "#ff9a3d",
  medium: "#f5c542",
  low: "#5b8cff",
  info: "#9a9aad",
};

export function categoryMeta(category: string): CategoryMeta {
  return CATEGORY[category] ?? { color: "#9aa4b2", label: category };
}
