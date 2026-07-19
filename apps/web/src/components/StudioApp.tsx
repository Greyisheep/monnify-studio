/**
 * Studio shell: full-bleed canvas with overlay panels (#44).
 * Panels float and must not shrink the diagram. Provenance: #4, #27, #44, D14.
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
import { WorkflowCanvas } from "./WorkflowCanvas";

function CanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StudioNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(true);

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

  const currentIr = useMemo(() => {
    if (!session.workflow) return null;
    return flowToWorkflow(session.workflow, nodes, edges);
  }, [session.workflow, nodes, edges]);

  const selectedFinding =
    session.selectedFindingIndex != null && session.report
      ? (session.report.findings[session.selectedFindingIndex] ?? null)
      : null;

  const highlightIds = useMemo(
    () => findingHighlightIds(selectedFinding),
    [selectedFinding],
  );

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

  // Selecting a node opens config overlay without compressing the canvas (#44).
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
        onTogglePalette={() => setPaletteOpen((open) => !open)}
        onToggleReview={() => setReviewOpen((open) => !open)}
        onDelete={graph.deleteSelected}
        onReanalyze={() => currentIr && void session.runAnalyze(currentIr)}
        onSave={() => currentIr && void session.save(currentIr)}
        onApplyAll={() => currentIr && void session.applyFix(currentIr, "ALL")}
      />

      <div className="studio-stage">
        <WorkflowCanvas
          nodes={displayNodes}
          edges={displayEdges}
          loading={session.loading}
          busy={session.busy}
          typeError={session.typeError}
          diffNote={session.diffNote}
          connectionFeedback={graph.connectionFeedback}
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

        {reviewOpen && (
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
