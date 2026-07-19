"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  analyzeWorkflow,
  fetchAnalysis,
  fetchCatalog,
  fetchWorkflow,
  remediateWorkflow,
  resetWorkflow,
  saveWorkflow,
  validateConnection,
} from "@/lib/api";
import { edgeToFlow, flowToWorkflow, newNodeId, workflowToFlow } from "@/lib/flowIo";
import type {
  AnalysisReport,
  Finding,
  GraphDiff,
  IrNode,
  NodeCategory,
  NodeMeta,
  Workflow,
} from "@/lib/ir";
import type { StudioNodeData } from "@/lib/toReactFlow";
import { ConfigPanel } from "./ConfigPanel";
import { StudioNode } from "./StudioNode";

const HEROES = [
  { id: "marketplace-unsafe", label: "Unsafe hero" },
  { id: "marketplace-safe", label: "Safe hero" },
] as const;

const PALETTE: { type: string; category: NodeCategory }[] = [
  { type: "safety.verify_signature", category: "safety" },
  { type: "safety.validate_amount", category: "safety" },
  { type: "safety.idempotency_guard", category: "safety" },
  { type: "monnify.verify_transaction", category: "monnify" },
  { type: "monnify.initiate_transfer", category: "monnify" },
  { type: "app.notify", category: "application" },
  { type: "event.payment_webhook", category: "event" },
];

const nodeTypes: NodeTypes = { studio: StudioNode };

function severityCount(report: AnalysisReport | null, sev: Finding["severity"]) {
  return report?.findings.filter((f) => f.severity === sev).length ?? 0;
}

function findingKey(f: Finding, idx: number) {
  return `${f.rule_id}-${f.node_ids.join("-")}-${idx}`;
}

function CanvasInner() {
  const { screenToFlowPosition, setCenter } = useReactFlow();
  const [heroId, setHeroId] = useState<(typeof HEROES)[number]["id"]>(
    "marketplace-unsafe",
  );
  const [source, setSource] = useState<"api" | "fixture" | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [nodeTypesMeta, setNodeTypesMeta] = useState<Record<string, NodeMeta>>({});
  const [catalog, setCatalog] = useState<Record<string, NodeMeta>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedFindingIdx, setSelectedFindingIdx] = useState<number | null>(null);
  const [expandedExplain, setExpandedExplain] = useState<number | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [diffNote, setDiffNote] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StudioNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const applyPayload = useCallback(
    (wf: Workflow, metas: Record<string, NodeMeta>, analysis: AnalysisReport) => {
      const flow = workflowToFlow(wf, metas);
      setWorkflow(wf);
      setNodeTypesMeta(metas);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setReport(analysis);
      setSelectedNodeId(null);
      setSelectedFindingIdx(null);
      setDirty(false);
    },
    [setEdges, setNodes],
  );

  const load = useCallback(
    async (id: (typeof HEROES)[number]["id"]) => {
      setLoading(true);
      setTypeError(null);
      setDiffNote(null);
      try {
        await resetWorkflow(id).catch(() => null);
        const [wf, analysis, cat] = await Promise.all([
          fetchWorkflow(id),
          fetchAnalysis(id),
          fetchCatalog(),
        ]);
        setCatalog(cat);
        applyPayload(
          wf.data.workflow,
          { ...cat, ...wf.data.node_types },
          analysis.data,
        );
        setSource(wf.source);
      } finally {
        setLoading(false);
      }
    },
    [applyPayload],
  );

  useEffect(() => {
    void load(heroId);
  }, [heroId, load]);

  const currentIr = useMemo(() => {
    if (!workflow) return null;
    return flowToWorkflow(workflow, nodes, edges);
  }, [workflow, nodes, edges]);

  const selectedFinding =
    selectedFindingIdx != null && report
      ? report.findings[selectedFindingIdx] ?? null
      : null;

  const highlightIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedFinding) {
      for (const nid of selectedFinding.node_ids) ids.add(nid);
      for (const nid of selectedFinding.path) ids.add(nid);
    }
    return ids;
  }, [selectedFinding]);

  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        className: highlightIds.has(n.id) ? "is-flagged" : undefined,
      })),
    );
  }, [highlightIds, setNodes]);

  useEffect(() => {
    setEdges((prev) =>
      prev.map((e) => {
        const onPath =
          selectedFinding &&
          selectedFinding.path.length > 1 &&
          selectedFinding.path.includes(e.source) &&
          selectedFinding.path.includes(e.target);
        return {
          ...e,
          style: {
            ...e.style,
            strokeWidth: onPath ? 3 : 1.5,
            stroke: onPath
              ? "var(--danger)"
              : e.animated
                ? "var(--edge-event)"
                : "var(--edge-control)",
          },
        };
      }),
    );
  }, [selectedFinding, setEdges]);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const src = nodes.find((n) => n.id === connection.source);
      const tgt = nodes.find((n) => n.id === connection.target);
      if (!src || !tgt) return;

      const check = await validateConnection({
        source_type: src.data.nodeType,
        target_type: tgt.data.nodeType,
      });
      if (!check.ok) {
        setTypeError(check.message || "TYPE ERROR");
        return;
      }
      setTypeError(null);
      const srcMeta = catalog[src.data.nodeType] ?? nodeTypesMeta[src.data.nodeType];
      const kind = srcMeta?.category === "event" ? "event" : "control";
      setEdges((eds) =>
        addEdge(
          edgeToFlow(
            {
              source: connection.source!,
              target: connection.target!,
              kind,
              condition: null,
            },
            eds.length,
          ),
          eds,
        ),
      );
      setDirty(true);
    },
    [catalog, nodeTypesMeta, nodes, setEdges],
  );

  const onSelectionChange = useCallback(({ nodes: sel }: OnSelectionChangeParams) => {
    setSelectedNodeId(sel[0]?.id ?? null);
  }, []);

  const selectedIrNode: IrNode | null = useMemo(() => {
    if (!currentIr || !selectedNodeId) return null;
    return currentIr.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [currentIr, selectedNodeId]);

  const reanalyze = useCallback(async (wf: Workflow) => {
    const analysis = await analyzeWorkflow(wf);
    setReport(analysis);
    return analysis;
  }, []);

  const handleAddNode = (typeKey: string) => {
    const meta = catalog[typeKey] ?? nodeTypesMeta[typeKey];
    const prefix = typeKey.split(".").pop() ?? "node";
    const label = meta?.title ?? typeKey;
    const id = newNodeId(new Set(nodes.map((n) => n.id)), prefix);

    // Place in the middle of the visible canvas (not a fixed IR corner off-screen).
    const canvasEl = document.querySelector(".studio-canvas") as HTMLElement | null;
    const rect = canvasEl?.getBoundingClientRect();
    const screenPoint = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const position = screenToFlowPosition(screenPoint);

    const node: Node<StudioNodeData, "studio"> = {
      id,
      type: "studio",
      position: { x: position.x - 90, y: position.y - 30 },
      selected: true,
      data: {
        label,
        nodeType: typeKey,
        category: (meta?.category ?? "application") as NodeCategory,
        title: label,
      },
    };

    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
    setSelectedNodeId(id);
    setDirty(true);
    setTypeError(null);
    setDiffNote(`Added “${label}” — drag handles to connect it`);
    requestAnimationFrame(() => {
      setCenter(position.x, position.y, { zoom: 1.05, duration: 220 });
    });
  };

  const handleDeleteSelected = () => {
    if (!selectedNodeId) return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedNodeId));
    setEdges((es) =>
      es.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId),
    );
    setSelectedNodeId(null);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!currentIr) return;
    setBusy(true);
    try {
      const saved = await saveWorkflow(currentIr);
      applyPayload(saved.workflow, { ...catalog, ...saved.node_types }, await reanalyze(saved.workflow));
      setSource("api");
      setDiffNote(`Saved v${saved.workflow.version}`);
    } catch (err) {
      setTypeError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const handleReanalyze = async () => {
    if (!currentIr) return;
    setBusy(true);
    try {
      setWorkflow(currentIr);
      await reanalyze(currentIr);
      setDirty(true);
    } catch (err) {
      setTypeError(err instanceof Error ? err.message : "Analyze failed");
    } finally {
      setBusy(false);
    }
  };

  const formatDiff = (diff: GraphDiff) => {
    const parts = [
      diff.added_nodes.length && `+${diff.added_nodes.length} nodes`,
      diff.removed_nodes.length && `−${diff.removed_nodes.length} nodes`,
      diff.added_edges.length && `+${diff.added_edges.length} edges`,
      diff.removed_edges.length && `−${diff.removed_edges.length} edges`,
    ].filter(Boolean);
    return parts.join(" · ") || "No structural change";
  };

  const handleApplyFix = async (ruleId?: string) => {
    if (!currentIr) return;
    setBusy(true);
    setTypeError(null);
    try {
      const result = await remediateWorkflow(currentIr, ruleId ?? "ALL");
      applyPayload(
        result.workflow,
        { ...catalog, ...result.node_types },
        result.analysis,
      );
      setSource("api");
      setDiffNote(`Apply Fix (${ruleId ?? "ALL"}): ${formatDiff(result.diff)}`);
    } catch (err) {
      setTypeError(err instanceof Error ? err.message : "Remediate failed");
    } finally {
      setBusy(false);
    }
  };

  const updateSelectedNode = (next: IrNode) => {
    if (!workflow) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === next.id
          ? {
              ...n,
              id: next.id,
              position: { x: next.position.x, y: next.position.y },
              data: {
                ...n.data,
                label: next.label ?? n.data.label,
                nodeType: next.type,
                title: catalog[next.type]?.title ?? next.type,
                category: (catalog[next.type]?.category ??
                  n.data.category) as NodeCategory,
              },
            }
          : n,
      ),
    );
    setWorkflow((wf) => {
      if (!wf) return wf;
      return {
        ...wf,
        nodes: wf.nodes.map((n) => (n.id === next.id ? next : n)),
      };
    });
    setDirty(true);
  };

  return (
    <div className="studio-shell">
      <header className="studio-top">
        <div className="studio-brand">
          <span className="studio-mark">MS</span>
          <div>
            <h1>Monnify Studio</h1>
            <p>Architecture canvas — prove the system around the endpoint</p>
          </div>
        </div>
        <div className="studio-top__meta">
          <span className="studio-source" data-source={source ?? undefined}>
            {source === "api" ? "Live API" : source === "fixture" ? "Local fixtures" : "…"}
            {workflow ? ` · v${workflow.version}` : ""}
            {dirty ? " · unsaved" : ""}
          </span>
          <div className="studio-switch">
            {HEROES.map((h) => (
              <button
                key={h.id}
                type="button"
                className={heroId === h.id ? "is-active" : ""}
                onClick={() => setHeroId(h.id)}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="studio-toolbar">
        <div className="palette">
          <span className="palette__label">Add</span>
          {PALETTE.map((p) => (
            <button key={p.type} type="button" onClick={() => handleAddNode(p.type)}>
              + {(catalog[p.type] ?? nodeTypesMeta[p.type])?.title ?? p.type}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <button type="button" disabled={!selectedNodeId} onClick={handleDeleteSelected}>
            Delete node
          </button>
          <button type="button" disabled={busy || !currentIr} onClick={() => void handleReanalyze()}>
            Re-analyze
          </button>
          <button type="button" disabled={busy || !currentIr} onClick={() => void handleSave()}>
            Save version
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={busy || !currentIr || (report?.findings.length ?? 0) === 0}
            onClick={() => void handleApplyFix("ALL")}
          >
            Apply Fix (all)
          </button>
        </div>
      </div>

      <div className="studio-body studio-body--3">
        <ConfigPanel
          node={selectedIrNode}
          meta={
            selectedIrNode
              ? catalog[selectedIrNode.type] ?? nodeTypesMeta[selectedIrNode.type]
              : undefined
          }
          selectedFinding={selectedFinding}
          onChange={updateSelectedNode}
          onClose={() => setSelectedNodeId(null)}
        />

        <main className="studio-canvas">
          {(loading || busy) && (
            <div className="studio-banner">{loading ? "Loading IR…" : "Working…"}</div>
          )}
          {typeError && <div className="studio-banner studio-banner--error">{typeError}</div>}
          {diffNote && !typeError && (
            <div className="studio-banner studio-banner--ok">{diffNote}</div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={(chs) => {
              onNodesChange(chs);
              setDirty(true);
            }}
            onEdgesChange={(chs) => {
              onEdgesChange(chs);
              setDirty(true);
            }}
            onConnect={(c) => void onConnect(c)}
            onSelectionChange={onSelectionChange}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.3}
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </main>

        <aside className="studio-review">
          <div className="studio-review__head">
            <h2>Architecture Review</h2>
            <p>{workflow?.name || "—"}</p>
          </div>
          <div className="studio-counts">
            <span data-sev="critical">{severityCount(report, "critical")} Critical</span>
            <span data-sev="high">{severityCount(report, "high")} High</span>
            <span data-sev="medium">{severityCount(report, "medium")} Medium</span>
          </div>
          <ul className="studio-findings">
            {(report?.findings ?? []).length === 0 && !loading && (
              <li className="studio-clean">No architectural findings. Ship it.</li>
            )}
            {(report?.findings ?? []).map((f, idx) => (
              <li
                key={findingKey(f, idx)}
                className={selectedFindingIdx === idx ? "is-selected-finding" : ""}
              >
                <button
                  type="button"
                  className="finding-hit"
                  onClick={() =>
                    setSelectedFindingIdx((cur) => (cur === idx ? null : idx))
                  }
                >
                  <div className="finding-top">
                    <span className={`sev sev-${f.severity}`}>{f.severity}</span>
                    <strong>
                      [{f.rule_id}] {f.title}
                    </strong>
                  </div>
                  <p>{f.message}</p>
                  {f.path.length > 0 && (
                    <code className="finding-path">{f.path.join(" → ")}</code>
                  )}
                </button>
                <p className="finding-fix">{f.remediation}</p>
                <div className="finding-actions">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedExplain((cur) => (cur === idx ? null : idx))
                    }
                  >
                    Explain
                  </button>
                  {f.doc_url && (
                    <a href={f.doc_url} target="_blank" rel="noreferrer">
                      Docs
                    </a>
                  )}
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={busy}
                    onClick={() => void handleApplyFix(f.rule_id)}
                  >
                    Apply Fix
                  </button>
                </div>
                {expandedExplain === idx && (
                  <p className="finding-explain">{f.explanation}</p>
                )}
              </li>
            ))}
          </ul>
        </aside>
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
