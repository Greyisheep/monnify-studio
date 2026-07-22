/**
 * Node config overlay (business fields + advanced JSON). Provenance: #4, #44.
 */
"use client";

import { useEffect, useState, type ChangeEvent } from "react";

import type { Finding, IrNode, NodeMeta } from "@/types";

export interface ConfigPanelProps {
  node: IrNode | null;
  meta: NodeMeta | undefined;
  selectedFinding: Finding | null;
  findings?: Finding[];
  onChange: (node: IrNode) => void;
  onClose: () => void;
}

function normalizeIrNode(parsed: Partial<IrNode>, fallback: IrNode): IrNode {
  if (!parsed.type || typeof parsed.type !== "string") {
    throw new Error("Node JSON needs a string type");
  }
  const id =
    typeof parsed.id === "string" && parsed.id.trim()
      ? parsed.id.trim()
      : fallback.id;
  return {
    id,
    type: parsed.type,
    label: parsed.label ?? fallback.label ?? null,
    config:
      parsed.config && typeof parsed.config === "object" ? parsed.config : {},
    inputs:
      parsed.inputs && typeof parsed.inputs === "object" ? parsed.inputs : {},
    extra_tags: Array.isArray(parsed.extra_tags) ? parsed.extra_tags : [],
    position: {
      x: Number(parsed.position?.x ?? fallback.position.x),
      y: Number(parsed.position?.y ?? fallback.position.y),
    },
  };
}

export function ConfigPanel({
  node,
  meta,
  selectedFinding,
  findings = [],
  onChange,
  onClose,
}: ConfigPanelProps) {
  const [mode, setMode] = useState<"business" | "request" | "json">("business");
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSaved, setJsonSaved] = useState(false);
  // The editable fields live under request_template.body (Monnify's real request
  // shape, #176). Fall back to a flat template for older shapes.
  function templateBody(): Record<string, unknown> {
    const tpl = meta?.request_template ?? {};
    const body = tpl.body;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tpl)) {
      if (key !== "method" && key !== "path" && key !== "body") rest[key] = value;
    }
    return rest;
  }

  const hasRequestTemplate = Object.keys(templateBody()).length > 0;

  // Source of truth is FLAT node.config: execution and codegen both read
  // node.config[key] directly (never a nested request_body), so edits must land
  // there to actually reach the run and the generated code.
  function requestBody(): Record<string, unknown> {
    const body = templateBody();
    const cfg = (node?.config ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, example] of Object.entries(body)) {
      out[key] = key in cfg ? cfg[key] : example;
    }
    return out;
  }

  function requestBodyDraft() {
    return JSON.stringify(requestBody(), null, 2);
  }

  function updateRequestField(key: string, value: unknown) {
    if (!node) return;
    onChange({ ...node, config: { ...node.config, [key]: value } });
  }

  // The Employee List / sheet (app.data_rows): a table of people the flow pays.
  type SheetRow = Record<string, string>;
  function sheetRows(): SheetRow[] {
    const rows = node?.config?.rows;
    return Array.isArray(rows) ? (rows as SheetRow[]) : [];
  }
  function writeRows(rows: SheetRow[]) {
    if (!node) return;
    onChange({ ...node, config: { ...node.config, rows } });
  }
  function updateRowCell(index: number, key: string, value: string) {
    const rows = sheetRows().map((r) => ({ ...r }));
    if (!rows[index]) return;
    rows[index][key] = value;
    writeRows(rows);
  }
  function addRow() {
    writeRows([
      ...sheetRows(),
      { name: "", phone: "", account_number: "", bank_code: "", amount: "" },
    ]);
  }
  function removeRow(index: number) {
    writeRows(sheetRows().filter((_, i) => i !== index));
  }

  // Scheduled trigger (event.scheduled): let the dev pick when it runs.
  function sched(key: string): string {
    const v = node?.config?.[key];
    return typeof v === "string" ? v : "";
  }
  function setSched(key: string, value: string) {
    if (!node) return;
    onChange({ ...node, config: { ...node.config, [key]: value } });
  }
  function scheduleSummary(): string {
    const cadence = sched("cadence") || "monthly";
    const at = sched("at") || "09:00";
    if (cadence === "daily") return `Every day at ${at}.`;
    if (cadence === "weekly")
      return `Every ${sched("weekday") || "Monday"} at ${at}.`;
    return `On day ${sched("day") || "1"} of each month at ${at}.`;
  }

  function updateDeclaredOutput(
    previousKey: string | null,
    key: string,
    value: string,
  ) {
    if (!node || !key.trim()) return;
    const outputs = {
      ...((node.config?.outputs as Record<string, unknown> | undefined) ?? {}),
    };
    if (previousKey && previousKey !== key) delete outputs[previousKey];
    outputs[key] = value;
    onChange({ ...node, config: { ...node.config, outputs } });
  }

  function removeDeclaredOutput(key: string) {
    if (!node) return;
    const outputs = {
      ...((node.config?.outputs as Record<string, unknown> | undefined) ?? {}),
    };
    delete outputs[key];
    onChange({ ...node, config: { ...node.config, outputs } });
  }

  function addDeclaredOutput() {
    const outputs = (node?.config?.outputs as Record<string, unknown> | undefined) ?? {};
    let index = 1;
    let key = "result";
    while (key in outputs) {
      index += 1;
      key = `result_${index}`;
    }
    updateDeclaredOutput(null, key, "");
  }

  useEffect(() => {
    setMode("business");
    setJsonError(null);
    setJsonSaved(false);
  }, [node?.id]);

  if (!node) {
    return (
      <aside className="studio-config">
        <div className="studio-config__head">
          <h2>Node config</h2>
          <p>Select a node on the canvas</p>
        </div>
        {selectedFinding && (
          <div className="studio-explain">
            <h3>Why this finding?</h3>
            <p>{selectedFinding.explanation}</p>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="studio-config">
      <div className="studio-config__head">
        <div>
          <h2>{node.label || meta?.title || node.type}</h2>
          <p>
            {meta?.category ?? "node"} · {node.type}
          </p>
        </div>
        <button type="button" className="ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="studio-switch studio-switch--compact" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "business"}
          className={mode === "business" ? "is-active" : ""}
          onClick={() => {
            setMode("business");
            setJsonSaved(false);
          }}
        >
          Business
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "json"}
          className={mode === "json" ? "is-active" : ""}
          onClick={() => {
            setJsonDraft(JSON.stringify(node, null, 2));
            setJsonError(null);
            setJsonSaved(false);
            setMode("json");
          }}
        >
          Advanced JSON
        </button>
        {hasRequestTemplate ? (
          <button
            type="button"
            role="tab"
            aria-selected={mode === "request"}
            className={mode === "request" ? "is-active" : ""}
            onClick={() => {
              setJsonDraft(requestBodyDraft());
              setJsonError(null);
              setJsonSaved(false);
              setMode("request");
            }}
          >
            Request body
          </button>
        ) : null}
      </div>

      {mode === "business" ? (
        <div className="studio-config__body">
          <label>
            Label
            <input
              value={node.label ?? ""}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onChange({ ...node, label: event.target.value })
              }
            />
          </label>
          <label>
            Type
            <input value={node.type} readOnly />
          </label>
          {node.type === "custom.code" ? (
            <>
              <label>
                Your code
                <textarea
                  className="studio-code-block-editor"
                  value={String(node.config?.code ?? "")}
                  spellCheck={false}
                  rows={12}
                  placeholder={"# Runs between Monnify steps in generated Python\n"}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    onChange({
                      ...node,
                      config: { ...node.config, code: event.target.value },
                    })
                  }
                />
              </label>
              <div className="studio-code-block__outputs">
                <div>
                  <h4>Declared outputs</h4>
                  <p className="muted">
                    Name the values this block exposes to later steps.
                  </p>
                </div>
                {Object.entries(
                  (node.config?.outputs as Record<string, unknown> | undefined) ?? {},
                ).map(([key, value]) => (
                  <div className="studio-code-block__output" key={key}>
                    <input
                      aria-label="Output name"
                      defaultValue={key}
                      onBlur={(event) =>
                        updateDeclaredOutput(key, event.target.value, String(value))
                      }
                    />
                    <input
                      aria-label={`Value for ${key}`}
                      value={String(value)}
                      onChange={(event) =>
                        updateDeclaredOutput(key, key, event.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="ghost-btn"
                      aria-label={`Remove ${key}`}
                      onClick={() => removeDeclaredOutput(key)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={addDeclaredOutput}
                >
                  Add output
                </button>
              </div>
            </>
          ) : null}
          {node.type === "app.data_rows" ? (
            <div className="studio-sheet">
              <div className="studio-sheet__head">
                <h4>Employee list</h4>
                <p className="muted">
                  Add the people this flow pays. A Run pays and (if a notify
                  block is wired) messages each one.
                </p>
              </div>
              {sheetRows().length > 0 ? (
                <div className="studio-sheet__grid" role="table">
                  <div className="studio-sheet__row studio-sheet__row--header" role="row">
                    <span>Name</span>
                    <span>WhatsApp</span>
                    <span>Account no.</span>
                    <span>Bank code</span>
                    <span>Amount (₦)</span>
                    <span aria-hidden />
                  </div>
                  {sheetRows().map((row, index) => (
                    <div className="studio-sheet__row" role="row" key={index}>
                      <input
                        aria-label={`Name ${index + 1}`}
                        placeholder="Ada Obi"
                        value={row.name ?? ""}
                        onChange={(e) => updateRowCell(index, "name", e.target.value)}
                      />
                      <input
                        aria-label={`WhatsApp ${index + 1}`}
                        placeholder="0803…"
                        value={row.phone ?? ""}
                        onChange={(e) => updateRowCell(index, "phone", e.target.value)}
                      />
                      <input
                        aria-label={`Account number ${index + 1}`}
                        placeholder="0123456789"
                        value={row.account_number ?? ""}
                        onChange={(e) =>
                          updateRowCell(index, "account_number", e.target.value)
                        }
                      />
                      <input
                        aria-label={`Bank code ${index + 1}`}
                        placeholder="058"
                        value={row.bank_code ?? ""}
                        onChange={(e) => updateRowCell(index, "bank_code", e.target.value)}
                      />
                      <input
                        aria-label={`Amount ${index + 1}`}
                        inputMode="decimal"
                        placeholder="150000"
                        value={row.amount ?? ""}
                        onChange={(e) => updateRowCell(index, "amount", e.target.value)}
                      />
                      <button
                        type="button"
                        className="ghost-btn"
                        aria-label={`Remove row ${index + 1}`}
                        onClick={() => removeRow(index)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted studio-sheet__empty">
                  No employees yet. Add your first row below.
                </p>
              )}
              <button type="button" className="ghost-btn" onClick={addRow}>
                + Add employee
              </button>
            </div>
          ) : null}
          {node.type === "event.scheduled" ? (
            <div className="studio-schedule">
              <h4>Schedule</h4>
              <label>
                Runs
                <select
                  value={sched("cadence") || "monthly"}
                  onChange={(e) => setSched("cadence", e.target.value)}
                >
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </select>
              </label>
              {sched("cadence") === "weekly" ? (
                <label>
                  On
                  <select
                    value={sched("weekday") || "Monday"}
                    onChange={(e) => setSched("weekday", e.target.value)}
                  >
                    {[
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {(sched("cadence") || "monthly") === "monthly" ? (
                <label>
                  Day of month
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={sched("day") || "1"}
                    onChange={(e) => setSched("day", e.target.value)}
                  />
                </label>
              ) : null}
              <label>
                Time
                <input
                  type="time"
                  value={sched("at") || "09:00"}
                  onChange={(e) => setSched("at", e.target.value)}
                />
              </label>
              <p className="muted">{scheduleSummary()}</p>
            </div>
          ) : null}
          {meta?.description && <p className="muted">{meta.description}</p>}
          {(meta?.inputs?.length ?? 0) > 0 && (
            <div className="port-list">
              <h4>Inputs</h4>
              {meta!.inputs!.map((port) => (
                <code key={port.name}>
                  {port.name}: {port.type}
                </code>
              ))}
            </div>
          )}
          {(meta?.outputs?.length ?? 0) > 0 && (
            <div className="port-list">
              <h4>Outputs</h4>
              {meta!.outputs!.map((port) => (
                <code key={port.name}>
                  {port.name}: {port.type}
                </code>
              ))}
            </div>
          )}
        </div>
      ) : mode === "request" ? (
        <div className="studio-config__body">
          <div className="studio-request__context">
            <code>
              {meta?.method} {meta?.path}
            </code>
            {meta?.when_to_use ? <p>{meta.when_to_use}</p> : null}
            {meta?.doc_url ? (
              <a href={meta.doc_url} target="_blank" rel="noreferrer">
                Read Monnify docs
              </a>
            ) : null}
          </div>
          <div className="studio-request__fields">
            {Object.entries(requestBody()).flatMap(([key, value]) => {
              if (
                typeof value !== "string" &&
                typeof value !== "number" &&
                typeof value !== "boolean"
              ) {
                return [];
              }
              return (
                <label key={key}>
                  {key}
                  {typeof value === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(event) =>
                        updateRequestField(key, event.target.checked)
                      }
                    />
                  ) : (
                    <input
                      type={typeof value === "number" ? "number" : "text"}
                      value={String(value)}
                      onChange={(event) =>
                        updateRequestField(
                          key,
                          typeof value === "number"
                            ? Number(event.target.value)
                            : event.target.value,
                        )
                      }
                    />
                  )}
                </label>
              );
            })}
          </div>
          <p className="muted">Advanced JSON request body</p>
          <textarea
            className="json-editor"
            value={jsonDraft}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              setJsonDraft(event.target.value);
              setJsonSaved(false);
            }}
            spellCheck={false}
          />
          {jsonError && <p className="type-error">{jsonError}</p>}
          {jsonSaved && !jsonError && (
            <p className="muted">Request body applied to this node.</p>
          )}
          <button
            type="button"
            className="primary-btn studio-config__apply"
            onClick={() => {
              try {
                const parsed = JSON.parse(jsonDraft) as unknown;
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                  throw new Error("Request body must be a JSON object");
                }
                onChange({
                  ...node,
                  config: {
                    ...node.config,
                    ...(parsed as Record<string, unknown>),
                  },
                });
                setJsonDraft(JSON.stringify(parsed, null, 2));
                setJsonError(null);
                setJsonSaved(true);
              } catch (error) {
                setJsonSaved(false);
                setJsonError(
                  error instanceof Error ? error.message : "Invalid JSON",
                );
              }
            }}
          >
            Apply request body
          </button>
          <div className="studio-request__guardrail">
            <h3>Safety review</h3>
            {findings.length > 0 ? (
              <ul>
                {findings.map((finding, index) => (
                  <li key={`${finding.rule_id}-${index}`}>
                    <strong>[{finding.rule_id}]</strong> {finding.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No architectural findings. Ship it.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="studio-config__body">
          <textarea
            className="json-editor"
            value={jsonDraft}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              setJsonDraft(event.target.value);
              setJsonSaved(false);
            }}
            spellCheck={false}
          />
          {jsonError && <p className="type-error">{jsonError}</p>}
          {jsonSaved && !jsonError && (
            <p className="muted">JSON applied to this node.</p>
          )}
          <button
            type="button"
            className="primary-btn studio-config__apply"
            onClick={() => {
              try {
                const parsed = JSON.parse(jsonDraft) as Partial<IrNode>;
                const normalized = normalizeIrNode(parsed, node);
                onChange(normalized);
                setJsonDraft(JSON.stringify(normalized, null, 2));
                setJsonError(null);
                setJsonSaved(true);
              } catch (error) {
                setJsonSaved(false);
                setJsonError(
                  error instanceof Error ? error.message : "Invalid JSON",
                );
              }
            }}
          >
            Apply JSON
          </button>
        </div>
      )}

      {selectedFinding && (
        <div className="studio-explain">
          <h3>[{selectedFinding.rule_id}] Explain</h3>
          <p>{selectedFinding.explanation}</p>
        </div>
      )}
    </aside>
  );
}
