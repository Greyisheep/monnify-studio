/**
 * Business owner home after onboarding products (Figma Dashboard #71:6944 / #71:7424).
 * Status / Type / Date filters + Notification panel + sidebar menu from Figma.
 */
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ShopProduct } from "@/types";

export type BusinessNav = "dashboard" | "workflow";

export type TxnStatus = "Successful" | "Pending" | "Failed";
export type TxnType = "Invoice" | "Payroll" | "Disbursement" | "Refund";
export type DateRange = "today" | "7d" | "month" | "all";

export interface DashboardTxn {
  id: string;
  date: string;
  /** ISO date for range filtering */
  at: string;
  customer: string;
  initials: string;
  type: TxnType;
  amount_ngn: number;
  method: string;
  status: TxnStatus;
  direction: "inflow" | "outflow";
}

export interface BizNotification {
  id: string;
  kind: "inflow" | "outflow" | "info";
  text: string;
  when: string;
  read: boolean;
}

export interface BusinessDashboardProps {
  products: ShopProduct[];
  ownerName?: string;
  ownerEmail?: string;
  activeNav?: BusinessNav;
  transactions?: DashboardTxn[];
  notifications?: BizNotification[];
  onNav: (nav: BusinessNav) => void;
  onNew?: () => void;
  onLogout?: () => void;
}

const STATUS_OPTIONS: Array<"all" | TxnStatus> = [
  "all",
  "Pending",
  "Successful",
  "Failed",
];
const TYPE_OPTIONS: Array<"all" | TxnType> = [
  "all",
  "Invoice",
  "Payroll",
  "Disbursement",
  "Refund",
];
const DATE_OPTIONS: { id: DateRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

function money(n: number) {
  return `₦${n.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function statusClass(status: TxnStatus) {
  if (status === "Successful") return "is-ok";
  if (status === "Pending") return "is-pending";
  return "is-fail";
}

function inDateRange(iso: string, range: DateRange) {
  if (range === "all") return true;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return true;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (range === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return at >= start.getTime();
  }
  if (range === "7d") return at >= now - 7 * day;
  if (range === "month") {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return at >= start.getTime();
  }
  return true;
}

function IconGrid({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconWorkflow({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="3.5" cy="3.5" r="1.75" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12.5" cy="8" r="1.75" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="3.5" cy="12.5" r="1.75" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.2 4.2 10.8 7.2M5.2 11.8 10.8 8.8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconBell({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M9 2.2a4.4 4.4 0 0 0-4.4 4.4v2.1l-1.4 2.1h11.6L13.4 8.7V6.6A4.4 4.4 0 0 0 9 2.2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M7.2 13.4a1.8 1.8 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconFilter({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 3.5h10M3.5 7h7M5 10.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1.75" y="2.5" width="10.5" height="9.75" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.75 5.5h10.5M4.5 1.5v2M9.5 1.5v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconLogout({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v7A1.5 1.5 0 0 0 3.5 13H6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 5.5 13 8l-3 2.5M13 8H6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FilterMenu({
  open,
  title,
  icon,
  options,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  title: string;
  icon: "filter" | "calendar";
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="biz-menu" role="menu" aria-label={title} ref={ref}>
      <div className="biz-menu__head">
        {icon === "calendar" ? <IconCalendar /> : <IconFilter />}
        <strong>{title}</strong>
      </div>
      <ul className="biz-menu__list">
        {options.map((opt) => {
          const checked = value === opt.id;
          return (
            <li key={opt.id}>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                className={checked ? "is-checked" : ""}
                onClick={() => {
                  onChange(opt.id);
                  onClose();
                }}
              >
                <span className={`biz-check${checked ? " is-on" : ""}`} aria-hidden>
                  {checked ? "✓" : ""}
                </span>
                {opt.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NotificationPanel({
  open,
  items,
  onClose,
  onMarkRead,
  onSeeAll,
}: {
  open: boolean;
  items: BizNotification[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onSeeAll: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="biz-notify" role="dialog" aria-label="Notification" ref={ref}>
      <header className="biz-notify__head">
        <h2>Notification</h2>
      </header>
      {items.length === 0 ? (
        <div className="biz-notify__empty">
          <IconBell className="biz-notify__empty-icon" />
          <p>No notifications yet</p>
        </div>
      ) : (
        <>
          <ul className="biz-notify__list">
            {items.map((item) => (
              <li key={item.id} className={item.read ? "is-read" : ""}>
                <span className={`biz-notify__mark is-${item.kind}`} aria-hidden>
                  {item.kind === "inflow" ? "↙" : item.kind === "outflow" ? "↗" : "🔔"}
                </span>
                <div className="biz-notify__body">
                  <p>{item.text}</p>
                  <time>{item.when}</time>
                </div>
                {item.read ? (
                  <span className="biz-notify__read">Read</span>
                ) : (
                  <button
                    type="button"
                    className="biz-notify__action"
                    onClick={() => onMarkRead(item.id)}
                  >
                    Mark as read
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="biz-notify__all" onClick={onSeeAll}>
            See all activity
          </button>
        </>
      )}
    </div>
  );
}

export function BusinessDashboard({
  products,
  ownerName = "Business owner",
  ownerEmail = "you@business.ng",
  activeNav = "dashboard",
  transactions,
  notifications: notificationsProp,
  onNav,
  onNew,
  onLogout,
}: BusinessDashboardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [direction, setDirection] = useState<"inflow" | "outflow">("inflow");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TxnStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | TxnType>("all");
  const [dateFilter, setDateFilter] = useState<DateRange>("today");
  const [openMenu, setOpenMenu] = useState<"status" | "type" | "date" | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notes, setNotes] = useState<BizNotification[]>(notificationsProp ?? []);

  useEffect(() => {
    setNotes(notificationsProp ?? []);
  }, [notificationsProp]);

  const rows = useMemo(() => {
    const list = transactions ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((row) => {
      if (row.direction !== direction) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (typeFilter !== "all" && row.type !== typeFilter) return false;
      if (!inDateRange(row.at, dateFilter)) return false;
      if (!q) return true;
      return (
        row.customer.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        row.type.toLowerCase().includes(q)
      );
    });
  }, [transactions, query, direction, statusFilter, typeFilter, dateFilter]);

  const overview = useMemo(() => {
    const list = transactions ?? [];
    const inflow = list
      .filter((t) => t.direction === "inflow")
      .reduce((sum, t) => sum + t.amount_ngn, 0);
    const outflow = list
      .filter((t) => t.direction === "outflow")
      .reduce((sum, t) => sum + t.amount_ngn, 0);
    const actions = list.filter((t) => t.status !== "Successful").length;
    return {
      inflow,
      outflow,
      net: inflow - outflow,
      actions,
    };
  }, [transactions]);

  const unread = notes.filter((n) => !n.read).length;
  const empty = rows.length === 0;
  const dateLabel =
    DATE_OPTIONS.find((d) => d.id === dateFilter)?.label ?? "Today";
  const updated = new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  function exportCsv() {
    const header = "Date,Customer,Type,Amount,Method,Status,Transaction ID";
    const lines = rows.map(
      (r) =>
        `${r.date},${JSON.stringify(r.customer)},${r.type},${r.amount_ngn},${r.method},${r.status},${r.id}`,
    );
    const blob = new Blob([[header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monnify-${direction}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={`biz-shell${collapsed ? " is-collapsed" : ""}`}>
      <aside className="biz-sidebar">
        <div className="biz-sidebar__top">
          <div className="biz-sidebar__brand">
            <Image
              src="/figma/monnify-logo.svg"
              alt=""
              width={28}
              height={28}
              unoptimized
            />
            {!collapsed && <strong>Monnify Studio</strong>}
          </div>
          <button
            type="button"
            className="biz-sidebar__collapse"
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav className="biz-sidebar__nav" aria-label="Business menu">
          <button type="button" className="biz-sidebar__new" onClick={onNew}>
            +{collapsed ? "" : " New"}
          </button>
          <button
            type="button"
            className={`biz-sidebar__link${activeNav === "dashboard" ? " is-active" : ""}`}
            onClick={() => onNav("dashboard")}
          >
            <IconGrid />
            {!collapsed && <span>Dashboard</span>}
          </button>
          <button
            type="button"
            className={`biz-sidebar__link${activeNav === "workflow" ? " is-active" : ""}`}
            onClick={() => onNav("workflow")}
          >
            <IconWorkflow />
            {!collapsed && <span>Workflow</span>}
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
          {!collapsed && (
            <div className="biz-sidebar__who">
              <strong>{ownerName}</strong>
              <span>{ownerEmail}</span>
            </div>
          )}
          {onLogout && (
            <button
              type="button"
              className="biz-sidebar__logout"
              aria-label="Log out"
              onClick={onLogout}
            >
              <IconLogout />
            </button>
          )}
        </div>
      </aside>

      <main className="biz-main">
        <header className="biz-main__head">
          <h1>Dashboard</h1>
          <div className="biz-main__actions">
            <div className="biz-notify-wrap">
              <button
                type="button"
                className={`biz-icon-btn${unread > 0 ? " has-dot" : ""}`}
                aria-label="Notifications"
                aria-expanded={notifyOpen}
                onClick={() => {
                  setNotifyOpen((v) => !v);
                  setOpenMenu(null);
                }}
              >
                <IconBell />
              </button>
              <NotificationPanel
                open={notifyOpen}
                items={notes}
                onClose={() => setNotifyOpen(false)}
                onMarkRead={(id) =>
                  setNotes((current) =>
                    current.map((n) => (n.id === id ? { ...n, read: true } : n)),
                  )
                }
                onSeeAll={() => setNotifyOpen(false)}
              />
            </div>
            <button type="button" className="biz-export" onClick={exportCsv}>
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
              <div className="biz-filter">
                <button
                  type="button"
                  className={openMenu === "status" ? "is-open" : ""}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "status"}
                  onClick={() => {
                    setOpenMenu((m) => (m === "status" ? null : "status"));
                    setNotifyOpen(false);
                  }}
                >
                  <IconFilter /> Status
                </button>
                <FilterMenu
                  open={openMenu === "status"}
                  title="Status"
                  icon="filter"
                  value={statusFilter === "all" ? "all" : statusFilter}
                  options={STATUS_OPTIONS.map((id) => ({
                    id,
                    label: id === "all" ? "All Status" : id,
                  }))}
                  onChange={(id) => setStatusFilter(id as "all" | TxnStatus)}
                  onClose={() => setOpenMenu(null)}
                />
              </div>
              <div className="biz-filter">
                <button
                  type="button"
                  className={openMenu === "type" ? "is-open" : ""}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "type"}
                  onClick={() => {
                    setOpenMenu((m) => (m === "type" ? null : "type"));
                    setNotifyOpen(false);
                  }}
                >
                  <IconFilter /> Type
                </button>
                <FilterMenu
                  open={openMenu === "type"}
                  title="Type"
                  icon="filter"
                  value={typeFilter === "all" ? "all" : typeFilter}
                  options={TYPE_OPTIONS.map((id) => ({
                    id,
                    label: id === "all" ? "All types" : id,
                  }))}
                  onChange={(id) => setTypeFilter(id as "all" | TxnType)}
                  onClose={() => setOpenMenu(null)}
                />
              </div>
              <div className="biz-filter">
                <button
                  type="button"
                  className={openMenu === "date" ? "is-open" : ""}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "date"}
                  onClick={() => {
                    setOpenMenu((m) => (m === "date" ? null : "date"));
                    setNotifyOpen(false);
                  }}
                >
                  <IconCalendar /> {dateLabel}
                </button>
                <FilterMenu
                  open={openMenu === "date"}
                  title="Date"
                  icon="calendar"
                  value={dateFilter}
                  options={DATE_OPTIONS.map((d) => ({
                    id: d.id,
                    label: d.label,
                  }))}
                  onChange={(id) => setDateFilter(id as DateRange)}
                  onClose={() => setOpenMenu(null)}
                />
              </div>
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
                    ? ` You already listed ${products.length} item${
                        products.length === 1 ? "" : "s"
                      } to sell.`
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
