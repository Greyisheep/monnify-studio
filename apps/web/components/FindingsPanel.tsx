// Architecture review sidebar (#4, #38): severity counts and one card per
// finding. The fuller panel is #27; this is the canvas-side summary.

import { SEVERITY_COLOR, theme } from "@/lib/theme";
import type { Finding, Report, Severity } from "@/lib/types";

function counts(findings: Finding[]) {
  const c: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) c[f.severity] = (c[f.severity] ?? 0) + 1;
  return c;
}

export function FindingsPanel({ report }: { report: Report | null }) {
  const findings = report?.findings ?? [];
  const c = counts(findings);

  return (
    <aside
      style={{
        width: 350,
        flexShrink: 0,
        background: theme.panel,
        borderLeft: `1px solid ${theme.panelBorder}`,
        padding: 18,
        overflowY: "auto",
        color: theme.text,
      }}
    >
      <h2 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2, color: theme.textDim, margin: 0 }}>
        Architecture Review
      </h2>
      <div style={{ display: "flex", gap: 8, margin: "12px 0 18px" }}>
        {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              textAlign: "center",
              background: theme.card,
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: theme.radiusSm,
              padding: "10px 0",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: (c[s] ?? 0) > 0 ? SEVERITY_COLOR[s] : theme.textFaint }}>
              {c[s] ?? 0}
            </div>
            <div style={{ fontSize: 9, textTransform: "uppercase", color: theme.textFaint, marginTop: 2 }}>{s}</div>
          </div>
        ))}
      </div>

      {findings.length === 0 ? (
        <div
          style={{
            border: "1px solid #14532d",
            background: "rgba(34, 197, 94, 0.08)",
            borderRadius: theme.radiusSm,
            padding: 14,
            color: "#86efac",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          No architectural findings. This design is safe to ship.
        </div>
      ) : (
        findings.map((f) => (
          <div
            key={f.rule_id + f.node_ids.join()}
            style={{
              border: `1px solid ${theme.cardBorder}`,
              borderLeft: `3px solid ${SEVERITY_COLOR[f.severity]}`,
              borderRadius: theme.radiusSm,
              padding: 13,
              marginBottom: 10,
              background: theme.card,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "ui-monospace, monospace", color: theme.text }}>
                {f.rule_id}
              </span>
              <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", color: SEVERITY_COLOR[f.severity] }}>
                {f.severity}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 5 }}>{f.title}</div>
            <div style={{ fontSize: 12, color: theme.textDim, marginTop: 4, lineHeight: 1.45 }}>{f.message}</div>
            <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 7, lineHeight: 1.4 }}>
              <span style={{ color: "#2fd28a", fontWeight: 600 }}>fix:</span> {f.remediation}
            </div>
          </div>
        ))
      )}
    </aside>
  );
}
