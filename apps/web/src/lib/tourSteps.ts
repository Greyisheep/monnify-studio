/**
 * Post-door walkthrough steps (#103 EPIC-2).
 */
export type TourPath = "business" | "developer";

export interface TourStep {
  id: string;
  target: string;
  title: string;
  body: string;
}

export const BUSINESS_TOUR_STEPS: TourStep[] = [
  {
    id: "products",
    target: "biz-products",
    title: "Your products",
    body: "Add what you sell so customers can pick and pay.",
  },
  {
    id: "shop",
    target: "biz-shop-link",
    title: "Your share link",
    body: "Copy this link and send it anywhere — WhatsApp, Instagram, SMS.",
  },
  {
    id: "activity",
    target: "biz-activity",
    title: "Money book",
    body: "Payments and activity show up here as people pay you.",
  },
];

export const DEVELOPER_TOUR_STEPS: TourStep[] = [
  {
    id: "catalog",
    target: "dev-catalog",
    title: "API catalog",
    body: "Drag Monnify building blocks onto the whiteboard to build a Flow.",
  },
  {
    id: "chat",
    target: "dev-chat",
    title: "Moni chat",
    body: "Describe what you want in plain words — Moni can compose or fix a Flow.",
  },
  {
    id: "run",
    target: "dev-run",
    title: "Practice run",
    body: "Run with practice money first. No real cash moves until you connect Monnify.",
  },
];

export function tourStepsFor(path: TourPath): TourStep[] {
  return path === "business" ? BUSINESS_TOUR_STEPS : DEVELOPER_TOUR_STEPS;
}

export function tourDismissKey(path: TourPath): string {
  return `monnify.studio.tour.dismissed.${path}`;
}
