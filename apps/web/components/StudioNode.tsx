// Custom React Flow node (#38, D9): an icon-led card colored by category, ringed
// and badged when the analyzer flags it. Premium workflow-builder styling.

import { Handle, Position, type NodeProps } from "reactflow";
import { CategoryIcon } from "./CategoryIcon";
import { categoryMeta, SEVERITY_COLOR, theme } from "@/lib/theme";
import type { StudioNodeData } from "@/lib/graph";

export function StudioNode({ data }: NodeProps<StudioNodeData>) {
  const meta = categoryMeta(data.category);
  const flag = data.flagged ? SEVERITY_COLOR[data.flagged] : null;

  return (
    <div
      style={{
        position: "relative",
        minWidth: 210,
        maxWidth: 240,
        background: `linear-gradient(180deg, ${theme.cardTop} 0%, ${theme.card} 100%)`,
        border: `1px solid ${flag ?? theme.cardBorder}`,
        borderRadius: theme.radius,
        padding: 12,
        display: "flex",
        gap: 11,
        alignItems: "center",
        boxShadow: flag
          ? `0 0 0 1px ${flag}, 0 8px 24px ${flag}22`
          : "0 6px 18px rgba(0,0,0,0.45)",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: theme.textFaint, width: 7, height: 7 }} />

      <div
        style={{
          flexShrink: 0,
          width: 38,
          height: 38,
          borderRadius: 10,
          background: `${meta.color}22`,
          border: `1px solid ${meta.color}44`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CategoryIcon category={data.category} color={meta.color} />
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 9,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: meta.color,
            fontWeight: 600,
          }}
        >
          {meta.label}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginTop: 2, lineHeight: 1.25 }}>
          {data.label}
        </div>
        <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
          {data.nodeType}
        </div>
      </div>

      {flag && (
        <span
          style={{
            position: "absolute",
            top: -8,
            right: 10,
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: "#08080c",
            background: flag,
            borderRadius: 5,
            padding: "2px 6px",
            boxShadow: `0 2px 8px ${flag}55`,
          }}
        >
          {data.flagged}
        </span>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: theme.textFaint, width: 7, height: 7 }} />
    </div>
  );
}
