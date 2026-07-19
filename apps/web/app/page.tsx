"use client";

// The canvas (#4): render the hero IR, highlight what the analyzer flags, and let
// Apply-Fix rewrite the unsafe graph into a clean one, in front of your eyes.

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";

import { FindingsPanel } from "@/components/FindingsPanel";
import { StudioNode } from "@/components/StudioNode";
import { api } from "@/lib/api";
import { toFlow, type StudioNodeData } from "@/lib/graph";
import type { Report, Workflow } from "@/lib/types";

const HEROES = [
  { id: "marketplace-unsafe", label: "Unsafe" },
  { id: "marketplace-safe", label: "Safe" },
];

export default function Page() {
  const [heroId, setHeroId] = useState("marketplace-unsafe");
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remediated, setRemediated] = useState(false);

  const nodeTypes = useMemo(() => ({ studio: StudioNode }), []);

  const load = useCallback(async (id: string) => {
    setError(null);
    setRemediated(false);
    try {
      const [wf, rep] = await Promise.all([api.getWorkflow(id), api.getNamedAnalysis(id)]);
      setWorkflow(wf);
      setReport(rep);
    } catch (e) {
      setError(`Cannot reach the API. Is it running on :8000? (${String(e)})`);
    }
  }, []);

  useEffect(() => {
    load(heroId);
  }, [heroId, load]);

  const applyFix = useCallback(async () => {
    if (!workflow) return;
    setBusy(true);
    try {
      const result = await api.remediate(workflow);
      const rep = await api.analyze(result.workflow);
      setWorkflow(result.workflow);
      setReport(rep);
      setRemediated(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [workflow]);

  const { nodes, edges } = useMemo<{ nodes: Node<StudioNodeData>[]; edges: Edge[] }>(
    () => (workflow ? toFlow(workflow, report) : { nodes: [], edges: [] }),
    [workflow, report],
  );

  const criticals = (report?.findings ?? []).filter((f) => f.severity === "critical").length;
  const canFix = heroId === "marketplace-unsafe" && !remediated && (report?.findings.length ?? 0) > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "12px 20px",
          background: "#0b1120",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <div style={{ marginRight: "auto" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Monnify Studio</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            An endpoint returning 200 does not mean the integration is correct.
          </div>
        </div>

        <div style={{ display: "flex", background: "#0f172a", borderRadius: 8, padding: 3, border: "1px solid #1e293b" }}>
          {HEROES.map((h) => (
            <button
              key={h.id}
              onClick={() => setHeroId(h.id)}
              style={{
                border: "none",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 13,
                color: heroId === h.id ? "#0f172a" : "#94a3b8",
                background: heroId === h.id ? "#e2e8f0" : "transparent",
                fontWeight: 600,
              }}
            >
              {h.label}
            </button>
          ))}
        </div>

        <button
          onClick={applyFix}
          disabled={!canFix || busy}
          style={{
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            color: canFix ? "#052e16" : "#475569",
            background: canFix ? "#22c55e" : "#0f172a",
            border: canFix ? "none" : "1px solid #1e293b",
          }}
        >
          {busy ? "Fixing..." : remediated ? "Remediated" : "Apply Fix"}
        </button>
      </header>

      {error && (
        <div style={{ padding: 10, background: "#450a0a", color: "#fca5a5", fontSize: 13 }}>{error}</div>
      )}
      {remediated && (
        <div style={{ padding: 8, background: "#052e16", color: "#86efac", fontSize: 12, textAlign: "center" }}>
          Apply-Fix inserted the missing safety nodes. Critical findings: {criticals}.
        </div>
      )}

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1e293b" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <FindingsPanel report={report} />
      </div>
    </div>
  );
}
