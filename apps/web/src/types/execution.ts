/**
 * Execution trace contracts (mirror monnify_studio.executor.events).
 * Interim hand port until D6 JSON Schema codegen. Provenance: #28, #8, #79, D2, D15.
 */

export type RunStatus =
  | "pending"
  | "running"
  | "waiting"
  | "completed"
  | "failed";

/** Backed by the API's mock and sandbox-only Monnify adapters. */
export type ExecutionAdapter = "mock" | "monnify";

export type ExecutionEventType =
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "node.started"
  | "node.waiting"
  | "node.completed"
  | "node.failed"
  | "log";

export interface ExecutionEvent {
  id: string;
  run_id: string;
  seq: number;
  type: ExecutionEventType;
  ts: string;
  node_id?: string | null;
  node_type?: string | null;
  message: string;
  friendly_text: string;
  /** What the node saw: upstream outputs resolved by the engine (#145). */
  inputs?: Record<string, unknown> | null;
  duration_ms?: number | null;
  request?: Record<string, unknown> | null;
  response?: Record<string, unknown> | null;
  outputs: Record<string, unknown>;
  error?: string | null;
}

export interface ExecutionRun {
  id: string;
  workflow_id: string;
  adapter: ExecutionAdapter;
  status: RunStatus;
  created_at: string;
  finished_at?: string | null;
  error?: string | null;
}

export interface StartExecutionResult {
  run: ExecutionRun;
  event_count: number;
}
