/**
 * Seller-first plain-words copy (#80, D14).
 */
import type { NodeCategory, NodeMeta } from "@/types";

export const PRACTICE_RUN_LABEL = "Practice run (no real money)";
export const PRACTICE_RUN_RUNNING = "Running…";

export const CREDENTIALS_HEADING = "Connect your Monnify account";
export const CREDENTIALS_SUBHEAD =
  "Optional: we use a practice account until then.";

const CATEGORY_LABEL: Record<NodeCategory, string> = {
  monnify: "Accept Payments",
  event: "Events",
  control: "Control",
  safety: "Safety",
  application: "Application",
};

export function categoryLabel(category: NodeCategory | string): string {
  return CATEGORY_LABEL[category as NodeCategory] ?? String(category);
}

/** Safety/control nodes stay in the Advanced palette section (#80). */
export function isAdvancedCatalogNode(meta: NodeMeta): boolean {
  return meta.category === "safety" || meta.category === "control";
}
