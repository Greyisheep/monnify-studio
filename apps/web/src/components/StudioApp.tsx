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

import type {
  ArtifactConfigInput,
  GenerateArtifactResult,
  StudioNodeData,
} from "@/types";
import { useExecutionTrace } from "@/hooks/useExecutionTrace";
import { useSidebarWidths } from "@/hooks/useSidebarWidths";
import { useStudioGraph } from "@/hooks/useStudioGraph";
import { useStudioSession } from "@/hooks/useStudioSession";
import {
  findingHighlightIds,
  withEdgeHighlights,
  withNodeHighlights,
} from "@/lib/findings";
import { flowToWorkflow } from "@/lib/flowIo";
import {
  readStudioPath,
  writeStudioPath,
  type StudioPath,
} from "@/lib/studioPath";
import { ConfigPanel } from "./ConfigPanel";
import { CredentialsForm } from "./CredentialsForm";
import { NodePalette } from "./NodePalette";
import { PathGate } from "./PathGate";
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
  >("artifact");
  const [studioPath, setStudioPath] = useState<StudioPath | null>(() =>
    readStudioPath(),
  );
  const [templatesOpen, setTemplatesOpen] = useState(
    () => readStudioPath() === "business",
  );
  const [sellerSeed, setSellerSeed] = useState<ArtifactConfigInput | null>(null);
  const [sellerResult, setSellerResult] = useState<GenerateArtifactResult | null>(
    null,
  );

  const session = useStudioSession({ setNodes, setEdges });
  const sidebars = useSidebarWidths();
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

  function goSeller(
    seed?: ArtifactConfigInput | null,
    artifact?: GenerateArtifactResult | null,
  ) {
    if (seed) setSellerSeed(seed);
    if (artifact) setSellerResult(artifact);
    setRightTab("preview");
    setPreviewMode("artifact");
  }

  function onPathContinue(path: StudioPath) {
    writeStudioPath(path);
    setStudioPath(path);
    if (path === "business") {
      setTemplatesOpen(true);
      setLeftTab("chat");
      setPreviewMode("artifact");
    } else {
      setTemplatesOpen(false);
      setLeftTab("api");
    }
  }

  return (
    <div
      className={`studio-shell${leftCollapsed ? " is-left-collapsed" : ""}`}
      style={sidebars.shellStyle}
    >
      <PathGate open={studioPath == null} onContinue={onPathContinue} />
      <NodePalette
        catalog={{ ...session.nodeTypesMeta, ...session.catalog }}
        workflowName={session.workflow?.name ?? "Workflow"}
        teamLabel={
          session.source === "api"
            ? "Live API"
            : session.source === "fixture"
              ? "Local fixtures"
              : session.ready
                ? "Ready"
                : "Connecting…"
        }
        leftTab={leftTab}
        collapsed={leftCollapsed}
        busy={session.busy}
        onLeftTabChange={setLeftTab}
        onToggleCollapsed={() => setLeftCollapsed((value) => !value)}
        onAdd={(typeKey) => graph.addNode(typeKey)}
        onAsk={session.askMoni}
        onSetupIntent={async (templateId, config) => {
          const result = await session.setupFromIntent(templateId, config);
          goSeller(result.seed, result.artifact);
        }}
        onResizeStart={(event) => sidebars.beginResize("left", event)}
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
            disabled={session.busy || !session.activeWorkflowId}
            onClick={() => {
              session.setSelectedNodeId(null);
              setRightTab("code");
            }}
          >
            Connect your Monnify account
          </button>
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
            diffNote={
              session.diffNote ||
              (!session.activeWorkflowId
                ? "Pick a template to begin (or start blank)."
                : null)
            }
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
        onResizeStart={(event) => sidebars.beginResize("right", event)}
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
                className={previewMode === "artifact" ? "is-active" : ""}
                onClick={() => setPreviewMode("artifact")}
              >
                Seller
              </button>
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
                onClose={() => setPreviewMode("artifact")}
              />
            ) : previewMode === "review" ? (
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
            ) : (
              <PreviewArtifactPanel
                workflowId={session.activeWorkflowId}
                busy={session.busy}
                seedConfig={sellerSeed}
                initialResult={sellerResult}
                onBeforeGenerate={async () => {
                  if (currentIr && session.dirty) {
                    await session.save(currentIr);
                  }
                }}
              />
            )}
          </>
        )}
      </RightSidebar>

      <TemplatePicker
        open={templatesOpen}
        busy={session.busy}
        dismissible={!!session.activeWorkflowId}
        onClose={() => {
          if (session.activeWorkflowId) setTemplatesOpen(false);
        }}
        onPick={(templateId) => {
          void session.startFromTemplate(templateId).then(() => {
            setTemplatesOpen(false);
            setSellerResult(null);
            setSellerSeed(null);
            goSeller();
          });
        }}
        onBlank={() => {
          void session.startBlank().then(() => {
            setTemplatesOpen(false);
            setLeftTab("api");
            setPreviewMode("review");
          });
        }}
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
