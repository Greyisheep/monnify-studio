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
import { useOnboardingTour } from "@/hooks/useOnboardingTour";
import { useSidebarWidths } from "@/hooks/useSidebarWidths";
import { useStudioGraph } from "@/hooks/useStudioGraph";
import { useStudioSession } from "@/hooks/useStudioSession";
import {
  findingHighlightIds,
  withEdgeHighlights,
  withNodeHighlights,
} from "@/lib/findings";
import { flowToWorkflow } from "@/lib/flowIo";
import { latestRunIoByNode } from "@/lib/runIo";
import {
  absoluteApiUrl,
  explainAssistant,
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
import { ConfigPanel } from "./ConfigPanel";
import { InspectDocumentPanel } from "./InspectDocumentPanel";
import { NodePalette } from "./NodePalette";
import { OnboardingChrome } from "./OnboardingChrome";
import { OnboardingTour } from "./OnboardingTour";
import { PathGate } from "./PathGate";
import { ProductsStep } from "./ProductsStep";
import { RightSidebar } from "./RightSidebar";
import { RunSettingsPanel } from "./RunSettingsPanel";
import { StudioFloatingChrome } from "./StudioFloatingChrome";
import { StudioIconRail } from "./StudioIconRail";
import { TemplatePicker } from "./TemplatePicker";
import { TracePanel } from "./TracePanel";
import { WorkflowCanvas } from "./WorkflowCanvas";
import type {
  BusinessGoal,
  ExecutionAdapter,
  ShopProduct,
  StudioPath,
  StudioProfile,
} from "@/types";

const HERO_WORKFLOW_IDS = new Set(["marketplace-unsafe", "marketplace-safe"]);

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
  const [rightTab, setRightTab] = useState<
    "preview" | "code" | "review" | "settings"
  >("preview");
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
    shareLabel: string;
    artifactId: string | null;
  } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [explainBusy, setExplainBusy] = useState(false);
  const [explainNote, setExplainNote] = useState<string | null>(null);
  const [executionAdapter, setExecutionAdapter] =
    useState<ExecutionAdapter>("mock");

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
            workflow_id: null,
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
            workflow_id: null,
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

  const displayNodes = useMemo(() => {
    const highlighted = withNodeHighlights(nodes, highlightIds);
    const runIo = latestRunIoByNode(trace.events);
    const configById = new Map(
      currentIr?.nodes.map((irNode) => [irNode.id, irNode.config]) ?? [],
    );
    return highlighted.map((node) => {
      const io = runIo[node.id];
      const config = configById.get(node.id);
      const meta =
        session.catalog[node.data.nodeType] ?? session.nodeTypesMeta[node.data.nodeType];
      return {
        ...node,
        data: {
          ...node.data,
          runIo: io ?? null,
          config: config && Object.keys(config).length > 0 ? config : undefined,
          inputs: meta?.inputs,
        },
      };
    });
  }, [nodes, highlightIds, trace.events, currentIr, session.catalog, session.nodeTypesMeta]);
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
    if (selectedIrNode?.id) {
      setRightTab("code");
    }
  }, [selectedIrNode?.id]);

  function focusPreview() {
    setRightTab("preview");
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
        const setup = await session.setupFromIntent(templateId, {});
        const next = await putStudioProfile({
          path: "business",
          goal,
          step: "dashboard",
          products: profile?.products ?? [],
          workflow_id: setup.workflowId,
        });
        setProfile(next);
        setBusinessNav("dashboard");
      } catch (error) {
        session.setTypeError(
          error instanceof Error ? error.message : "Could not set up template",
        );
        const next = await putStudioProfile({
          path: "business",
          goal,
          step: "dashboard",
          products: profile?.products ?? [],
        });
        setProfile(next);
        setBusinessNav("dashboard");
      }
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
        const setup = await session.setupFromIntent("sell-online", {
          business_name: "My Business",
          ...(first?.name ? { product_name: first.name } : {}),
          ...(Number.isNaN(priceNum) ? {} : { price_ngn: priceNum }),
        });
        const linked = await putStudioProfile({
          workflow_id: setup.workflowId,
          step: "dashboard",
          path: "business",
          goal: profile?.goal ?? "sell",
        });
        setProfile(linked);
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

  // #169: restore the business Flow after cold reload (profile.workflow_id, else heuristic).
  useEffect(() => {
    if (!profileReady || !session.ready || session.workflow || session.loading) {
      return;
    }
    if (profile?.path !== "business") return;
    if (profile.step !== "dashboard" && profile.step !== "done") return;

    const preferred = profile.workflow_id?.trim() || null;
    const fallback = session.workflows.find(
      (w) => !HERO_WORKFLOW_IDS.has(w.id),
    )?.id;
    const id = preferred || fallback || null;
    if (!id) return;
    const openWorkflow = session.openWorkflow;
    void openWorkflow(id).then(() => {
      if (preferred) return;
      void putStudioProfile({ workflow_id: id }).then((next) => setProfile(next));
    });
  }, [
    profileReady,
    profile?.path,
    profile?.step,
    profile?.workflow_id,
    session.ready,
    session.workflow,
    session.loading,
    session.workflows,
    session.openWorkflow,
  ]);

  const tourPath =
    showOnboarding || templatesOpen
      ? null
      : showBusinessDashboard
        ? ("business" as const)
        : profile?.path === "developer" && profile.step === "done"
          ? ("developer" as const)
          : null;
  // Business tour matches Figma filled dashboard: wait until the owner is
  // actually on the dashboard shell it highlights. Gate on the dashboard
  // itself (not products.length) so Invoice/Ajo — which never populate
  // products — still get the tour; "Something else" (goal "other") never
  // reaches the dashboard shell, so blank setups are naturally excluded.
  const businessTourReady =
    tourPath === "business" &&
    showBusinessDashboard &&
    profile?.goal !== "other";
  const developerTourReady = tourPath === "developer";
  const tour = useOnboardingTour({
    path: tourPath,
    ready:
      Boolean(tourPath) &&
      profileReady &&
      session.ready &&
      (tourPath === "business" ? businessTourReady : developerTourReady),
  });

  async function askWhySelectedNode() {
    if (!selectedIrNode) return;
    setExplainBusy(true);
    setExplainNote(null);
    setLeftTab("chat");
    try {
      const result = await explainAssistant({
        question: `Why does this Block matter in a payment flow? Explain simply.`,
        node_type: selectedIrNode.type,
        workflow_id: session.activeWorkflowId,
      });
      const sources =
        result.sources?.length > 0
          ? `\n\nSources:\n${result.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}`
          : "";
      setExplainNote(`${result.answer}${sources}`);
      session.setDiffNote("Moni answered Why? — see the note under Preview.");
    } catch (error) {
      setExplainNote(
        error instanceof Error ? error.message : "Could not reach Moni explain.",
      );
    } finally {
      setExplainBusy(false);
    }
  }

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
          // Goal-aware share link (#160): shop for sellers, contribution for ajo.
          shopUrl: d.share_path ? absoluteApiUrl(d.share_path) : null,
          shareLabel: d.share_label || "Your shop link",
          artifactId: d.artifact_id,
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
          artifactId={bizData?.artifactId ?? null}
          shareLabel={bizData?.shareLabel}
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
              workflow_id: null,
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
        {tour.active && tour.step ? (
          <OnboardingTour
            step={tour.step}
            stepIndex={tour.stepIndex}
            stepCount={tour.stepCount}
            onNext={tour.next}
            onBack={tour.back}
            onSkip={tour.skip}
          />
        ) : null}
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
              onRefine={session.refineWithMoni}
              hasOpenWorkflow={
                profile?.path === "developer" && !!session.activeWorkflowId
              }
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
            executionAdapter={executionAdapter}
            onRun={() => {
              if (!currentIr) return;
              setRightTab("preview");
              void trace.runWorkflow(currentIr, executionAdapter);
            }}
            onDeploy={() => undefined}
            deployDisabled
            deployTitle="Coming soon"
            onResizeStart={(event) => sidebars.beginResize("right", event)}
          >
            {rightTab === "settings" ? (
              <RunSettingsPanel
                adapter={executionAdapter}
                workflowId={session.activeWorkflowId}
                busy={session.busy || trace.running}
                onAdapterChange={setExecutionAdapter}
              />
            ) : selectedIrNode?.type === "custom.code" && rightTab === "code" ? (
              <ConfigPanel
                node={selectedIrNode}
                meta={
                  session.nodeTypesMeta[selectedIrNode.type] ??
                  session.catalog[selectedIrNode.type]
                }
                selectedFinding={selectedFinding}
                onChange={(nextNode) => graph.updateSelectedNode(nextNode)}
                onClose={() => session.setSelectedNodeId(null)}
              />
            ) : rightTab === "code" ? (
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
            ) : trace.running || trace.run || trace.events.length > 0 ? (
              /* Run output lives here (#177): the trace was orphaned by the
                 Figma shell, so pressing Run streamed events into nothing. */
              <TracePanel
                run={trace.run}
                events={trace.events}
                selectedSeq={trace.selectedSeq}
                running={trace.running}
                error={trace.error}
                onSelect={trace.setSelectedSeq}
                onClose={trace.clear}
              />
            ) : (
              <div className="studio-preview-stack">
                {selectedIrNode ? (
                  <div className="studio-why-bar">
                    <button
                      type="button"
                      className="studio-btn studio-btn--ghost"
                      disabled={explainBusy || session.busy}
                      onClick={() => void askWhySelectedNode()}
                    >
                      {explainBusy ? "Asking Moni…" : "Why?"}
                    </button>
                    <span className="muted">
                      Ask Moni why “{selectedIrNode.label || selectedIrNode.type}” is here
                    </span>
                  </div>
                ) : null}
                {explainNote ? (
                  <pre className="studio-explain-note">{explainNote}</pre>
                ) : null}
                <InspectDocumentPanel
                  formatLabel="Markdown"
                  content={previewMarkdown}
                  emptyHint="Preview will show a markdown summary of the flow."
                />
              </div>
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
                void trace.runWorkflow(currentIr, executionAdapter);
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
            onDropNode={(typeKey, flow) => graph.addNode(typeKey, flow)}
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
      {tour.active && tour.step ? (
        <OnboardingTour
          step={tour.step}
          stepIndex={tour.stepIndex}
          stepCount={tour.stepCount}
          onNext={tour.next}
          onBack={tour.back}
          onSkip={tour.skip}
        />
      ) : null}
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
