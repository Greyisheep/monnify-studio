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

  const configEntries = data.config ? Object.entries(data.config) : [];

  return (
    <div
      className={`studio-node ${categoryClass}${selected ? " is-selected is-expanded" : ""}${
        isJoined ? " is-joined" : ""
      }${runIo?.failed ? " is-run-failed" : runIo ? " is-run-done" : ""}`}
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
              <Image
                src="/figma/icon-catalog-node.svg"
                alt=""
                width={16}
                height={16}
                unoptimized
                className="studio-node__icon-glyph"
              />
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
          className={`studio-node__io${runIo.failed ? " is-failed" : ""}`}
          title={`${runIo.inputsSummary} → ${runIo.outputsSummary}`}
        >
          <span className="studio-node__io-in">{runIo.inputsSummary}</span>
          <span className="studio-node__io-arrow" aria-hidden>
            →
          </span>
          <span className="studio-node__io-out">{runIo.outputsSummary}</span>
        </p>
      ) : null}

      {selected && configEntries.length > 0 ? (
        <div className="studio-node__triggers">
          <div className="studio-node__divider" />
          <span className="studio-node__triggers-label">Edit triggers</span>
          {configEntries.map(([key, value]) => (
            <label key={key} className="studio-node__field">
              <span className="studio-node__field-label">{fieldLabel(key)}</span>
              <input
                className="studio-node__field-input"
                value={fieldValue(value)}
                readOnly
                onClick={(event) => event.stopPropagation()}
              />
            </label>
          ))}
        </div>
      ) : null}

      <Handle type="source" position={Position.Right} className="studio-handle" />
    </div>
  );
}
