/**
 * Interim hand ports of backend IR / analysis contracts.
 *
 * Target (D6 / Phase 1.1): generate these from Pydantic JSON Schema into
 * packages/ (or a generated import path). Do not grow a second IR model here.
 * UI-only shapes live in canvas.ts.
 *
 * Epic 1 canvas + review: #4, #27. Epic 2 execution trace: #28.
 */
export type { NodeCategory, NodeMeta, PortMeta } from "./catalog";
export type { StudioNodeData } from "./canvas";
export type {
  AnalysisReport,
  ComposeResult,
  Finding,
  GraphDiff,
  IntentResult,
  RemediateResult,
  RemediationStep,
  Severity,
  WorkflowPayload,
} from "./analysis";
export type {
  ExecutionEvent,
  ExecutionEventType,
  ExecutionRun,
  RunStatus,
  StartExecutionResult,
} from "./execution";
export type { EdgeKind, IrEdge, IrNode, Position, Workflow } from "./workflow";
