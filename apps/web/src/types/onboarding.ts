export type StudioPath = "business" | "developer";

/** What a business wants to do after picking User Type. */
export type BusinessGoal =
  | "sell"
  | "invoice"
  | "payroll"
  | "savings"
  | "other";

/**
 * template = existing template picker ("What do you want to set up?").
 * intent kept so older mistaken sessions still load (UI treats as template).
 * products only for sell-online / shop path.
 */
export type OnboardingStep =
  | "user_type"
  | "intent"
  | "template"
  | "products"
  | "dashboard"
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
  goal: BusinessGoal | null;
  products: ShopProduct[];
}

export interface StudioProfileUpdate {
  path?: StudioPath | null;
  step?: OnboardingStep;
  goal?: BusinessGoal | null;
  products?: ShopProduct[];
}
