/**
 * Post-door walkthrough steps (#103) — Figma Onboarding Tour (business 7-step).
 * Card chrome: https://www.figma.com/design/jj9fKZamdwfNDVD5rGQI9G/…?node-id=189-6968
 */
export type TourPath = "business" | "developer";

export type TourChrome = "dashboard" | "hover";

export interface TourStep {
  id: string;
  /** `data-tour` attribute value; empty string = center card, no spotlight */
  target: string;
  title: string;
  body: string;
  chrome: TourChrome;
  /** Optional preview image inside the dashboard card (Figma media slot). */
  imageSrc?: string;
}

export const BUSINESS_TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    target: "biz-main",
    title: "Welcome to Monnify Studio",
    body: "Quick tour of your dashboard, it only takes a minute.",
    chrome: "dashboard",
    imageSrc: "/figma/tour/tour-step-1.png",
  },
  {
    id: "overview",
    target: "biz-overview",
    title: "Your money at a glance",
    body: "Total inflow, total outflow, net profit, and anything that needs your attention, all in one row.",
    chrome: "dashboard",
    imageSrc: "/figma/tour/tour-step-2.png",
  },
  {
    id: "tools",
    target: "biz-tools",
    title: "The right tool for business",
    body: "This changes based on what you set up, share your shop link, send an invoice, or pay your staff.",
    chrome: "dashboard",
    imageSrc: "/figma/tour/tour-step-3.png",
  },
  {
    id: "activity",
    target: "biz-activity",
    title: "What’s been happening",
    body: "A summary of your recent payments and payouts at a quick glance.",
    chrome: "dashboard",
    imageSrc: "/figma/tour/tour-step-4.png",
  },
  {
    id: "payments",
    target: "biz-transactions",
    title: "Find any payment",
    body: "Search by name or reference, filter by type or status, and see every payment in detail.",
    chrome: "dashboard",
    imageSrc: "/figma/tour/tour-step-5.png",
  },
  {
    id: "nav",
    target: "biz-nav",
    title: "Get around easily",
    body: "New starts something fresh, Dashboard is home, and Workflow is for the technical side",
    chrome: "dashboard",
    imageSrc: "/figma/tour/tour-step-6.png",
  },
  {
    id: "done",
    target: "biz-main",
    title: "You’re all set",
    body: "That is everything you need to know about monnify studio.",
    chrome: "dashboard",
    imageSrc: "/figma/tour/tour-step-7.png",
  },
];

export const DEVELOPER_TOUR_STEPS: TourStep[] = [
  {
    id: "catalog",
    target: "dev-catalog",
    title: "API catalog",
    body: "Drag Monnify building blocks onto the whiteboard to build a Flow.",
    chrome: "hover",
  },
  {
    id: "chat",
    target: "dev-chat",
    title: "Moni chat",
    body: "Describe what you want in plain words — Moni can compose or fix a Flow.",
    chrome: "hover",
  },
  {
    id: "run",
    target: "dev-run",
    title: "Practice run",
    body: "Run with practice money first. No real cash moves until you connect Monnify.",
    chrome: "hover",
  },
];

export function tourStepsFor(path: TourPath): TourStep[] {
  return path === "business" ? BUSINESS_TOUR_STEPS : DEVELOPER_TOUR_STEPS;
}

export function tourDismissKey(path: TourPath): string {
  return `monnify.studio.tour.dismissed.${path}`;
}
