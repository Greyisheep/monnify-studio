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
import {
  absoluteApiUrl,
  fetchStudioProfile,
  fetchWorkflowCode,
  fetchWorkflowDashboard,
  putStudioProfile,
  saveWorkflow,
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
  /** Code tab format (#152): JSON from canvas IR; Python from GET /workflows/{id}/code. */
  const [codeFormat, setCodeFormat] = useState<"json" | "python">("json");
  const [pythonFilename, setPythonFilename] = useState<string | null>(null);
  const [pythonSource, setPythonSource] = useState("");
  const [pythonBusy, setPythonBusy] = useState(false);
  const [pythonError, setPythonError] = useState<string | null>(null);
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
      "- Run to stream an execution trace",
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

  // Python Code tab: debounced save + codegen when Flow changes (#152).
  useEffect(() => {
    if (rightTab !== "code" || codeFormat !== "python") return;
    if (!currentIr?.id) {
      setPythonSource("");
      setPythonFilename(null);
      setPythonError(null);
      return;
    }

    const controller = new AbortController();
    const debounceMs = 400;
    setPythonBusy(true);
    setPythonError(null);

    const debounceTimer = window.setTimeout(() => {
      void (async () => {
        try {
          await saveWorkflow(currentIr);
          if (controller.signal.aborted) return;
          const generated = await fetchWorkflowCode(
            currentIr.id,
            "python",
            controller.signal,
          );
          if (controller.signal.aborted) return;
          setPythonSource(generated.code);
          setPythonFilename(generated.filename);
        } catch (error) {
          if (controller.signal.aborted) return;
          setPythonSource("");
          setPythonFilename(null);
          setPythonError(
            error instanceof Error
              ? error.message
              : "Could not generate Python for this Flow.",
          );
        } finally {
          if (!controller.signal.aborted) setPythonBusy(false);
        }
      })();
    }, debounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(debounceTimer);
    };
  }, [rightTab, codeFormat, currentIr]);

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

  async function handleBusinessTemplatePick(templateId: string) {
    setProfileBusy(true);
    setProfileError(null);
    setTemplatesOpen(false);
    try {
      const goal = goalFromTemplate(templateId);
      const inOnboarding =
        profile?.step === "template" ||
        profile?.step === "intent" ||
        profile?.step === "user_type";

      if (
        goal === "sell" &&
        (inOnboarding || !(profile?.products?.length))
      ) {
        const next = await putStudioProfile({
          path: "business",
          goal,
          step: "products",
        });
        setProfile(next);
        return;
      }

      try {
        await session.setupFromIntent(templateId, {});
      } catch (error) {
        session.setTypeError(
          error instanceof Error ? error.message : "Could not set up template",
        );
      }

      const next = await putStudioProfile({
        path: "business",
        goal,
        step: "dashboard",
        products: profile?.products ?? [],
      });
      setProfile(next);
      setBusinessNav("dashboard");
    } finally {
      setProfileBusy(false);
    }
  }

  async function handleDeveloperTemplatePick(templateId: string) {
    setTemplatesOpen(false);
    setProfileBusy(true);
    try {
      await session.startFromTemplate(templateId);
      await markOnboardingDone();
      setLeftTab("api");
      focusPreview();
    } catch (error) {
      session.setTypeError(
        error instanceof Error ? error.message : "Template failed",
      );
    } finally {
      setProfileBusy(false);
    }
  }

  async function handleTemplatePick(templateId: string) {
    if (
      profile?.path === "business" ||
      profile?.step === "template" ||
      profile?.step === "intent" ||
      profile?.step === "products"
    ) {
      await handleBusinessTemplatePick(templateId);
      return;
    }
    await handleDeveloperTemplatePick(templateId);
  }

  async function handleTemplateOther() {
    setTemplatesOpen(false);
    if (profile?.path === "business" || profile?.step === "template") {
      await onOnboardingBlank();
      return;
    }
    setProfileBusy(true);
    try {
      await session.startBlank();
      await markOnboardingDone();
      setLeftTab("chat");
      focusPreview();
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
    setProfileError(null);
    try {
      // Always persist path + goal with products so a partial patch cannot drop
      // business context (session cookie must be first-party via /studio-backend).
      const next = await putStudioProfile({
        path: "business",
        goal: profile?.goal ?? "sell",
        products: products.map((p) => ({
          ...p,
          // Profile store is not for multi-MB data URLs; shop setup uses name/price.
          image_url:
            p.image_url && p.image_url.length > 8_000 ? null : p.image_url ?? null,
        })),
        step: "dashboard",
      });
      setProfile(next);
      setBusinessNav("dashboard");

      const first = products[0];
      const priceNum =
        first && first.price_ngn != null && first.price_ngn !== ""
          ? Number(first.price_ngn)
          : NaN;
      try {
        await session.setupFromIntent("sell-online", {
          business_name: "My Business",
          ...(first?.name ? { product_name: first.name } : {}),
          ...(Number.isNaN(priceNum) ? {} : { price_ngn: priceNum }),
        });
      } catch (setupError) {
        session.setTypeError(
          setupError instanceof Error
            ? setupError.message
            : "Shop setup failed — dashboard is still open.",
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save products";
      setProfileError(message);
      session.setTypeError(message);
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

  async function goBusinessDashboard() {
    if (profile?.path !== "business") return;
    setBusinessNav("dashboard");
    if (profile.step === "dashboard" || profile.step === "done") return;
    try {
      const next = await putStudioProfile({ step: "dashboard" });
      setProfile(next);
    } catch (error) {
      session.setTypeError(
        error instanceof Error ? error.message : "Could not open dashboard",
      );
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
          initialProductTab={
            profile?.goal === "invoice"
              ? "invoice"
              : profile?.goal === "savings"
                ? "ajo"
                : "sell"
          }
          activeNav={businessNav === "workflow" ? "workflow" : "dashboard"}
          onNav={(nav) => {
            if (nav === "workflow") void goBusinessWorkflow();
            else void goBusinessDashboard();
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
          onBack={() => setTemplatesOpen(false)}
          onPick={(templateId) => void handleTemplatePick(templateId)}
          onOther={() => void handleTemplateOther()}
        />
      </>
    );
  }

  const railActive: "workflow" | "dashboard" | "new" =
    profile?.path === "business" && businessNav === "dashboard"
      ? "dashboard"
      : templatesOpen
        ? "new"
        : "workflow";

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
              busy={profileBusy}
              onClose={() => undefined}
              onBack={() => void onTemplateBack()}
              onPick={(templateId) => void handleTemplatePick(templateId)}
              onOther={() => void handleTemplateOther()}
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
              active={railActive}
              onNew={() => setTemplatesOpen(true)}
              onDashboard={() => void goBusinessDashboard()}
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
                formats={[
                  { id: "json", label: "JSON" },
                  { id: "python", label: "Python" },
                ]}
                activeFormat={codeFormat}
                onFormatChange={(id) =>
                  setCodeFormat(id === "python" ? "python" : "json")
                }
                subtitle={
                  codeFormat === "python" ? pythonFilename : null
                }
                content={
                  codeFormat === "python"
                    ? pythonError
                      ? ""
                      : pythonSource
                    : codeDocument
                }
                busy={codeFormat === "python" && pythonBusy}
                emptyHint={
                  codeFormat === "python"
                    ? pythonError ??
                      "Compose or open a Flow to generate Python."
                    : "Compose or open a workflow to see its code."
                }
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
        open={templatesOpen}
        busy={session.busy || profileBusy}
        dismissible
        onClose={() => setTemplatesOpen(false)}
        onBack={() => setTemplatesOpen(false)}
        onPick={(templateId) => void handleTemplatePick(templateId)}
        onOther={() => void handleTemplateOther()}
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
