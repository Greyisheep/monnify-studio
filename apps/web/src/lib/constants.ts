/**
 * Hero workflow ids and the Add-node palette. Provenance: #4.
 */
import type { NodeCategory } from "@/types";

export const HEROES = [
  { id: "marketplace-unsafe", label: "Unsafe hero" },
  { id: "marketplace-safe", label: "Safe hero" },
] as const;

export type HeroId = (typeof HEROES)[number]["id"];

export interface PaletteItem {
  type: string;
  category: NodeCategory;
}

export const NODE_PALETTE: PaletteItem[] = [
  { type: "safety.verify_signature", category: "safety" },
  { type: "safety.validate_amount", category: "safety" },
  { type: "safety.idempotency_guard", category: "safety" },
  { type: "monnify.verify_transaction", category: "monnify" },
  { type: "monnify.initiate_transfer", category: "monnify" },
  { type: "app.notify", category: "application" },
  { type: "event.payment_webhook", category: "event" },
];
