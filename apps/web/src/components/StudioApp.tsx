/**
 * Studio shell aligned to Figma Main (15:742): sidebars + canvas card.
 * Provenance: #4, #27, #28, #44, #55, Figma Monnify-challenge, D14.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";

import type { StudioNodeData } from "@/types";
import { useExecutionTrace } from "@/hooks/useExecutionTrace";
import { useStudioGraph } from "@/hooks/useStudioGraph";
import { useStudioSession } from "@/hooks/useStudioSession";
import {
  findingHighlightIds,
  withEdgeHighlights,
  withNodeHighlights,
} from "@/lib/findings";
import { flowToWorkflow } from "@/lib/flowIo";
import { ConfigPanel } from "./ConfigPanel";
import { CredentialsForm } from "./CredentialsForm";
import { NodePalette } from "./NodePalette";
import { PreviewArtifactPanel } from "./PreviewArtifactPanel";
import { ReviewPanel } from "./ReviewPanel";
import { RightSidebar } from "./RightSidebar";
import { TemplatePicker } from "./TemplatePicker";
import { TracePanel } from "./TracePanel";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { WorkflowOpener } from "./WorkflowOpener";

function CanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StudioNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [leftTab, setLeftTab] = useState<"api" | "chat">("api");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<"preview" | "code">("preview");
  const [previewMode, setPreviewMode] = useState<
    "review" | "trace" | "artifact"
  >("review");
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const session = useStudioSession({ setNodes, setEdges });
  const graph = useStudioGraph({
    nodes,
    setNodes,
    setEdges,
    catalog: session.catalog,
    nodeTypesMeta: session.nodeTypesMeta,
    selectedNodeId: session.selectedNodeId,
    setSelectedNodeId: session.setSelectedNodeId,
    setDirty: session.setDirty,
    setTypeError: session.setTypeError,
    setDiffNote: session.setDiffNote,
    setWorkflow: session.setWorkflow,
  });
  const trace = useExecutionTrace();

  const currentIr = useMemo(() => {
    if (!session.workflow) return null;
    return flowToWorkflow(session.workflow, nodes, edges);
  }, [session.workflow, nodes, edges]);

  const selectedFinding =
    session.selectedFindingIndex != null && session.report
      ? (session.report.findings[session.selectedFindingIndex] ?? null)
      : null;

  const selectedTraceEvent =
    trace.selectedSeq != null
      ? (trace.events.find((event) => event.seq === trace.selectedSeq) ?? null)
      : null;

  const highlightIds = useMemo(() => {
    const fromFinding = findingHighlightIds(selectedFinding);
    if (selectedTraceEvent?.node_id) {
      return new Set([...fromFinding, selectedTraceEvent.node_id]);
    }
    return fromFinding;
  }, [selectedFinding, selectedTraceEvent]);

  const displayNodes = useMemo(
    () => withNodeHighlights(nodes, highlightIds),
    [nodes, highlightIds],
  );
  const displayEdges = useMemo(
    () => withEdgeHighlights(edges, selectedFinding),
    [edges, selectedFinding],
  );

  const selectedIrNode = useMemo(() => {
    if (!currentIr || !session.selectedNodeId) return null;
    return (
      currentIr.nodes.find((node) => node.id === session.selectedNodeId) ?? null
    );
  }, [currentIr, session.selectedNodeId]);

  useEffect(() => {
    if (session.selectedFindingIndex != null) {
      setRightTab("preview");
      setPreviewMode("review");
    }
  }, [session.selectedFindingIndex]);

  useEffect(() => {
    if (selectedIrNode) {
      setRightTab("code");
    }
  }, [selectedIrNode?.id]);

  return (
    <div
      className={`studio-shell${leftCollapsed ? " is-left-collapsed" : ""}`}
    >
      <NodePalette
        catalog={{ ...session.nodeTypesMeta, ...session.catalog }}
        workflowName={session.workflow?.name ?? "Workflow"}
        teamLabel={
          session.source === "api"
            ? "Live API"
            : session.source === "fixture"
              ? "Local fixtures"
              : "Connecting…"
        }
        leftTab={leftTab}
        collapsed={leftCollapsed}
        busy={session.busy}
        onLeftTabChange={setLeftTab}
        onToggleCollapsed={() => setLeftCollapsed((value) => !value)}
        onAdd={(typeKey) => graph.addNode(typeKey)}
        onAsk={session.askMoni}
      />

      <main className="studio-main">
        <div className="studio-hero-switch">
          <WorkflowOpener
            workflows={session.workflows}
            activeId={session.activeWorkflowId}
            busy={session.busy || session.loading}
            onOpen={(id) => void session.openWorkflow(id)}
            onRefresh={() => void session.refreshWorkflows()}
            onNewTemplate={() => setTemplatesOpen(true)}
          />
          {session.selectedNodeId && (
            <button
              type="button"
              className="studio-btn studio-btn--ghost"
              onClick={graph.deleteSelected}
            >
              Delete node
            </button>
          )}
          <button
            type="button"
            className="studio-btn studio-btn--ghost"
            disabled={session.busy || !currentIr}
            onClick={() => currentIr && void session.runAnalyze(currentIr)}
          >
            Re-analyze
          </button>
          <button
            type="button"
            className="studio-btn studio-btn--ghost"
            disabled={session.busy || !currentIr}
            onClick={() => currentIr && void session.save(currentIr)}
          >
            Save
          </button>
          <button
            type="button"
            className="studio-btn studio-btn--ghost"
            disabled={
              session.busy ||
              !currentIr ||
              (session.report?.findings.length ?? 0) === 0
            }
            onClick={() => currentIr && void session.applyFix(currentIr, "ALL")}
          >
            Apply Fix
          </button>
        </div>

        <div className="studio-canvas-card">
          <WorkflowCanvas
            nodes={displayNodes}
            edges={displayEdges}
            loading={session.loading}
            busy={session.busy || trace.running}
            typeError={session.typeError}
            diffNote={session.diffNote}
            connectionFeedback={graph.connectionFeedback}
            layoutNonce={session.layoutNonce}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={graph.onConnect}
            onSelectionChange={graph.onSelectionChange}
            onGraphDirty={() => session.setDirty(true)}
          />
        </div>
      </main>

      <RightSidebar
        rightTab={rightTab}
        onRightTabChange={setRightTab}
        running={trace.running}
        canAct={!!currentIr}
        busy={session.busy}
        onRun={() => {
          if (!currentIr) return;
          setRightTab("preview");
          setPreviewMode("trace");
          void trace.runWorkflow(currentIr);
        }}
        onDeploy={() => undefined}
        deployDisabled
        deployTitle="Coming soon"
      >
        {rightTab === "code" ? (
          selectedIrNode ? (
            <ConfigPanel
              node={selectedIrNode}
              meta={
                session.catalog[selectedIrNode.type] ??
                session.nodeTypesMeta[selectedIrNode.type]
              }
              selectedFinding={selectedFinding}
              onChange={graph.updateSelectedNode}
              onClose={() => session.setSelectedNodeId(null)}
            />
          ) : (
            <CredentialsForm
              workflowId={session.activeWorkflowId}
              busy={session.busy}
            />
          )
        ) : (
          <>
            <div className="studio-segment">
              <button
                type="button"
                className={previewMode === "review" ? "is-active" : ""}
                onClick={() => setPreviewMode("review")}
              >
                Review
              </button>
              <button
                type="button"
                className={previewMode === "trace" ? "is-active" : ""}
                onClick={() => setPreviewMode("trace")}
              >
                Trace
              </button>
              <button
                type="button"
                className={previewMode === "artifact" ? "is-active" : ""}
                onClick={() => setPreviewMode("artifact")}
              >
                Seller
              </button>
            </div>
            {previewMode === "trace" ? (
              <TracePanel
                run={trace.run}
                events={trace.events}
                selectedSeq={trace.selectedSeq}
                running={trace.running}
                error={trace.error}
                onSelect={trace.setSelectedSeq}
                onClose={() => setPreviewMode("review")}
              />
            ) : previewMode === "artifact" ? (
              <PreviewArtifactPanel
                workflowId={session.activeWorkflowId}
                busy={session.busy}
                onBeforeGenerate={async () => {
                  if (currentIr && session.dirty) {
                    await session.save(currentIr);
                  }
                }}
              />
            ) : (
              <ReviewPanel
                workflowName={session.workflow?.name ?? ""}
                report={session.report}
                loading={session.loading}
                busy={session.busy}
                selectedFindingIndex={session.selectedFindingIndex}
                onSelectFinding={session.setSelectedFindingIndex}
                onApplyFix={(ruleId) =>
                  currentIr && void session.applyFix(currentIr, ruleId)
                }
              />
            )}
          </>
        )}
      </RightSidebar>

      <TemplatePicker
        open={templatesOpen}
        busy={session.busy}
        onClose={() => setTemplatesOpen(false)}
        onPick={(templateId) => {
          void session.startFromTemplate(templateId).then(() => {
            setTemplatesOpen(false);
            setRightTab("preview");
            setPreviewMode("artifact");
          });
        }}
        onBlank={() => setTemplatesOpen(false)}
      />
    </div>
  );
}

export function StudioApp() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
