/**
 * Studio API surface: live FastAPI preferred, offline fixtures as fallback.
 * Transport lives in `./http` (axios). Hooks/components stay unaware of it.
 * Provenance: #4, #27, #28, #44, #15, #55, #51, #52, #68, #152, D6, D17, D19.
 */
import type {
  AnalysisReport,
  ArtifactConfigInput,
  ComposeResult,
  CredentialStatus,
  ExecutionEvent,
  ExecutionRun,
  ExplainResult,
  GenerateArtifactResult,
  GeneratedCode,
  IntentResult,
  MonnifyCredentialInput,
  NodeMeta,
  RemediateResult,
  StartExecutionResult,
  StudioProfile,
  StudioProfileUpdate,
  TemplateInfo,
  Workflow,
  WorkflowPayload,
  WorkflowSummary,
} from "@/types";

import unsafePayload from "@/data/marketplace-unsafe.json";
import safePayload from "@/data/marketplace-safe.json";
import unsafeAnalysis from "@/data/marketplace-unsafe.analysis.json";
import safeAnalysis from "@/data/marketplace-safe.analysis.json";

import {
  API_BASE,
  getJson,
  getOptional,
  postJson,
  putJson,
} from "./http";

export type DataSource = "api" | "fixture";

export interface LoadResult<T> {
  data: T;
  source: DataSource;
}

export interface ValidateConnectionBody {
  source_type: string;
  target_type: string;
  source_port?: string;
  target_port?: string;
}

export interface ValidateConnectionResult {
  ok: boolean;
  message: string;
}

export interface WorkflowDashboardDto {
  artifact_id: string | null;
  shop_path: string | null;
  /** Goal-aware share link (#160): shop for sellers, contribute for ajo. */
  share_kind: "shop" | "contribute" | null;
  share_label: string;
  share_path: string | null;
  business_name: string;
  totals: {
    money_in: string;
    money_out: string;
    profit: string;
    needs_attention: number;
  } | null;
  invoices: Array<{
    reference: string;
    amount: string | number;
    status: string;
    customer: string;
    description: string;
    product: string;
    created_at?: string;
    kind: string;
  }>;
  activity: Array<{ ts: string; kind: string; text: string }>;
}

const LOCAL_WORKFLOWS: Record<string, WorkflowPayload> = {
  "marketplace-unsafe": unsafePayload as WorkflowPayload,
  "marketplace-safe": safePayload as WorkflowPayload,
};

const LOCAL_ANALYSIS: Record<string, AnalysisReport> = {
  "marketplace-unsafe": unsafeAnalysis as AnalysisReport,
  "marketplace-safe": safeAnalysis as AnalysisReport,
};

export async function fetchWorkflow(
  workflowId: string,
): Promise<LoadResult<WorkflowPayload>> {
  const live = await getOptional<WorkflowPayload>(`/workflows/${workflowId}`);
  if (live) return { data: live, source: "api" };
  const local = LOCAL_WORKFLOWS[workflowId];
  if (!local) throw new Error(`Unknown workflow: ${workflowId}`);
  return { data: local, source: "fixture" };
}

export async function fetchAnalysis(
  workflowId: string,
): Promise<LoadResult<AnalysisReport>> {
  const live = await getOptional<AnalysisReport>(
    `/workflows/${workflowId}/analysis`,
  );
  if (live) return { data: live, source: "api" };
  const local = LOCAL_ANALYSIS[workflowId];
  if (!local) throw new Error(`Unknown workflow: ${workflowId}`);
  return { data: local, source: "fixture" };
}

export async function analyzeWorkflow(workflow: Workflow): Promise<AnalysisReport> {
  return postJson<AnalysisReport>("/analyze", workflow);
}

export async function fetchCatalog(): Promise<Record<string, NodeMeta>> {
  const live = await getOptional<Record<string, NodeMeta>>("/catalog");
  if (live) return live;
  return {
    ...LOCAL_WORKFLOWS["marketplace-unsafe"].node_types,
    ...LOCAL_WORKFLOWS["marketplace-safe"].node_types,
  };
}

export async function validateConnection(
  body: ValidateConnectionBody,
): Promise<ValidateConnectionResult> {
  try {
    return await postJson<ValidateConnectionResult>("/validate-connection", body);
  } catch {
    return { ok: true, message: "" };
  }
}

export async function resetWorkflow(workflowId: string): Promise<WorkflowPayload> {
  return postJson<WorkflowPayload>(`/workflows/${workflowId}/reset`, {});
}

export async function saveWorkflow(workflow: Workflow): Promise<WorkflowPayload> {
  return putJson<WorkflowPayload>(`/workflows/${workflow.id}`, workflow);
}

/** Deterministic Flow → Python module (#146). Code tab (#152). */
export async function fetchWorkflowCode(
  workflowId: string,
  lang: string = "python",
  signal?: AbortSignal,
): Promise<GeneratedCode> {
  return getJson<GeneratedCode>(`/workflows/${workflowId}/code`, {
    params: { lang },
    signal,
  });
}

export async function remediateWorkflow(
  workflow: Workflow,
  ruleId?: string | null,
): Promise<RemediateResult> {
  return postJson<RemediateResult>("/remediate", {
    workflow,
    rule_id: ruleId ?? "ALL",
  });
}

/** Start a mock IR run (#8). Live API required; no fixture fallback. */
export async function startExecution(
  workflow: Workflow,
  adapter: "mock" = "mock",
): Promise<StartExecutionResult> {
  return postJson<StartExecutionResult>("/executions", { workflow, adapter });
}

export async function fetchExecution(runId: string): Promise<ExecutionRun> {
  const live = await getOptional<ExecutionRun>(`/executions/${runId}`);
  if (!live) throw new Error(`Unknown run: ${runId}`);
  return live;
}

export async function fetchExecutionEvents(
  runId: string,
): Promise<ExecutionEvent[]> {
  const live = await getOptional<ExecutionEvent[]>(`/executions/${runId}/events`);
  if (!live) throw new Error(`Unknown run events: ${runId}`);
  return live;
}

/**
 * Consume the SSE execution stream (#8 / #28).
 * Kept on fetch: axios has no first-class ReadableStream / SSE story.
 */
export async function streamExecutionEvents(
  runId: string,
  onEvent: (event: ExecutionEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/executions/${runId}/events/stream`, {
    headers: { Accept: "text/event-stream" },
    credentials: "include",
    signal,
    cache: "no-store",
  });
  if (!response.ok || !response.body) {
    throw new Error(`${response.status} /executions/${runId}/events/stream`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (eventName === "done") return;
      if (dataLines.length === 0) continue;
      const payload = dataLines.join("\n");
      if (!payload || payload === "{}") continue;
      onEvent(JSON.parse(payload) as ExecutionEvent);
    }
  }
}

export async function composeWorkflow(message: string): Promise<ComposeResult> {
  return postJson<ComposeResult>("/assistant/compose", { message });
}

/** Doc-grounded Why? answers (#76 / D20). */
export async function explainAssistant(body: {
  question: string;
  node_type?: string | null;
  workflow_id?: string | null;
}): Promise<ExplainResult> {
  return postJson<ExplainResult>("/assistant/explain", body);
}

/** Revise an existing canvas flow without changing its workflow id (#154). */
export async function refineWorkflow(
  workflowId: string,
  message: string,
): Promise<ComposeResult> {
  return postJson<ComposeResult>("/assistant/refine", {
    workflow_id: workflowId,
    message,
  });
}

export async function classifyIntent(message: string): Promise<IntentResult> {
  return postJson<IntentResult>("/assistant/intent", { message });
}

export async function createFromTemplate(
  templateId: string,
): Promise<WorkflowPayload> {
  return postJson<WorkflowPayload>(`/workflows/from-template/${templateId}`, {});
}

export async function listWorkflows(): Promise<WorkflowSummary[]> {
  return (await getOptional<WorkflowSummary[]>("/workflows")) ?? [];
}

export async function listTemplates(): Promise<TemplateInfo[]> {
  return (await getOptional<TemplateInfo[]>("/templates")) ?? [];
}

export async function fetchCredentialStatus(
  workflowId: string,
): Promise<CredentialStatus | null> {
  return getOptional<CredentialStatus>(`/workflows/${workflowId}/credentials`);
}

export async function putCredentials(
  workflowId: string,
  creds: MonnifyCredentialInput,
): Promise<CredentialStatus> {
  return putJson<CredentialStatus>(`/workflows/${workflowId}/credentials`, creds);
}

export async function generateArtifact(
  workflowId: string,
  config: ArtifactConfigInput = {},
): Promise<GenerateArtifactResult> {
  return postJson<GenerateArtifactResult>(`/workflows/${workflowId}/generate`, {
    config,
  });
}

export async function fetchStudioProfile(): Promise<StudioProfile | null> {
  return getOptional<StudioProfile>("/studio/profile");
}

export async function putStudioProfile(
  patch: StudioProfileUpdate,
): Promise<StudioProfile> {
  return putJson<StudioProfile>("/studio/profile", patch);
}

/** The business Dashboard's data (money book, invoices, activity), keyed by
 *  workflow id so the UI never threads an artifact id through onboarding (#135). */
export async function fetchWorkflowDashboard(
  workflowId: string,
): Promise<WorkflowDashboardDto | null> {
  return getOptional<WorkflowDashboardDto>(`/workflows/${workflowId}/dashboard`);
}

export { API_BASE, absoluteApiUrl, ApiError } from "./http";
