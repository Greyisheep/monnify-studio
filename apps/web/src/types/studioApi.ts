/**
 * Interim hand ports of templates / artifacts / credentials API contracts.
 * Mirrors monnify_studio.templates.TemplateInfo, artifacts.ArtifactConfig,
 * credentials.CredentialStatus (+ write body), store list_summaries.
 * Target: D6 JSON Schema codegen. Provenance: #55, #51, #52, #68, D17, D19.
 */

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  version: number;
  versions: number;
}

export interface TemplateInfo {
  id: string;
  title: string;
  persona: string;
  description: string;
}

export interface CredentialStatus {
  workflow_id: string;
  configured: boolean;
  source: "workflow" | "platform" | "none" | string;
}

export interface MonnifyCredentialInput {
  api_key: string;
  secret_key: string;
  contract_code: string;
}

/** Subset of ArtifactConfig the Seller form edits (#55, #61). */
export interface ArtifactConfigInput {
  business_name?: string;
  product_name?: string;
  price_ngn?: number;
  accent_color?: string;
  tagline?: string;
  logo_url?: string;
}

export interface GenerateArtifactResult {
  artifact_id: string;
  preview_url: string;
  dashboard_url: string;
}

/** GET /workflows/{id}/code (#146 / #152). */
export interface GeneratedCode {
  language: string;
  filename: string;
  code: string;
}
