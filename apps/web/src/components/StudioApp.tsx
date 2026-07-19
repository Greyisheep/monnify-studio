/**
 * Studio shell: full-bleed canvas with overlay panels (#44).
 * Execution trace overlay for mock runs (#28). Provenance: #4, #27, #28, #44, D14.
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
import { StudioHeader } from "./StudioHeader";
import { StudioToolbar } from "./StudioToolbar";
import { TracePanel } from "./TracePanel";
import { WorkflowCanvas } from "./WorkflowCanvas";

function CanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StudioNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(true);
  const [traceOpen, setTraceOpen] = useState(false);

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

  const configOpen = !!selectedIrNode;

  useEffect(() => {
    if (session.selectedFindingIndex != null) setReviewOpen(true);
  }, [session.selectedFindingIndex]);

  return (
    <div className="studio-shell">
      <StudioHeader
        source={session.source}
        version={session.workflow?.version ?? null}
        dirty={session.dirty}
        heroId={session.heroId}
        onHeroChange={session.setHeroId}
      />

      <StudioToolbar
        canDelete={!!session.selectedNodeId}
        busy={session.busy}
        canAct={!!currentIr}
        hasFindings={(session.report?.findings.length ?? 0) > 0}
        paletteOpen={paletteOpen}
        reviewOpen={reviewOpen}
        traceOpen={traceOpen}
        running={trace.running}
        onTogglePalette={() => setPaletteOpen((open) => !open)}
        onToggleReview={() => setReviewOpen((open) => !open)}
        onToggleTrace={() => setTraceOpen((open) => !open)}
        onDelete={graph.deleteSelected}
        onReanalyze={() => currentIr && void session.runAnalyze(currentIr)}
        onSave={() => currentIr && void session.save(currentIr)}
        onApplyAll={() => currentIr && void session.applyFix(currentIr, "ALL")}
        onRun={() => {
          if (!currentIr) return;
          setTraceOpen(true);
          setReviewOpen(false);
          void trace.runWorkflow(currentIr);
        }}
      />

      <div className="studio-stage">
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

        <NodePalette
          catalog={{ ...session.nodeTypesMeta, ...session.catalog }}
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onAdd={(typeKey) => {
            graph.addNode(typeKey);
          }}
        />

        {configOpen && (
          <div className="studio-overlay studio-overlay--config">
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
          </div>
        )}

        {reviewOpen && !traceOpen && (
          <div className="studio-overlay studio-overlay--review">
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
              onClose={() => setReviewOpen(false)}
            />
          </div>
        )}

        {traceOpen && (
          <div className="studio-overlay studio-overlay--trace">
            <TracePanel
              run={trace.run}
              events={trace.events}
              selectedSeq={trace.selectedSeq}
              running={trace.running}
              error={trace.error}
              onSelect={trace.setSelectedSeq}
              onClose={() => setTraceOpen(false)}
            />
          </div>
        )}
      </div>
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
