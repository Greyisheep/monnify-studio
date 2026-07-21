/**
 * Canvas node chrome — "Hover Card" (Figma 210:6660/210:6379/210:6396,
 * cross-checked against jj9fKZ…/112:5282 for exact header/subtitle layout).
 * Provider pill (outline button, Monnify logo) + icon chip + ellipsis menu +
 * bold title + 2-line subtitle (catalog title + mono endpoint id); expands
 * on selection into "Edit triggers" fields; green border when joined to
 * another node via a valid connection.
 * Run I/O pills (#151). Why? explain affordance lives in RightSidebar (#76).
 * Provenance: #4, #44, #76, #151, D14, runs/canvas-node-hover-card-2026-07-21.
 */
"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  Handle,
  Position,
  useNodeConnections,
  useReactFlow,
  type Node as FlowNode,
  type NodeProps,
} from "@xyflow/react";

import type { StudioNodeData } from "@/types";

export type StudioFlowNode = FlowNode<StudioNodeData, "studio">;

const CATEGORY_CLASS: Record<string, string> = {
  monnify: "cat-monnify",
  event: "cat-event",
  control: "cat-control",
  safety: "cat-safety",
  application: "cat-application",
};

function fieldLabel(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fieldValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function MenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="3" r="1.3" fill="#737373" />
      <circle cx="8" cy="8" r="1.3" fill="#737373" />
      <circle cx="8" cy="13" r="1.3" fill="#737373" />
    </svg>
  );
}

/**
 * Category glyphs (Figma exports icon-per-nodeType, e.g. "Icon / users" for
 * bank-account validation, "Icon / receipt" for payment nodes - node-id
 * 2003:6122/2003:6128 on jj9fKZ…/112:5282). We don't have a per-type icon
 * asset library, so this maps at the category level instead - still real,
 * still scannable, not a fabricated one-size-fits-all glyph.
 */
function CategoryGlyph({ category, nodeType }: { category: string; nodeType: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none" } as const;
  if (nodeType === "custom.code") {
    return (
      <svg {...common} aria-hidden>
        <path d="m5.8 4-3 4 3 4M10.2 4l3 4-3 4M9.2 2.8 6.8 13.2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  switch (category) {
    case "safety":
      return (
        <svg {...common} aria-hidden>
          <circle cx="6" cy="5.2" r="2.1" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M2 13.2c0-2.3 1.8-4.1 4-4.1s4 1.8 4 4.1"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <path
            d="M10.1 4.4a2 2 0 0 1 0 3.8"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M11 9.3c1.7.4 2.9 1.8 2.9 3.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "monnify":
      return (
        <svg {...common} aria-hidden>
          <rect x="3" y="2.5" width="10" height="11" rx="1.3" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 6h6M5 8.3h6M5 10.6h3.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case "event":
      return (
        <svg {...common} aria-hidden>
          <path
            d="M8.6 2 4.2 9h3.1L6.9 14 12 6.7H8.9L8.6 2Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "control":
      return (
        <svg {...common} aria-hidden>
          <path d="M3 5h10M3 8h10M3 11h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="6.2" cy="5" r="1.1" fill="currentColor" />
          <circle cx="10.2" cy="8" r="1.1" fill="currentColor" />
          <circle cx="7.2" cy="11" r="1.1" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg {...common} aria-hidden>
          <rect x="2.5" y="2.5" width="4.6" height="4.6" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="8.9" y="2.5" width="4.6" height="4.6" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="2.5" y="8.9" width="4.6" height="4.6" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="8.9" y="8.9" width="4.6" height="4.6" rx="1" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
  }
}

export function StudioNode({ id, data, selected }: NodeProps<StudioFlowNode>) {
  const categoryClass = CATEGORY_CLASS[data.category] ?? "cat-application";
  const runIo = data.runIo;
  const { getNode, addNodes, deleteElements } = useReactFlow();
  const connections = useNodeConnections({ id });
  const isJoined = connections.length > 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [menuOpen]);

  function handleDuplicate() {
    setMenuOpen(false);
    const current = getNode(id);
    if (!current) return;
    addNodes({
      ...current,
      id: `${id}-copy-${Date.now().toString(36)}`,
      position: { x: current.position.x + 32, y: current.position.y + 32 },
      selected: false,
    });
  }

  function handleDelete() {
    setMenuOpen(false);
    void deleteElements({ nodes: [{ id }] });
  }

  // Prefer the node type's declared input schema (always present for a real
  // catalog node) so the card actually expands with fields on click, the way
  // the Figma mock always shows "Edit triggers" rows - falling back to raw
  // saved config keys only for node types with no declared inputs.
  const config = data.config ?? {};
  const configEntries: [string, unknown][] =
    data.inputs && data.inputs.length > 0
      ? data.inputs.map((port) => [port.name, config[port.name]])
      : Object.entries(config);
  const runState = runIo?.status ?? (runIo?.failed ? "failed" : runIo ? "completed" : null);

  return (
    <div
      className={`studio-node ${categoryClass}${selected ? " is-selected is-expanded" : ""}${
        isJoined ? " is-joined" : ""
      }${runState ? ` is-run-${runState}` : ""}`}
    >
      <Handle type="target" position={Position.Left} className="studio-handle" />

      <div className="studio-node__content">
        <div className="studio-node__header">
          <div className="studio-node__header-left">
            <span className="studio-node__provider">
              <span className="studio-node__provider-logo" aria-hidden>
                <Image src="/figma/monnify-logo.svg" alt="" width={12} height={7} unoptimized />
              </span>
              Monnify
            </span>
            <span className="studio-node__icon-chip" aria-hidden>
              <CategoryGlyph category={data.category} nodeType={data.nodeType} />
            </span>
          </div>
          <div className="studio-node__menu" ref={menuRef}>
            <button
              type="button"
              className="studio-node__menu-trigger"
              aria-label="Node actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((open) => !open);
              }}
            >
              <MenuIcon />
            </button>
            {menuOpen ? (
              <div className="studio-node__menu-list" role="menu">
                <button type="button" role="menuitem" onClick={handleDuplicate}>
                  Duplicate
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={handleDelete}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <strong className="studio-node__label">{data.label}</strong>
        <div className="studio-node__subtitle">
          {data.title ? (
            <span className="studio-node__title-sub">{data.title}</span>
          ) : null}
          <span className="studio-node__type">{data.nodeType}</span>
        </div>
      </div>

      {runIo ? (
        <p
          className={`studio-node__io is-${runState ?? "completed"}`}
          title={`${runIo.inputsSummary} → ${runIo.outputsSummary}`}
        >
          {runState === "running" || runState === "waiting" ? (
            <span className="studio-node__io-status">{runState}</span>
          ) : null}
          <span className="studio-node__io-in">{runIo.inputsSummary}</span>
          <span className="studio-node__io-arrow" aria-hidden>
            →
          </span>
          <span className="studio-node__io-out">{runIo.outputsSummary}</span>
        </p>
      ) : null}

      {selected && configEntries.length > 0 ? (
        <>
          <div className="studio-node__divider" />
          <div className="studio-node__triggers">
            <span className="studio-node__triggers-label">Edit triggers</span>
            {configEntries.map(([key, value]) => (
              <label key={key} className="studio-node__field">
                <span className="studio-node__field-label">{fieldLabel(key)}</span>
                <input
                  className="studio-node__field-input"
                  value={fieldValue(value)}
                  placeholder="Not set"
                  readOnly
                  onClick={(event) => event.stopPropagation()}
                />
              </label>
            ))}
          </div>
        </>
      ) : null}

      <Handle type="source" position={Position.Right} className="studio-handle" />
    </div>
  );
}
