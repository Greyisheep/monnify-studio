/**
 * Studio shell aligned to Figma Main (15:742): sidebars + canvas card.
 * Provenance: #4, #27, #28, #44, Figma Monnify-challenge, D14.
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
import { NodePalette } from "./NodePalette";
import { ReviewPanel } from "./ReviewPanel";
import { RightSidebar } from "./RightSidebar";
import { TracePanel } from "./TracePanel";
import { WorkflowCanvas } from "./WorkflowCanvas";

function CanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StudioNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [leftTab, setLeftTab] = useState<"api" | "chat">("api");
  const [rightTab, setRightTab] = useState<"preview" | "code">("preview");
  const [previewMode, setPreviewMode] = useState<"review" | "trace">("review");

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
    <div className="studio-shell">
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
        onLeftTabChange={setLeftTab}
        onAdd={(typeKey) => graph.addNode(typeKey)}
      />

      <main className="studio-main">
        <div className="studio-hero-switch">
          <button
            type="button"
            className={session.heroId === "marketplace-unsafe" ? "is-active" : ""}
            onClick={() => session.setHeroId("marketplace-unsafe")}
          >
            Unsafe hero
          </button>
          <button
            type="button"
            className={session.heroId === "marketplace-safe" ? "is-active" : ""}
            onClick={() => session.setHeroId("marketplace-safe")}
          >
            Safe hero
          </button>
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
        onDeploy={() => currentIr && void session.save(currentIr)}
      >
        {rightTab === "code" ? (
          <ConfigPanel
            node={selectedIrNode}
            meta={
              selectedIrNode
                ? session.catalog[selectedIrNode.type] ??
                  session.nodeTypesMeta[selectedIrNode.type]
                : undefined
            }
            selectedFinding={selectedFinding}
            onChange={graph.updateSelectedNode}
            onClose={() => session.setSelectedNodeId(null)}
          />
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
