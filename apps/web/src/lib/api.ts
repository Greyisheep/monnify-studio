/**
 * Studio HTTP client: live FastAPI preferred, offline fixtures as fallback.
 * Hides transport details from hooks/components. Provenance: #4, #27, #28, #44, D6.
 */
import type {
  AnalysisReport,
  ComposeResult,
  ExecutionEvent,
  ExecutionRun,
  IntentResult,
  NodeMeta,
  RemediateResult,
  StartExecutionResult,
  Workflow,
  WorkflowPayload,
} from "@/types";

import unsafePayload from "@/data/marketplace-unsafe.json";
import safePayload from "@/data/marketplace-safe.json";
import unsafeAnalysis from "@/data/marketplace-unsafe.analysis.json";
import safeAnalysis from "@/data/marketplace-safe.analysis.json";

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8010";

const LOCAL_WORKFLOWS: Record<string, WorkflowPayload> = {
  "marketplace-unsafe": unsafePayload as WorkflowPayload,
  "marketplace-safe": safePayload as WorkflowPayload,
};

const LOCAL_ANALYSIS: Record<string, AnalysisReport> = {
  "marketplace-unsafe": unsafeAnalysis as AnalysisReport,
  "marketplace-safe": safeAnalysis as AnalysisReport,
};

async function tryGetJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${path}: ${text}`);
  }
  return response.json() as Promise<T>;
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${path}: ${text}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchWorkflow(
  workflowId: string,
): Promise<LoadResult<WorkflowPayload>> {
  const live = await tryGetJson<WorkflowPayload>(`/workflows/${workflowId}`);
  if (live) return { data: live, source: "api" };
  const local = LOCAL_WORKFLOWS[workflowId];
  if (!local) throw new Error(`Unknown workflow: ${workflowId}`);
  return { data: local, source: "fixture" };
}

export async function fetchAnalysis(
  workflowId: string,
): Promise<LoadResult<AnalysisReport>> {
  const live = await tryGetJson<AnalysisReport>(`/workflows/${workflowId}/analysis`);
  if (live) return { data: live, source: "api" };
  const local = LOCAL_ANALYSIS[workflowId];
  if (!local) throw new Error(`Unknown workflow: ${workflowId}`);
  return { data: local, source: "fixture" };
}

export async function analyzeWorkflow(workflow: Workflow): Promise<AnalysisReport> {
  return postJson<AnalysisReport>("/analyze", workflow);
}

export async function fetchCatalog(): Promise<Record<string, NodeMeta>> {
  const live = await tryGetJson<Record<string, NodeMeta>>("/catalog");
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
  const live = await tryGetJson<ExecutionRun>(`/executions/${runId}`);
  if (!live) throw new Error(`Unknown run: ${runId}`);
  return live;
}

export async function fetchExecutionEvents(
  runId: string,
): Promise<ExecutionEvent[]> {
  const live = await tryGetJson<ExecutionEvent[]>(`/executions/${runId}/events`);
  if (!live) throw new Error(`Unknown run events: ${runId}`);
  return live;
}

/**
 * Consume the SSE execution stream (#8 / #28). Calls `onEvent` for each
 * ExecutionEvent payload, then resolves when `event: done` arrives.
 */
export async function streamExecutionEvents(
  runId: string,
  onEvent: (event: ExecutionEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/executions/${runId}/events/stream`, {
    headers: { Accept: "text/event-stream" },
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

/** Moni ceiling: compose a full flow and return canvas-ready payload (#15, #55). */
export async function composeWorkflow(message: string): Promise<ComposeResult> {
  return postJson<ComposeResult>("/assistant/compose", { message });
}

/** Moni floor: map free text onto a vetted template (#15). */
export async function classifyIntent(message: string): Promise<IntentResult> {
  return postJson<IntentResult>("/assistant/intent", { message });
}

/** Instantiate a template as a fresh editable workflow (#51, #55). */
export async function createFromTemplate(
  templateId: string,
): Promise<WorkflowPayload> {
  return postJson<WorkflowPayload>(`/workflows/from-template/${templateId}`, {});
}

export { API_BASE };
