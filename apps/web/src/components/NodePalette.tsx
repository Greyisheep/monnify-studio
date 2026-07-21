/**
 * Left API catalog sidebar matched to Figma Main (21:1670).
 * Panel icon collapses into Maincollapsed floating chrome (21:1732).
 * Icons: exact Figma exports.
 */
"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  applyStoredOrder,
  insertionIndexFor,
  loadPaletteOrder,
  moveWithinList,
  savePaletteOrder,
  type PaletteOrder,
} from "@/lib/paletteOrder";
import {
  isDragDropTipDismissed,
  persistDragDropTipDismissed,
  writeDragNodeType,
} from "@/lib/studioDnd";
import type { IntentResult, MoniAskResult, NodeMeta } from "@/types";
import { ChatPanel } from "./ChatPanel";

export interface NodePaletteProps {
  catalog: Record<string, NodeMeta>;
  workflowName: string;
  teamLabel: string;
  leftTab: "api" | "chat";
  collapsed: boolean;
  busy?: boolean;
  onLeftTabChange: (tab: "api" | "chat") => void;
  onToggleCollapsed: () => void;
  onAdd: (typeKey: string) => void;
  onAsk: (
    message: string,
    onStatus?: (text: string) => void,
  ) => Promise<MoniAskResult>;
  onRefine: (
    message: string,
    onStatus?: (text: string) => void,
  ) => Promise<MoniAskResult>;
  hasOpenWorkflow: boolean;
  onSetupIntent: (
    templateId: string,
    config: IntentResult["config"],
  ) => Promise<void>;
  onResizeStart?: (event: ReactPointerEvent) => void;
}

function GripIcon() {
  return (
    <span className="studio-sidebar__grip" aria-hidden>
      <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
        <circle cx="4" cy="3" r="1.25" fill="#A3A3A3" />
        <circle cx="8" cy="3" r="1.25" fill="#A3A3A3" />
        <circle cx="4" cy="8" r="1.25" fill="#A3A3A3" />
        <circle cx="8" cy="8" r="1.25" fill="#A3A3A3" />
        <circle cx="4" cy="13" r="1.25" fill="#A3A3A3" />
        <circle cx="8" cy="13" r="1.25" fill="#A3A3A3" />
      </svg>
    </span>
  );
}

const CATEGORY_ORDER = [
  "Accept Payments",
  "Transfer/Payouts",
  "Wallets",
  "Customer Verification",
  "Bills & Payments",
  "Events",
  "Control",
  "Application",
];

function displayCategory(meta: NodeMeta): string {
  const hay = `${meta.type} ${meta.title}`.toLowerCase();
  if (
    hay.includes("bvn") ||
    hay.includes("nin") ||
    hay.includes("name enquiry") ||
    hay.includes("validate bank")
  ) {
    return "Customer Verification";
  }
  if (
    hay.includes("transfer") ||
    hay.includes("disbursement") ||
    hay.includes("paycode") ||
    hay.includes("refund") ||
    hay.includes("payout")
  ) {
    return "Transfer/Payouts";
  }
  if (hay.includes("wallet")) return "Wallets";
  if (hay.includes("bill")) return "Bills & Payments";
  if (meta.category === "monnify") return "Accept Payments";
  if (meta.category === "safety") return "Customer Verification";
  if (meta.category === "event") return "Events";
  if (meta.category === "control") return "Control";
  if (meta.category === "application") return "Application";
  return meta.category || "Application";
}

function isFeatured(meta: NodeMeta): boolean {
  return meta.title.toLowerCase().includes("invoice");
}

function groupCatalog(catalog: Record<string, NodeMeta>) {
  const groups = new Map<string, NodeMeta[]>();
  for (const meta of Object.values(catalog)) {
    const category = displayCategory(meta);
    const list = groups.get(category) ?? [];
    list.push(meta);
    groups.set(category, list);
  }
  for (const list of groups.values()) {
    list.sort((left, right) => left.title.localeCompare(right.title));
  }
  return [...groups.entries()].sort(([left], [right]) => {
    const leftRank = CATEGORY_ORDER.indexOf(left);
    const rightRank = CATEGORY_ORDER.indexOf(right);
    const leftScore = leftRank === -1 ? 999 : leftRank;
    const rightScore = rightRank === -1 ? 999 : rightRank;
    if (leftScore !== rightScore) return leftScore - rightScore;
    return left.localeCompare(right);
  });
}

export function NodePalette({
  catalog,
  workflowName,
  teamLabel,
  leftTab,
  collapsed,
  busy = false,
  onLeftTabChange,
  onToggleCollapsed,
  onAdd,
  onAsk,
  onRefine,
  hasOpenWorkflow,
  onSetupIntent,
  onResizeStart,
}: NodePaletteProps) {
  const draggedRef = useRef(false);
  const [showTip, setShowTip] = useState(false);
  const [order, setOrder] = useState<PaletteOrder>(() => loadPaletteOrder());
  const [dragRow, setDragRow] = useState<{ category: string; fromIndex: number } | null>(
    null,
  );
  const [dropAt, setDropAt] = useState<{ category: string; index: number } | null>(null);

  const groups = groupCatalog(catalog).map(
    ([category, items]) =>
      [category, applyStoredOrder(items, order[category], (item) => item.type)] as const,
  );

  useEffect(() => {
    if (collapsed || leftTab !== "api") {
      setShowTip(false);
      return;
    }
    if (isDragDropTipDismissed()) {
      setShowTip(false);
      return;
    }
    setShowTip(groups.length > 0);
  }, [leftTab, collapsed, groups.length]);

  if (collapsed) {
    return null;
  }

  function dismissTip() {
    persistDragDropTipDismissed();
    setShowTip(false);
  }

  function onRowDragStart(
    event: ReactDragEvent,
    typeKey: string,
    category: string,
    fromIndex: number,
  ) {
    draggedRef.current = true;
    writeDragNodeType(event.dataTransfer, typeKey);
    setDragRow({ category, fromIndex });
    dismissTip();
  }

  function onRowDragEnd() {
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
    setDragRow(null);
    setDropAt(null);
  }

  function onRowDragOver(event: ReactDragEvent, category: string, hoverIndex: number) {
    if (!dragRow || dragRow.category !== category) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
    setDropAt({ category, index: insertionIndexFor(hoverIndex, fraction) });
  }

  function onRowDrop(
    event: ReactDragEvent,
    category: string,
    items: readonly NodeMeta[],
  ) {
    if (!dragRow || dragRow.category !== category || !dropAt || dropAt.category !== category) {
      return;
    }
    event.preventDefault();
    const reordered = moveWithinList(items, dragRow.fromIndex, dropAt.index);
    const nextOrder: PaletteOrder = {
      ...order,
      [category]: reordered.map((item) => item.type),
    };
    setOrder(nextOrder);
    savePaletteOrder(nextOrder);
    setDragRow(null);
    setDropAt(null);
  }

  function onRowClick(typeKey: string) {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onAdd(typeKey);
  }

  return (
    <aside className="studio-sidebar studio-sidebar--left" aria-label="API catalog">
      <div
        className="studio-sidebar__resize studio-sidebar__resize--east"
        onPointerDown={onResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize left sidebar"
      />
      <div className="studio-sidebar__brand">
        <div className="studio-sidebar__brand-main">
          <div>
            <strong>{workflowName || "Workflow 1"}</strong>
            <span>{teamLabel}</span>
          </div>
        </div>
        <button
          type="button"
          className="studio-sidebar__collapse"
          onClick={onToggleCollapsed}
          title="Collapse panels"
          aria-label="Collapse panels"
        >
          <Image
            src="/figma/icon-panel-collapse.svg"
            alt=""
            width={16}
            height={16}
            unoptimized
            className="studio-sidebar__icon"
          />
        </button>
      </div>

      <div className="studio-tabs" role="tablist" aria-label="Left panel" data-tour="dev-chat">
        <button
          type="button"
          role="tab"
          aria-selected={leftTab === "api"}
          className={leftTab === "api" ? "is-active" : ""}
          onClick={() => onLeftTabChange("api")}
        >
          API
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={leftTab === "chat"}
          className={leftTab === "chat" ? "is-active" : ""}
          onClick={() => onLeftTabChange("chat")}
        >
          Chat
        </button>
      </div>

      <div
        className={`studio-sidebar__scroll${leftTab === "chat" ? " is-chat" : ""}`}
        data-tour={leftTab === "api" ? "dev-catalog" : undefined}
      >
        {leftTab === "chat" ? (
          <ChatPanel
            busy={busy}
            hasOpenWorkflow={hasOpenWorkflow}
            onAsk={onAsk}
            onRefine={onRefine}
            onSetupIntent={onSetupIntent}
          />
        ) : (
          <>
            {groups.length === 0 && (
              <p className="studio-sidebar__empty">Catalog loading…</p>
            )}
            {groups.map(([category, items]) => (
              <section key={category} className="studio-sidebar__group">
                <h3>{category}</h3>
                <ul>
                  {items.map((item, itemIndex) => {
                    const featured = isFeatured(item);
                    const tipAnchor =
                      showTip && category === groups[0]?.[0] && itemIndex === 0;
                    const isDragSource =
                      dragRow?.category === category && dragRow.fromIndex === itemIndex;
                    const dropBefore = dropAt?.category === category && dropAt.index === itemIndex;
                    const dropAfter =
                      itemIndex === items.length - 1 &&
                      dropAt?.category === category &&
                      dropAt.index === items.length;
                    const rowClassName = [
                      "studio-sidebar__row",
                      tipAnchor ? "is-dnd-tip-anchor" : "",
                      isDragSource ? "is-drag-source" : "",
                      dropBefore ? "is-drop-target-before" : "",
                      dropAfter ? "is-drop-target-after" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <li
                        key={item.type}
                        className={rowClassName}
                        onDragOver={(event) => onRowDragOver(event, category, itemIndex)}
                        onDrop={(event) => onRowDrop(event, category, items)}
                      >
                        {tipAnchor ? (
                          <div className="studio-dnd-tip" role="status">
                            <span className="studio-dnd-tip__hand" aria-hidden>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                <path
                                  d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11"
                                  stroke="#0A0A0A"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                />
                                <path
                                  d="M11 11V5.5a1.5 1.5 0 0 1 3 0V11"
                                  stroke="#0A0A0A"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                />
                                <path
                                  d="M14 11V7.5a1.5 1.5 0 0 1 3 0V14c0 3.5-2 6-5.5 6S6 17 6 14v-3.5a1.5 1.5 0 0 1 3 0V13"
                                  stroke="#0A0A0A"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>
                            <div className="studio-dnd-tip__bubble">
                              <span>Drag &amp; drop</span>
                              <button
                                type="button"
                                className="studio-dnd-tip__close"
                                aria-label="Dismiss tip"
                                onClick={dismissTip}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          draggable
                          className={
                            featured
                              ? "studio-sidebar__item studio-sidebar__item--featured"
                              : "studio-sidebar__item"
                          }
                          onDragStart={(event) =>
                            onRowDragStart(event, item.type, category, itemIndex)
                          }
                          onDragEnd={onRowDragEnd}
                          onClick={() => onRowClick(item.type)}
                        >
                          <GripIcon />
                          {!featured ? (
                            <span className="studio-sidebar__icon-chip" aria-hidden>
                              <Image
                                src="/figma/icon-catalog-node.svg"
                                alt=""
                                width={16}
                                height={16}
                                unoptimized
                                className="studio-sidebar__icon"
                              />
                            </span>
                          ) : null}
                          <span className="studio-sidebar__item-label">
                            {item.title}
                          </span>
                          {featured ? (
                            <span className="studio-sidebar__item-badge" aria-hidden>
                              <Image
                                src="/figma/icon-invoice-badge.svg"
                                alt=""
                                width={23}
                                height={24}
                                unoptimized
                              />
                            </span>
                          ) : (
                            <Image
                              src="/figma/icon-chevron-right.svg"
                              alt=""
                              width={16}
                              height={16}
                              unoptimized
                              className="studio-sidebar__chevron"
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
