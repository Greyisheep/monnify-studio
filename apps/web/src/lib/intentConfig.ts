/**
 * Map Moni intent.config onto ArtifactConfig for generate (#55, #15, D17).
 * Pure: no network. Keeps Chat setup and Seller form aligned.
 */
import type { ArtifactConfigInput, IntentResult } from "@/types";

export function intentToArtifactConfig(
  config: IntentResult["config"],
): ArtifactConfigInput {
  const price = config.price_ngn;
  return {
    business_name:
      typeof config.business_name === "string" && config.business_name
        ? config.business_name
        : undefined,
    product_name:
      typeof config.product_name === "string" && config.product_name
        ? config.product_name
        : undefined,
    price_ngn: typeof price === "number" ? price : Number(price) || undefined,
  };
}
