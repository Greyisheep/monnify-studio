// Custom React Flow node: a card colored by category, ringed red when the
// analyzer flags it. Making correctness visible is the whole point (#4, D9).

import { Handle, Position, type NodeProps } from "reactflow";
import { CATEGORY_COLOR, type StudioNodeData } from "@/lib/graph";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#94a3b8",
};

export function StudioNode({ data }: NodeProps<StudioNodeData>) {
  const accent = CATEGORY_COLOR[data.category] ?? "#94a3b8";
  const flag = data.flagged ? SEVERITY_COLOR[data.flagged] : null;

  return (
    <div
      style={{
        minWidth: 170,
        maxWidth: 210,
        background: "#0f172a",
        border: `1px solid ${flag ?? "#1e293b"}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: flag ? `0 0 0 2px ${flag}55` : "0 1px 3px rgba(0,0,0,0.4)",
        color: "#e2e8f0",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: "#475569" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", color: accent }}>
          {data.category}
        </span>
        {flag && (
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              textTransform: "uppercase",
              color: "#0f172a",
              background: flag,
              borderRadius: 4,
              padding: "1px 5px",
            }}
          >
            {data.flagged}
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3, lineHeight: 1.25 }}>
        {data.label}
      </div>
      <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontFamily: "monospace" }}>
        {data.nodeType}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: "#475569" }} />
    </div>
  );
}
