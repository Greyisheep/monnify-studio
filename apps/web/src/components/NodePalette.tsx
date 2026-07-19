/**
 * Left API catalog sidebar matched to Figma Main (15:742).
 * Provenance: #44, Figma Monnify-challenge.
 */
"use client";

import Image from "next/image";

import type { NodeMeta } from "@/types";

export interface NodePaletteProps {
  catalog: Record<string, NodeMeta>;
  workflowName: string;
  teamLabel: string;
  leftTab: "api" | "chat";
  onLeftTabChange: (tab: "api" | "chat") => void;
  onAdd: (typeKey: string) => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  monnify: "Accept Payments",
  event: "Events",
  safety: "Customer Verification",
  control: "Control",
  application: "Transfers / Payouts",
};

function groupByCategory(catalog: Record<string, NodeMeta>) {
  const groups = new Map<string, NodeMeta[]>();
  for (const meta of Object.values(catalog)) {
    const category = meta.category || "application";
    const list = groups.get(category) ?? [];
    list.push(meta);
    groups.set(category, list);
  }
  for (const list of groups.values()) {
    list.sort((left, right) => left.title.localeCompare(right.title));
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

export function NodePalette({
  catalog,
  workflowName,
  teamLabel,
  leftTab,
  onLeftTabChange,
  onAdd,
}: NodePaletteProps) {
  const groups = groupByCategory(catalog);

  return (
    <aside className="studio-sidebar studio-sidebar--left" aria-label="API catalog">
      <div className="studio-sidebar__brand">
        <div className="studio-sidebar__brand-main">
          <Image
            src="/figma/monnify-logo.svg"
            alt="Monnify"
            width={21}
            height={13}
            unoptimized
          />
          <div>
            <strong>{workflowName || "Workflow"}</strong>
            <span>{teamLabel}</span>
          </div>
        </div>
        <Image
          src="/figma/icon-panel-left.svg"
          alt=""
          width={16}
          height={16}
          unoptimized
          className="studio-sidebar__icon"
        />
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

      <div className="studio-sidebar__scroll">
        {leftTab === "chat" ? (
          <p className="studio-sidebar__empty">
            Ask AI lands with #15. Use the analyzer and Run for now.
          </p>
        ) : (
          <>
            {groups.length === 0 && (
              <p className="studio-sidebar__empty">Catalog loading…</p>
            )}
            {groups.map(([category, items]) => (
              <section key={category} className="studio-sidebar__group">
                <h3>{CATEGORY_LABEL[category] ?? category}</h3>
                <ul>
                  {items.map((item) => (
                    <li key={item.type}>
                      <button type="button" onClick={() => onAdd(item.type)}>
                        <Image
                          src="/figma/icon-webhook.svg"
                          alt=""
                          width={16}
                          height={16}
                          unoptimized
                          className="studio-sidebar__icon"
                        />
                        <span className="studio-sidebar__item-label">
                          {item.title}
                        </span>
                        <span className="studio-sidebar__chevron" aria-hidden>
                          ›
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
