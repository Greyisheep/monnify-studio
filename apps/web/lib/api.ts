// Thin client for the Monnify Studio API (#4).

import type { RemediationResult, Report, Workflow } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getWorkflow: (id: string) => json<Workflow>(`/workflows/${id}`),
  getNamedAnalysis: (id: string) => json<Report>(`/workflows/${id}/analysis`),
  analyze: (workflow: Workflow) =>
    json<Report>(`/analyze`, { method: "POST", body: JSON.stringify(workflow) }),
  remediate: (workflow: Workflow) =>
    json<RemediationResult>(`/remediate`, { method: "POST", body: JSON.stringify(workflow) }),
};
