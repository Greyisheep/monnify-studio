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
import { fetchStudioProfile, putStudioProfile } from "@/lib/api";
import { ConfigPanel } from "./ConfigPanel";
import { CredentialsForm } from "./CredentialsForm";
import {
  BusinessDashboard,
  type BusinessNav,
} from "./BusinessDashboard";
import { NodePalette } from "./NodePalette";
import { OnboardingChrome } from "./OnboardingChrome";
import { PathGate } from "./PathGate";
import { ProductsStep } from "./ProductsStep";
import { PreviewArtifactPanel } from "./PreviewArtifactPanel";
import { ReviewPanel } from "./ReviewPanel";
import { RightSidebar } from "./RightSidebar";
import { TemplatePicker } from "./TemplatePicker";
import { TracePanel } from "./TracePanel";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { WorkflowOpener } from "./WorkflowOpener";
import type { ShopProduct, StudioPath, StudioProfile } from "@/types";

function CanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StudioNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [leftTab, setLeftTab] = useState<"api" | "chat">("api");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<"preview" | "code">("preview");
  const [previewMode, setPreviewMode] = useState<
    "review" | "trace" | "artifact"
  >("artifact");
  const [profile, setProfile] = useState<StudioProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [businessNav, setBusinessNav] = useState<BusinessNav>("dashboard");
  const [templatesOpen, setTemplatesOpen] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    void fetchStudioProfile()
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setProfile({
            session_id: "",
            path: null,
            step: "user_type",
            products: [],
          });
          setProfileError(
            "Cannot reach the Studio API. Keep the backend running on port 8010, then refresh.",
          );
          setProfileReady(true);
          return;
        }
        setProfile(loaded);
        setProfileError(null);
        // Older sessions stopped on "template"; Figma's next step is Dashboard.
        if (loaded.path === "business" && loaded.step === "template") {
          void putStudioProfile({ step: "dashboard" }).then((next) => {
            if (!cancelled) {
              setProfile(next);
              setBusinessNav("dashboard");
            }
          });
        }
        if (loaded.path === "business" && loaded.step === "dashboard") {
          setBusinessNav("dashboard");
        }
        if (loaded.path === "business" && loaded.step === "done") {
          setLeftTab("chat");
          setBusinessNav("workflow");
        }
        setProfileReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setProfile({
            session_id: "",
            path: null,
            step: "user_type",
            products: [],
          });
          setProfileError(
            "Cannot reach the Studio API. Keep the backend running on port 8010, then refresh.",
          );
          setProfileReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  function seedFromProducts(products: ShopProduct[]) {
    const first = products[0];
    if (!first) return;
    goSeller({
      product_name: first.name,
      price_ngn: first.price_ngn ?? undefined,
      logo_url: first.image_url ?? undefined,
      business_name: "My Business",
    });
  }

  async function onPathContinue(path: StudioPath) {
    setProfileBusy(true);
    setProfileError(null);
    try {
      const next = await putStudioProfile({
        path,
        step: path === "business" ? "products" : "done",
      });
      setProfile(next);
      if (path === "developer") {
        setTemplatesOpen(false);
        setLeftTab("api");
      } else {
        setLeftTab("chat");
        setPreviewMode("artifact");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save path";
      setProfileError(message);
      session.setTypeError(message);
    } finally {
      setProfileBusy(false);
    }
  }

  async function onProductsNext(products: ShopProduct[]) {
    setProfileBusy(true);
    try {
      const next = await putStudioProfile({ products, step: "dashboard" });
      setProfile(next);
      setBusinessNav("dashboard");
      seedFromProducts(products);
    } catch (error) {
      session.setTypeError(
        error instanceof Error ? error.message : "Could not save products",
      );
    } finally {
      setProfileBusy(false);
    }
  }

  async function onProductsBack() {
    setProfileBusy(true);
    try {
      const next = await putStudioProfile({ step: "user_type", path: null });
      setProfile(next);
    } finally {
      setProfileBusy(false);
    }
  }

  async function goBusinessWorkflow() {
    setBusinessNav("workflow");
    if (profile?.step === "dashboard" || profile?.step === "template") {
      const next = await putStudioProfile({ step: "done" });
      setProfile(next);
    }
    setLeftTab("chat");
    setPreviewMode("artifact");
  }

  async function markOnboardingDone() {
    const next = await putStudioProfile({ step: "done" });
    setProfile(next);
    setTemplatesOpen(false);
  }

  const onboardingStep = profile?.step ?? "user_type";
  const showOnboarding =
    profileReady &&
    profile != null &&
    (profile.step === "user_type" || profile.step === "products");
  const showBusinessDashboard =
    profileReady &&
    profile?.path === "business" &&
    (profile.step === "dashboard" ||
      (profile.step === "done" && businessNav === "dashboard") ||
      profile.step === "template");

  if (showBusinessDashboard) {
    return (
      <>
        <BusinessDashboard
          products={profile?.products ?? []}
          activeNav={businessNav === "workflow" ? "workflow" : "dashboard"}
          onNav={(nav) => {
            if (nav === "workflow") void goBusinessWorkflow();
            else setBusinessNav("dashboard");
          }}
          onNew={() => setTemplatesOpen(true)}
        />
        <TemplatePicker
          open={templatesOpen}
          busy={session.busy || profileBusy}
          dismissible
          onClose={() => setTemplatesOpen(false)}
          onPick={(templateId) => {
            void session.startFromTemplate(templateId).then(async () => {
              await markOnboardingDone();
              setBusinessNav("workflow");
              setSellerResult(null);
              if (profile?.products?.length) seedFromProducts(profile.products);
              else {
                setSellerSeed(null);
                goSeller();
              }
            });
          }}
          onBlank={() => {
            void session.startBlank().then(async () => {
              await markOnboardingDone();
              setBusinessNav("workflow");
              setLeftTab("api");
              setPreviewMode("review");
            });
          }}
        />
      </>
    );
  }

  return (
    <div
      className={`studio-shell${leftCollapsed ? " is-left-collapsed" : ""}`}
      style={sidebars.shellStyle}
    >
      {showOnboarding && (
        <OnboardingChrome
          active={onboardingStep === "products" ? "products" : "user_type"}
        >
          {onboardingStep === "products" ? (
            <ProductsStep
              initial={profile?.products ?? []}
              busy={profileBusy}
              onBack={() => void onProductsBack()}
              onNext={(products) => void onProductsNext(products)}
            />
          ) : (
            <PathGate
              busy={profileBusy}
              error={profileError}
              onContinue={(path) => void onPathContinue(path)}
            />
          )}
        </OnboardingChrome>
      )}
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
          {profile?.path === "business" && (
            <button
              type="button"
              className="studio-btn studio-btn--ghost"
              onClick={() => setBusinessNav("dashboard")}
            >
              ← Dashboard
            </button>
          )}
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
        open={templatesOpen && !showOnboarding}
        busy={session.busy || profileBusy}
        dismissible={profile?.step === "done" && !!session.activeWorkflowId}
        onClose={() => {
          if (profile?.step === "done" && session.activeWorkflowId) {
            setTemplatesOpen(false);
          }
        }}
        onPick={(templateId) => {
          void session.startFromTemplate(templateId).then(async () => {
            await markOnboardingDone();
            setSellerResult(null);
            if (profile?.products?.length) seedFromProducts(profile.products);
            else {
              setSellerSeed(null);
              goSeller();
            }
          });
        }}
        onBlank={() => {
          void session.startBlank().then(async () => {
            await markOnboardingDone();
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
