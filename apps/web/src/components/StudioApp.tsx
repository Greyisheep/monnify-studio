/**
 * Studio shell aligned to Figma Main (21:1670) + Maincollapsed (21:1732).
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
import { PRACTICE_RUN_LABEL } from "@/lib/studioCopy";
import {
  absoluteApiUrl,
  fetchStudioProfile,
  fetchWorkflowDashboard,
  putStudioProfile,
} from "@/lib/api";
import {
  BusinessDashboard,
  type BizNotification,
  type BusinessNav,
  type DashboardTxn,
} from "./BusinessDashboard";
import { InspectDocumentPanel } from "./InspectDocumentPanel";
import { NodePalette } from "./NodePalette";
import { OnboardingChrome } from "./OnboardingChrome";
import { PathGate } from "./PathGate";
import { ProductsStep } from "./ProductsStep";
import { RightSidebar } from "./RightSidebar";
import { StudioFloatingChrome } from "./StudioFloatingChrome";
import { StudioIconRail } from "./StudioIconRail";
import { TemplatePicker } from "./TemplatePicker";
import { WorkflowCanvas } from "./WorkflowCanvas";
import type {
  BusinessGoal,
  ShopProduct,
  StudioPath,
  StudioProfile,
} from "@/types";

/** Template choice decides products vs dashboard (shop path only adds products). */
function goalFromTemplate(templateId: string): BusinessGoal {
  if (templateId === "sell-online") return "sell";
  if (templateId === "invoice") return "invoice";
  if (templateId === "payroll") return "payroll";
  if (templateId === "ajo") return "savings";
  return "other";
}

function CanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StudioNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [leftTab, setLeftTab] = useState<"api" | "chat">("api");
  /** Both sidebars hidden — Figma Maincollapsed (21:1732). */
  const [panelsCollapsed, setPanelsCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<"preview" | "code">("preview");
  const [profile, setProfile] = useState<StudioProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [businessNav, setBusinessNav] = useState<BusinessNav>("dashboard");
  const [bizData, setBizData] = useState<{
    totals: { inflow: number; outflow: number; net: number; actions: number } | null;
    transactions: DashboardTxn[];
    notifications: BizNotification[];
    shopUrl: string | null;
  } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

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
            goal: null,
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
        // "intent" was a brief wrong step — treat it as the template picker.
        if (loaded.path === "business" && loaded.step === "intent") {
          void putStudioProfile({ step: "template" }).then((next) => {
            if (!cancelled) setProfile(next);
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
            goal: null,
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
    }
  }, [session.selectedFindingIndex]);

  useEffect(() => {
    if (selectedIrNode) {
      setRightTab("code");
    }
  }, [selectedIrNode?.id]);

  function focusPreview() {
    setRightTab("preview");
  }

  function seedFromProducts(products: ShopProduct[]) {
    if (!products[0]) return;
    focusPreview();
  }

  const previewMarkdown = useMemo(() => {
    const name = session.workflow?.name ?? "Untitled workflow";
    const findings = session.report?.findings?.length ?? 0;
    const nodeCount = currentIr?.nodes.length ?? nodes.length;
    const lines = [
      `# ${name}`,
      "",
      "Studio preview — composed flow summary.",
      "",
      "## Graph",
      `- Nodes: ${nodeCount}`,
      `- Edges: ${currentIr?.edges.length ?? edges.length}`,
      findings
        ? `- Findings: ${findings}`
        : "- Findings: none yet (run analyze after compose)",
      "",
      "## Next",
      "- Edit nodes on the canvas",
      "- Open Code for the workflow JSON",
      `- ${PRACTICE_RUN_LABEL} to stream an execution trace`,
    ];
    return lines.join("\n");
  }, [
    currentIr?.edges.length,
    currentIr?.nodes.length,
    edges.length,
    nodes.length,
    session.report?.findings?.length,
    session.workflow?.name,
  ]);

  const codeDocument = useMemo(() => {
    if (selectedIrNode) {
      return JSON.stringify(selectedIrNode, null, 2);
    }
    if (currentIr) {
      return JSON.stringify(currentIr, null, 2);
    }
    return "";
  }, [currentIr, selectedIrNode]);

  async function onPathContinue(path: StudioPath) {
    setProfileBusy(true);
    setProfileError(null);
    try {
      const next = await putStudioProfile({
        path,
        step: path === "business" ? "template" : "done",
        goal: null,
      });
      setProfile(next);
      if (path === "developer") {
        setTemplatesOpen(false);
        setLeftTab("api");
      } else {
        setLeftTab("chat");
        focusPreview();
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

  async function onTemplateBack() {
    setProfileBusy(true);
    try {
      const next = await putStudioProfile({
        step: "user_type",
        path: null,
        goal: null,
      });
      setProfile(next);
    } finally {
      setProfileBusy(false);
    }
  }

  /** Onboarding template pick: shop → products; everything else → dashboard (blank → Moni). */
  async function onOnboardingTemplatePick(templateId: string) {
    setProfileBusy(true);
    try {
      const goal = goalFromTemplate(templateId);
      if (goal === "sell") {
        const next = await putStudioProfile({ goal, step: "products" });
        setProfile(next);
        return;
      }
      // Actually set up the flow + generate its artifact so the Dashboard has a
      // real shop and money book to show (#135), not an empty shell.
      await session.setupFromIntent(templateId, {});
      const next = await putStudioProfile({
        goal,
        step: "dashboard",
        products: [],
      });
      setProfile(next);
      setBusinessNav("dashboard");
    } catch (error) {
      session.setTypeError(
        error instanceof Error ? error.message : "Could not save template choice",
      );
    } finally {
      setProfileBusy(false);
    }
  }

  async function onOnboardingBlank() {
    setProfileBusy(true);
    try {
      // Blank / Other → Moni chat in Studio.
      const next = await putStudioProfile({
        goal: "other",
        step: "done",
        products: [],
      });
      setProfile(next);
      setBusinessNav("workflow");
      setLeftTab("chat");
      focusPreview();
    } catch (error) {
      session.setTypeError(
        error instanceof Error ? error.message : "Could not start blank setup",
      );
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
      // Set up the sell-online flow + shop from the products so the Dashboard
      // lands on a real shop link and money book (#135).
      const first = products[0];
      const priceNum =
        first && first.price_ngn != null && first.price_ngn !== ""
          ? Number(first.price_ngn)
          : NaN;
      await session.setupFromIntent("sell-online", {
        business_name: "My Business",
        ...(first?.name ? { product_name: first.name } : {}),
        ...(Number.isNaN(priceNum) ? {} : { price_ngn: priceNum }),
      });
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
      const next = await putStudioProfile({ step: "template" });
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
    focusPreview();
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
    (profile.step === "user_type" ||
      profile.step === "template" ||
      profile.step === "intent" ||
      profile.step === "products");
  const showBusinessDashboard =
    profileReady &&
    profile?.path === "business" &&
    (profile.step === "dashboard" ||
      (profile.step === "done" && businessNav === "dashboard"));

  // Feed the Dashboard real money: totals, invoices, activity, and the shop link
  // for this business's workflow (#135). Polls so a payment shows up live.
  const businessWorkflowId = session.workflow?.id;
  useEffect(() => {
    if (!showBusinessDashboard || !businessWorkflowId) return;
    let cancelled = false;
    const load = () => {
      void fetchWorkflowDashboard(businessWorkflowId).then((d) => {
        if (cancelled || !d) return;
        const transactions: DashboardTxn[] = (d.invoices ?? []).map((inv) => ({
          id: inv.reference,
          date: (inv.created_at ?? "").slice(0, 10),
          at: inv.created_at ?? new Date(0).toISOString(),
          customer: inv.customer || "Customer",
          initials: (inv.customer || "Customer").trim().slice(0, 2).toUpperCase(),
          type: "Invoice",
          amount_ngn: Number(inv.amount) || 0,
          method: "Card payment",
          status:
            inv.status === "verified"
              ? "Successful"
              : inv.status === "rejected"
                ? "Failed"
                : "Pending",
          direction: "inflow",
        }));
        const notifications: BizNotification[] = (d.activity ?? [])
          .slice(0, 12)
          .map((a, index) => ({
            id: `${a.ts}-${index}`,
            kind: a.kind === "ledger" ? "inflow" : "info",
            text: a.text,
            when: a.ts,
            read: false,
          }));
        setBizData({
          totals: d.totals
            ? {
                inflow: Number(d.totals.money_in) || 0,
                outflow: Number(d.totals.money_out) || 0,
                net: Number(d.totals.profit) || 0,
                actions: d.totals.needs_attention ?? 0,
              }
            : null,
          transactions,
          notifications,
          shopUrl: d.shop_path ? absoluteApiUrl(d.shop_path) : null,
        });
      });
    };
    load();
    const timer = window.setInterval(load, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [showBusinessDashboard, businessWorkflowId]);

  if (showBusinessDashboard) {
    return (
      <>
        <BusinessDashboard
          products={profile?.products ?? []}
          totals={bizData?.totals ?? null}
          transactions={bizData?.transactions}
          notifications={bizData?.notifications}
          shopUrl={bizData?.shopUrl ?? null}
          activeNav={businessNav === "workflow" ? "workflow" : "dashboard"}
          onNav={(nav) => {
            if (nav === "workflow") void goBusinessWorkflow();
            else setBusinessNav("dashboard");
          }}
          onNew={() => setTemplatesOpen(true)}
          onLogout={() => {
            void putStudioProfile({
              path: null,
              step: "user_type",
              goal: null,
              products: [],
            }).then((next) => {
              setProfile(next);
              setBusinessNav("dashboard");
            });
          }}
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
              if (profile?.products?.length) seedFromProducts(profile.products);
              else focusPreview();
            });
          }}
          onBlank={() => {
            void session.startBlank().then(async () => {
              await markOnboardingDone();
              setBusinessNav("workflow");
              setLeftTab("api");
              focusPreview();
            });
          }}
        />
      </>
    );
  }

  return (
    <div
      className={`studio-shell${panelsCollapsed ? " is-panels-collapsed" : ""}`}
      style={panelsCollapsed ? undefined : sidebars.shellStyle}
    >
      {showOnboarding && (
        <OnboardingChrome active={onboardingStep}>
          {onboardingStep === "products" ? (
            <ProductsStep
              initial={profile?.products ?? []}
              busy={profileBusy}
              onBack={() => void onProductsBack()}
              onNext={(products) => void onProductsNext(products)}
            />
          ) : onboardingStep === "template" || onboardingStep === "intent" ? (
            <TemplatePicker
              open
              embedded
              variant="business-onboarding"
              busy={profileBusy}
              onClose={() => undefined}
              onBack={() => void onTemplateBack()}
              onPick={(templateId) => void onOnboardingTemplatePick(templateId)}
              onOther={() => void onOnboardingBlank()}
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
      {!panelsCollapsed ? (
        <div className="studio-panels" aria-hidden={false}>
          <div className="studio-panels__left">
            <StudioIconRail
              active="workflow"
              onNew={() => setTemplatesOpen(true)}
              onDashboard={() => {
                if (profile?.path !== "business") return;
                setBusinessNav("dashboard");
              }}
            />
            <NodePalette
              catalog={{ ...session.nodeTypesMeta, ...session.catalog }}
              workflowName={session.workflow?.name ?? "Workflow 1"}
              teamLabel={
                session.source === "api"
                  ? "Your team"
                  : session.source === "fixture"
                    ? "Local fixtures"
                    : session.ready
                      ? "Your team"
                      : "Connecting…"
              }
              leftTab={leftTab}
              collapsed={false}
              busy={session.busy}
              onLeftTabChange={setLeftTab}
              onToggleCollapsed={() => setPanelsCollapsed(true)}
              onAdd={(typeKey) => graph.addNode(typeKey)}
              onAsk={session.askMoni}
              onSetupIntent={async (templateId, config) => {
                await session.setupFromIntent(templateId, config);
                focusPreview();
              }}
              onResizeStart={(event) => sidebars.beginResize("left", event)}
            />
          </div>
          <RightSidebar
            rightTab={rightTab}
            onRightTabChange={setRightTab}
            running={trace.running}
            canAct={!!currentIr}
            busy={session.busy}
            onRun={() => {
              if (!currentIr) return;
              setRightTab("preview");
              void trace.runWorkflow(currentIr);
            }}
            onDeploy={() => undefined}
            deployDisabled
            deployTitle="Coming soon"
            onResizeStart={(event) => sidebars.beginResize("right", event)}
          >
            {rightTab === "code" ? (
              <InspectDocumentPanel
                formatLabel="JSON"
                content={codeDocument}
                emptyHint="Compose or open a workflow to see its code."
              />
            ) : (
              <InspectDocumentPanel
                formatLabel="Markdown"
                content={previewMarkdown}
                emptyHint="Preview will show a markdown summary of the flow."
              />
            )}
          </RightSidebar>
        </div>
      ) : null}

      <main className="studio-main">
        <div className="studio-canvas-card">
          {panelsCollapsed ? (
            <StudioFloatingChrome
              workflowName={session.workflow?.name ?? "Workflow 1"}
              running={trace.running}
              canAct={!!currentIr}
              busy={session.busy}
              onExpandPanels={() => setPanelsCollapsed(false)}
              onRun={() => {
                if (!currentIr) return;
                setPanelsCollapsed(false);
                setRightTab("preview");
                void trace.runWorkflow(currentIr);
              }}
              onDeploy={() => undefined}
              deployDisabled
            />
          ) : null}
          {panelsCollapsed && profile?.path === "business" ? (
            <button
              type="button"
              className="studio-float-dashboard"
              onClick={() => setBusinessNav("dashboard")}
            >
              ← Dashboard
            </button>
          ) : null}
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
            showMiniMap={false}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={graph.onConnect}
            onSelectionChange={graph.onSelectionChange}
            onGraphDirty={() => session.setDirty(true)}
          />
        </div>
      </main>

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
            if (profile?.products?.length) seedFromProducts(profile.products);
            else focusPreview();
          });
        }}
        onBlank={() => {
          void session.startBlank().then(async () => {
            await markOnboardingDone();
            setLeftTab("api");
            focusPreview();
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
