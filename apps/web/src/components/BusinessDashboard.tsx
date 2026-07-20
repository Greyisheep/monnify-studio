/**
 * Business owner home after onboarding products (Figma Dashboard #71:6944 / #71:7424).
 */
"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import type { ShopProduct } from "@/types";

export type BusinessNav = "dashboard" | "workflow";

export interface DashboardTxn {
  id: string;
  date: string;
  customer: string;
  initials: string;
  type: string;
  amount_ngn: number;
  method: string;
  status: "Successful" | "Pending" | "Failed";
}

export interface BusinessDashboardProps {
  products: ShopProduct[];
  ownerName?: string;
  ownerEmail?: string;
  activeNav?: BusinessNav;
  transactions?: DashboardTxn[];
  onNav: (nav: BusinessNav) => void;
  onNew?: () => void;
}

function money(n: number) {
  return `₦${n.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function statusClass(status: DashboardTxn["status"]) {
  if (status === "Successful") return "is-ok";
  if (status === "Pending") return "is-pending";
  return "is-fail";
}

export function BusinessDashboard({
  products,
  ownerName = "Business owner",
  ownerEmail = "you@business.ng",
  activeNav = "dashboard",
  transactions,
  onNav,
  onNew,
}: BusinessDashboardProps) {
  const [direction, setDirection] = useState<"inflow" | "outflow">("inflow");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const list = transactions ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((row) => {
      if (!q) return true;
      return (
        row.customer.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        row.type.toLowerCase().includes(q)
      );
    });
  }, [transactions, query]);

  const overview = useMemo(() => {
    const list = transactions ?? [];
    const inflow = list
      .filter((t) => t.type === "Invoice" || t.type === "Refund")
      .reduce((sum, t) => sum + (t.type === "Refund" ? -t.amount_ngn : t.amount_ngn), 0);
    const outflow = list
      .filter((t) => t.type === "Payroll" || t.type === "Disbursement")
      .reduce((sum, t) => sum + t.amount_ngn, 0);
    const actions = list.filter((t) => t.status !== "Successful").length;
    return {
      inflow: Math.max(0, inflow),
      outflow,
      net: Math.max(0, inflow) - outflow,
      actions,
    };
  }, [transactions]);

  const empty = rows.length === 0;
  const updated = new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <div className="biz-shell">
      <aside className="biz-sidebar">
        <div className="biz-sidebar__brand">
          <Image
            src="/figma/monnify-logo.svg"
            alt=""
            width={28}
            height={28}
            unoptimized
          />
          <strong>Monnify Studio</strong>
        </div>
        <nav className="biz-sidebar__nav" aria-label="Business">
          <button type="button" className="biz-sidebar__new" onClick={onNew}>
            + New
          </button>
          <button
            type="button"
            className={`biz-sidebar__link${activeNav === "dashboard" ? " is-active" : ""}`}
            onClick={() => onNav("dashboard")}
          >
            <span aria-hidden>▦</span> Dashboard
          </button>
          <button
            type="button"
            className={`biz-sidebar__link${activeNav === "workflow" ? " is-active" : ""}`}
            onClick={() => onNav("workflow")}
          >
            <span aria-hidden>↗</span> Workflow
          </button>
        </nav>
        <div className="biz-sidebar__user">
          <div className="biz-sidebar__avatar" aria-hidden>
            {ownerName
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <strong>{ownerName}</strong>
            <span>{ownerEmail}</span>
          </div>
        </div>
      </aside>

      <main className="biz-main">
        <header className="biz-main__head">
          <h1>Dashboard</h1>
          <div className="biz-main__actions">
            <button type="button" className="biz-icon-btn" aria-label="Notifications">
              ⌂
            </button>
            <button type="button" className="biz-export">
              Export
            </button>
          </div>
        </header>

        <section className="biz-overview" aria-label="Overview">
          <h2>Overview</h2>
          <div className="biz-overview__grid">
            <article>
              <span>Total inflow</span>
              <strong>{money(overview.inflow)}</strong>
            </article>
            <article>
              <span>Total outflow</span>
              <strong>{money(overview.outflow)}</strong>
            </article>
            <article>
              <span>Net Profit</span>
              <strong>{money(overview.net)}</strong>
            </article>
            <article>
              <span>Actions Needed</span>
              <strong>{overview.actions}</strong>
            </article>
          </div>
        </section>

        <section className="biz-table-card" aria-label="Payments">
          <div className="biz-table-card__toolbar">
            <div className="biz-seg" role="tablist" aria-label="Direction">
              <button
                type="button"
                role="tab"
                aria-selected={direction === "inflow"}
                className={direction === "inflow" ? "is-active" : ""}
                onClick={() => setDirection("inflow")}
              >
                Inflow
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={direction === "outflow"}
                className={direction === "outflow" ? "is-active" : ""}
                onClick={() => setDirection("outflow")}
              >
                Outflow
              </button>
            </div>
            <label className="biz-search">
              <span aria-hidden>⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or reference..."
              />
            </label>
            <div className="biz-filters">
              <button type="button">Status</button>
              <button type="button">Type</button>
              <button type="button">Today</button>
            </div>
          </div>

          <div className="biz-table-wrap">
            <table className="biz-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer name</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Transaction ID</th>
                </tr>
              </thead>
              {!empty && (
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date}</td>
                      <td>
                        <span className="biz-customer">
                          <span className="biz-customer__mark" aria-hidden>
                            {row.initials}
                          </span>
                          {row.customer}
                        </span>
                      </td>
                      <td>{row.type}</td>
                      <td>{money(row.amount_ngn)}</td>
                      <td>{row.method}</td>
                      <td>
                        <span className={`biz-status ${statusClass(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="biz-mono">{row.id}</td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
            {empty && (
              <div className="biz-empty">
                <div className="biz-empty__art" aria-hidden />
                <h3>No payments yet</h3>
                <p>
                  Payments show up here once an invoice gets paid or a payroll run
                  goes out.
                  {products.length > 0
                    ? ` You already listed ${products.length} item${products.length === 1 ? "" : "s"} to sell.`
                    : ""}
                </p>
              </div>
            )}
          </div>
        </section>

        <footer className="biz-footer">Last updated {updated}</footer>
      </main>
    </div>
  );
}
