"use client";

// The canvas (#4, #38): render the hero IR, highlight what the analyzer flags,
// and let Apply-Fix rewrite the unsafe graph into a clean one in front of you.

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, BackgroundVariant, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";

import { FindingsPanel } from "@/components/FindingsPanel";
import { StudioNode } from "@/components/StudioNode";
import { api } from "@/lib/api";
import { toFlow, type StudioNodeData } from "@/lib/graph";
import { theme } from "@/lib/theme";
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
      setError(`Cannot reach the API on :8000. Is it running? (${String(e)})`);
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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: theme.bg }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "12px 22px",
          background: theme.panel,
          borderBottom: `1px solid ${theme.panelBorder}`,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: `linear-gradient(135deg, ${theme.accent}, #4f7bff)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            color: "#fff",
            fontSize: 18,
          }}
        >
          M
        </div>
        <div style={{ marginRight: "auto" }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: theme.text }}>Monnify Studio</div>
          <div style={{ fontSize: 11, color: theme.textFaint }}>
            An endpoint returning 200 does not mean the integration is correct.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            background: theme.card,
            borderRadius: 9,
            padding: 3,
            border: `1px solid ${theme.cardBorder}`,
          }}
        >
          {HEROES.map((h) => (
            <button
              key={h.id}
              onClick={() => setHeroId(h.id)}
              style={{
                border: "none",
                borderRadius: 6,
                padding: "6px 16px",
                fontSize: 13,
                color: heroId === h.id ? "#08080c" : theme.textDim,
                background: heroId === h.id ? theme.text : "transparent",
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
            borderRadius: 9,
            padding: "9px 18px",
            fontSize: 13,
            fontWeight: 600,
            color: canFix ? "#052e16" : theme.textFaint,
            background: canFix ? "linear-gradient(135deg, #34d399, #22c55e)" : theme.card,
            border: canFix ? "none" : `1px solid ${theme.cardBorder}`,
            boxShadow: canFix ? "0 6px 16px rgba(34,197,94,0.3)" : "none",
          }}
        >
          {busy ? "Fixing..." : remediated ? "Remediated" : "Apply Fix"}
        </button>
      </header>

      {error && (
        <div style={{ padding: 10, background: "#3b0a0a", color: "#fca5a5", fontSize: 13, textAlign: "center" }}>
          {error}
        </div>
      )}
      {remediated && (
        <div
          style={{
            padding: 9,
            background: "rgba(34,197,94,0.1)",
            color: "#86efac",
            fontSize: 12,
            textAlign: "center",
            borderBottom: "1px solid #14532d",
          }}
        >
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
            fitViewOptions={{ padding: 0.25 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} color={theme.dot} gap={22} size={1.5} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <FindingsPanel report={report} />
      </div>
    </div>
  );
}
