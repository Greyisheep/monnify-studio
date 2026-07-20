/**
 * Session orchestration: load hero, save, analyze, Apply Fix.
 * Hides API/fixture source from the UI tree. Provenance: #4, #27, #6, #37.
 */
"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";

import {
  analyzeWorkflow,
  classifyIntent,
  composeWorkflow,
  createFromTemplate,
  fetchAnalysis,
  fetchCatalog,
  fetchWorkflow,
  remediateWorkflow,
  resetWorkflow,
  saveWorkflow,
  type DataSource,
} from "@/lib/api";
import type { HeroId } from "@/lib/constants";
import { formatGraphDiff } from "@/lib/findings";
import { workflowToFlow } from "@/lib/flowIo";
import {
  applyLayoutToWorkflow,
  graphDiffChangesStructure,
  layoutFlowElements,
} from "@/lib/layout";
import type { AnalysisReport, NodeMeta, StudioNodeData, Workflow } from "@/types";

export interface UseStudioSessionOptions {
  setNodes: Dispatch<SetStateAction<Node<StudioNodeData>[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
}

export function useStudioSession({ setNodes, setEdges }: UseStudioSessionOptions) {
  const [heroId, setHeroId] = useState<HeroId>("marketplace-unsafe");
  const [source, setSource] = useState<DataSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [nodeTypesMeta, setNodeTypesMeta] = useState<Record<string, NodeMeta>>({});
  const [catalog, setCatalog] = useState<Record<string, NodeMeta>>({});
  const [typeError, setTypeError] = useState<string | null>(null);
  const [diffNote, setDiffNote] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedFindingIndex, setSelectedFindingIndex] = useState<number | null>(null);
  const [layoutNonce, setLayoutNonce] = useState(0);

  const applyPayload = useCallback(
    (
      nextWorkflow: Workflow,
      nodeMetas: Record<string, NodeMeta>,
      analysis: AnalysisReport,
      options?: { relayout?: boolean },
    ) => {
      let flow = workflowToFlow(nextWorkflow, nodeMetas);
      let workflowToStore = nextWorkflow;
      if (options?.relayout) {
        const layouted = layoutFlowElements(flow.nodes, flow.edges);
        flow = {
          nodes: layouted.nodes as typeof flow.nodes,
          edges: layouted.edges,
        };
        workflowToStore = applyLayoutToWorkflow(nextWorkflow, flow.nodes);
        setLayoutNonce((nonce) => nonce + 1);
      }
      setWorkflow(workflowToStore);
      setNodeTypesMeta(nodeMetas);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setReport(analysis);
      setSelectedNodeId(null);
      setSelectedFindingIndex(null);
      setDirty(false);
    },
    [setEdges, setNodes],
  );

  const loadHero = useCallback(
    async (nextHeroId: HeroId) => {
      setLoading(true);
      setTypeError(null);
      setDiffNote(null);
      try {
        await resetWorkflow(nextHeroId).catch(() => null);
        const [workflowResult, analysisResult, catalogResult] = await Promise.all([
          fetchWorkflow(nextHeroId),
          fetchAnalysis(nextHeroId),
          fetchCatalog(),
        ]);
        setCatalog(catalogResult);
        applyPayload(
          workflowResult.data.workflow,
          { ...catalogResult, ...workflowResult.data.node_types },
          analysisResult.data,
        );
        setSource(workflowResult.source);
      } finally {
        setLoading(false);
      }
    },
    [applyPayload],
  );

  useEffect(() => {
    void loadHero(heroId);
  }, [heroId, loadHero]);

  const reanalyze = useCallback(async (nextWorkflow: Workflow) => {
    const analysis = await analyzeWorkflow(nextWorkflow);
    setReport(analysis);
    return analysis;
  }, []);

  const save = useCallback(
    async (current: Workflow) => {
      setBusy(true);
      try {
        const saved = await saveWorkflow(current);
        const analysis = await reanalyze(saved.workflow);
        applyPayload(saved.workflow, { ...catalog, ...saved.node_types }, analysis);
        setSource("api");
        setDiffNote(`Saved v${saved.workflow.version}`);
      } catch (error) {
        setTypeError(error instanceof Error ? error.message : "Save failed");
      } finally {
        setBusy(false);
      }
    },
    [applyPayload, catalog, reanalyze],
  );

  const applyFix = useCallback(
    async (current: Workflow, ruleId?: string) => {
      setBusy(true);
      setTypeError(null);
      try {
        const result = await remediateWorkflow(current, ruleId ?? "ALL");
        const shouldRelayout = graphDiffChangesStructure(result.diff);
        applyPayload(
          result.workflow,
          { ...catalog, ...result.node_types },
          result.analysis,
          { relayout: shouldRelayout },
        );
        setSource("api");
        setDiffNote(
          `Apply Fix (${ruleId ?? "ALL"}): ${formatGraphDiff(result.diff)}${
            shouldRelayout ? " · re-laid out" : ""
          }`,
        );
      } catch (error) {
        setTypeError(error instanceof Error ? error.message : "Remediate failed");
      } finally {
        setBusy(false);
      }
    },
    [applyPayload, catalog],
  );

  const runAnalyze = useCallback(
    async (current: Workflow) => {
      setBusy(true);
      try {
        setWorkflow(current);
        await reanalyze(current);
        setDirty(true);
      } catch (error) {
        setTypeError(error instanceof Error ? error.message : "Analyze failed");
      } finally {
        setBusy(false);
      }
    },
    [reanalyze],
  );

  const askMoni = useCallback(
    async (message: string) => {
      setBusy(true);
      setTypeError(null);
      try {
        try {
          const composed = await composeWorkflow(message);
          applyPayload(
            composed.workflow,
            { ...catalog, ...composed.node_types },
            composed.analysis,
            { relayout: true },
          );
          setSource("api");
          const caught =
            composed.findings_caught.length > 0
              ? ` · caught ${composed.findings_caught.join(", ")}`
              : "";
          setDiffNote(
            `Moni composed “${composed.workflow.name}” (${composed.provider})${caught}`,
          );
          return {
            kind: "compose" as const,
            explanation:
              composed.explanation ||
              `Built “${composed.workflow.name}” and loaded it on the canvas.`,
            workflowName: composed.workflow.name,
          };
        } catch (composeError) {
          const msg =
            composeError instanceof Error ? composeError.message : String(composeError);
          if (!msg.startsWith("503")) throw composeError;
        }

        const intent = await classifyIntent(message);
        if (!intent.template_id || intent.template_id === "unknown" || intent.confidence < 0.4) {
          return {
            kind: "clarify" as const,
            explanation:
              intent.clarifying_question ||
              intent.explanation ||
              "I need a bit more detail before I can set that up.",
            workflowName: null,
          };
        }

        const payload = await createFromTemplate(intent.template_id);
        const [analysis, catalogResult] = await Promise.all([
          analyzeWorkflow(payload.workflow),
          catalog && Object.keys(catalog).length > 0
            ? Promise.resolve(catalog)
            : fetchCatalog(),
        ]);
        if (!Object.keys(catalog).length) setCatalog(catalogResult);
        applyPayload(
          payload.workflow,
          { ...catalogResult, ...payload.node_types },
          analysis,
          { relayout: true },
        );
        setSource("api");
        setDiffNote(
          `Moni set up template “${intent.template_id}” (${intent.provider})`,
        );
        return {
          kind: "template" as const,
          explanation:
            intent.explanation ||
            `Loaded the “${intent.template_id}” template onto the canvas.`,
          workflowName: payload.workflow.name,
          templateId: intent.template_id,
        };
      } catch (error) {
        const text = error instanceof Error ? error.message : "Moni request failed";
        setTypeError(text);
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [applyPayload, catalog],
  );

  return {
    heroId,
    setHeroId,
    source,
    loading,
    busy,
    report,
    workflow,
    setWorkflow,
    nodeTypesMeta,
    catalog,
    typeError,
    setTypeError,
    diffNote,
    setDiffNote,
    dirty,
    setDirty,
    selectedNodeId,
    setSelectedNodeId,
    selectedFindingIndex,
    setSelectedFindingIndex,
    layoutNonce,
    save,
    applyFix,
    runAnalyze,
    askMoni,
  };
}
