/**
 * Left API catalog sidebar matched to Figma Main (21:1670).
 * Panel icon collapses into Maincollapsed floating chrome (21:1732).
 * Icons: exact Figma exports.
 */
"use client";

import Image from "next/image";
import type { PointerEvent as ReactPointerEvent, Ref } from "react";

import type { ExplainRequest, ExplainResult, IntentResult, MoniAskResult, NodeMeta } from "@/types";
import { ChatPanel, type ChatPanelHandle } from "./ChatPanel";

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
  onSetupIntent: (
    templateId: string,
    config: IntentResult["config"],
  ) => Promise<void>;
  onExplain: (body: ExplainRequest) => Promise<ExplainResult>;
  chatRef?: Ref<ChatPanelHandle>;
  onResizeStart?: (event: ReactPointerEvent) => void;
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
  onSetupIntent,
  onExplain,
  chatRef,
  onResizeStart,
}: NodePaletteProps) {
  const groups = groupCatalog(catalog);

  if (collapsed) {
    return null;
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

      <div className="studio-tabs" role="tablist" aria-label="Left panel">
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
      >
        {leftTab === "chat" ? (
          <ChatPanel
            ref={chatRef}
            busy={busy}
            onAsk={onAsk}
            onExplain={onExplain}
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
                  {items.map((item) => {
                    const featured = isFeatured(item);
                    return (
                      <li key={item.type}>
                        <button
                          type="button"
                          className={
                            featured
                              ? "studio-sidebar__item studio-sidebar__item--featured"
                              : "studio-sidebar__item"
                          }
                          onClick={() => onAdd(item.type)}
                        >
                          {!featured ? (
                            <Image
                              src="/figma/icon-catalog-node.svg"
                              alt=""
                              width={16}
                              height={16}
                              unoptimized
                              className="studio-sidebar__icon"
                            />
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
