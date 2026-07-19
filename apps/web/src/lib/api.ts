import type {
  AnalysisReport,
  NodeMeta,
  RemediateResult,
  Workflow,
  WorkflowPayload,
} from "./ir";

import unsafePayload from "@/data/marketplace-unsafe.json";
import safePayload from "@/data/marketplace-safe.json";
import unsafeAnalysis from "@/data/marketplace-unsafe.analysis.json";
import safeAnalysis from "@/data/marketplace-safe.analysis.json";

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
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchWorkflow(id: string): Promise<{
  data: WorkflowPayload;
  source: "api" | "fixture";
}> {
  const live = await tryGetJson<WorkflowPayload>(`/workflows/${id}`);
  if (live) return { data: live, source: "api" };
  const local = LOCAL_WORKFLOWS[id];
  if (!local) throw new Error(`Unknown workflow: ${id}`);
  return { data: local, source: "fixture" };
}

export async function fetchAnalysis(id: string): Promise<{
  data: AnalysisReport;
  source: "api" | "fixture";
}> {
  const live = await tryGetJson<AnalysisReport>(`/workflows/${id}/analysis`);
  if (live) return { data: live, source: "api" };
  const local = LOCAL_ANALYSIS[id];
  if (!local) throw new Error(`Unknown workflow: ${id}`);
  return { data: local, source: "fixture" };
}

export async function analyzeWorkflow(workflow: Workflow): Promise<AnalysisReport> {
  return postJson<AnalysisReport>("/analyze", workflow);
}

export async function fetchCatalog(): Promise<Record<string, NodeMeta>> {
  const live = await tryGetJson<Record<string, NodeMeta>>("/catalog");
  if (live) return live;
  // Fallback: union of node_types from local fixtures
  return {
    ...LOCAL_WORKFLOWS["marketplace-unsafe"].node_types,
    ...LOCAL_WORKFLOWS["marketplace-safe"].node_types,
  };
}

export async function validateConnection(body: {
  source_type: string;
  target_type: string;
  source_port?: string;
  target_port?: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    return await postJson("/validate-connection", body);
  } catch {
    return { ok: true, message: "" }; // offline: don't block editing
  }
}

export async function resetWorkflow(id: string): Promise<WorkflowPayload> {
  return postJson<WorkflowPayload>(`/workflows/${id}/reset`, {});
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

export { API_BASE };
