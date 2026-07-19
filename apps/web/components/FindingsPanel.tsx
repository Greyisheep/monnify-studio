// Architecture review sidebar: severity counts and one card per finding (#4).
// The full-featured panel is #27 (frontend); this is the canvas-side summary.

import type { Finding, Report, Severity } from "@/lib/types";

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#94a3b8",
};

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
        width: 340,
        flexShrink: 0,
        background: "#0b1120",
        borderLeft: "1px solid #1e293b",
        padding: 16,
        overflowY: "auto",
        color: "#e2e8f0",
      }}
    >
      <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8" }}>
        Architecture Review
      </h2>
      <div style={{ display: "flex", gap: 8, margin: "10px 0 18px" }}>
        {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              textAlign: "center",
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 8,
              padding: "8px 0",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: SEVERITY_COLOR[s] }}>{c[s] ?? 0}</div>
            <div style={{ fontSize: 9, textTransform: "uppercase", color: "#64748b" }}>{s}</div>
          </div>
        ))}
      </div>

      {findings.length === 0 ? (
        <div
          style={{
            border: "1px solid #14532d",
            background: "#052e16",
            borderRadius: 8,
            padding: 14,
            color: "#86efac",
            fontSize: 13,
          }}
        >
          No architectural findings. This design is safe to ship.
        </div>
      ) : (
        findings.map((f) => (
          <div
            key={f.rule_id + f.node_ids.join()}
            style={{
              border: "1px solid #1e293b",
              borderLeft: `3px solid ${SEVERITY_COLOR[f.severity]}`,
              borderRadius: 8,
              padding: 12,
              marginBottom: 10,
              background: "#0f172a",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>{f.rule_id}</span>
              <span style={{ fontSize: 9, textTransform: "uppercase", color: SEVERITY_COLOR[f.severity] }}>
                {f.severity}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{f.title}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, lineHeight: 1.4 }}>{f.message}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
              <span style={{ color: "#22c55e" }}>fix:</span> {f.remediation}
            </div>
          </div>
        ))
      )}
    </aside>
  );
}
