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
  /** Exact money from the API (Decimal serialized as string) or form number. */
  price_ngn?: string | number | null;
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
