export type StudioPath = "business" | "developer";

/** template kept only so older sessions still load; new business flow uses dashboard. */
export type OnboardingStep =
  | "user_type"
  | "products"
  | "dashboard"
  | "template"
  | "done";

export interface ShopProduct {
  id?: string;
  name: string;
  price_ngn?: number | null;
  image_url?: string | null;
}

export interface StudioProfile {
  session_id: string;
  path: StudioPath | null;
  step: OnboardingStep;
  products: ShopProduct[];
}

export interface StudioProfileUpdate {
  path?: StudioPath | null;
  step?: OnboardingStep;
  products?: ShopProduct[];
}
