/**
 * Studio shell composer: wires session + graph hooks into chrome panels.
 * Keep this thin; behaviour lives in hooks/lib. Provenance: #4, #27, D14.
 */
"use client";

import { useMemo } from "react";
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
import { ReviewPanel } from "./ReviewPanel";
import { StudioHeader } from "./StudioHeader";
import { StudioToolbar } from "./StudioToolbar";
import { WorkflowCanvas } from "./WorkflowCanvas";

function CanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StudioNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

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
        catalog={session.catalog}
        nodeTypesMeta={session.nodeTypesMeta}
        canDelete={!!session.selectedNodeId}
        busy={session.busy}
        canAct={!!currentIr}
        hasFindings={(session.report?.findings.length ?? 0) > 0}
        onAdd={graph.addNode}
        onDelete={graph.deleteSelected}
        onReanalyze={() => currentIr && void session.runAnalyze(currentIr)}
        onSave={() => currentIr && void session.save(currentIr)}
        onApplyAll={() => currentIr && void session.applyFix(currentIr, "ALL")}
      />

      <div className="studio-body studio-body--3">
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

        <WorkflowCanvas
          nodes={displayNodes}
          edges={displayEdges}
          loading={session.loading}
          busy={session.busy}
          typeError={session.typeError}
          diffNote={session.diffNote}
          layoutNonce={session.layoutNonce}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={graph.onConnect}
          onSelectionChange={graph.onSelectionChange}
          onGraphDirty={() => session.setDirty(true)}
        />

        <ReviewPanel
          workflowName={session.workflow?.name ?? ""}
          report={session.report}
          loading={session.loading}
          busy={session.busy}
          selectedFindingIndex={session.selectedFindingIndex}
          onSelectFinding={session.setSelectedFindingIndex}
          onApplyFix={(ruleId) => currentIr && void session.applyFix(currentIr, ruleId)}
        />
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
