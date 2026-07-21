/**
 * Business owner home after onboarding products.
 * Figma (editable copy i7ZczWj6i8W2oYmSSKcRdK): Dashboard - Empty #71:6944,
 * Dashboard - filled #71:7424 — Overview → product tabs → Activity → table.
 * Icons from Figma node exports under /figma/dashboard/.
 */
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ShopProduct } from "@/types";

import { AjoPanel } from "./AjoPanel";

type ProductTab = "sell" | "invoice" | "ajo";

const PRODUCT_TABS: { id: ProductTab; label: string }[] = [
  { id: "sell", label: "Sell Online" },
  { id: "invoice", label: "Invoice" },
  { id: "ajo", label: "Saving Group (Ajo)" },
];

function BizIcon({
  name,
  size = 16,
  className,
}: {
  name:
    | "collapse"
    | "new"
    | "dashboard"
    | "workflow"
    | "logout"
    | "bell"
    | "filter"
    | "chevron"
    | "search"
    | "clock"
    | "empty";
  size?: number;
  className?: string;
}) {
  return (
    <Image
      className={className}
      src={`/figma/dashboard/icon-${name}.svg`}
      alt=""
      width={size}
      height={size}
      unoptimized
      aria-hidden
    />
  );
}

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
  /** Initial product tab from onboarding goal (sell / invoice / ajo). */
  initialProductTab?: ProductTab;
  transactions?: DashboardTxn[];
  notifications?: BizNotification[];
  /** Verified-only money book from the backend (#135); overrides the computed
   *  tiles so inflow reflects only what Monnify confirmed, never a claim. */
  totals?: { inflow: number; outflow: number; net: number; actions: number } | null;
  /** Absolute URL of the business's share page (shop or contribution, #135/#160). */
  shopUrl?: string | null;
  /** Goal-aware label: "Your shop link" or "Your contribution link" (#160). */
  shareLabel?: string;
  /** The business's artifact id, so the Ajo tab can drive the cycle (#173). */
  artifactId?: string | null;
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

/** Figma Overview: integer #171717, fractional digits #d4d4d4 */
function MoneyAmount({
  value,
  className = "biz-money",
}: {
  value: number;
  className?: string;
}) {
  const formatted = money(value);
  const dot = formatted.lastIndexOf(".");
  if (dot < 0) {
    return <strong className={className}>{formatted}</strong>;
  }
  return (
    <strong className={className}>
      {formatted.slice(0, dot + 1)}
      <span className="biz-money__frac">{formatted.slice(dot + 1)}</span>
    </strong>
  );
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
        <BizIcon name={icon === "calendar" ? "chevron" : "filter"} size={14} />
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
          <BizIcon name="bell" size={20} className="biz-notify__empty-icon" />
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
  initialProductTab = "sell",
  transactions,
  notifications: notificationsProp,
  totals,
  shopUrl,
  shareLabel = "Your shop link",
  artifactId,
  onNav,
  onNew,
  onLogout,
}: BusinessDashboardProps) {
  const [copied, setCopied] = useState(false);
  // Preview-before-share nudge (#160): pulse + tooltip on first sight of a
  // share link, auto-quieting after a few seconds so it never nags.
  const [previewNudge, setPreviewNudge] = useState(true);
  useEffect(() => {
    if (!shopUrl || !previewNudge) return;
    const t = window.setTimeout(() => setPreviewNudge(false), 6000);
    return () => window.clearTimeout(t);
  }, [shopUrl, previewNudge]);
  const isContribution = shareLabel.toLowerCase().includes("contribution");
  const shareInvite = isContribution
    ? "Pay your contribution securely"
    : "Order from my shop and pay securely";
  const [collapsed, setCollapsed] = useState(false);
  const [productTab, setProductTab] = useState<ProductTab>(initialProductTab);
  const [direction, setDirection] = useState<"inflow" | "outflow">("inflow");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TxnStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | TxnType>("all");
  const [dateFilter, setDateFilter] = useState<DateRange>("today");
  const [openMenu, setOpenMenu] = useState<"status" | "type" | "date" | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notes, setNotes] = useState<BizNotification[]>(notificationsProp ?? []);
  const activityPreview = notes.slice(0, 4);

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
    // Backend totals win when present: money in is verified-only (#135), never
    // the sum of unconfirmed claims. Fall back to computing from the rows.
    if (totals) return totals;
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
  }, [transactions, totals]);

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
            <BizIcon name="collapse" />
          </button>
        </div>
        <nav className="biz-sidebar__nav" aria-label="Business menu" data-tour="biz-nav">
          <button type="button" className="biz-sidebar__new" onClick={onNew}>
            <BizIcon name="new" />
            {!collapsed && <span>New</span>}
          </button>
          <button
            type="button"
            className={`biz-sidebar__link${activeNav === "dashboard" ? " is-active" : ""}`}
            onClick={() => onNav("dashboard")}
          >
            <BizIcon name="dashboard" />
            {!collapsed && <span>Dashboard</span>}
          </button>
          <button
            type="button"
            className={`biz-sidebar__link${activeNav === "workflow" ? " is-active" : ""}`}
            onClick={() => onNav("workflow")}
          >
            <BizIcon name="workflow" />
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
              <BizIcon name="logout" />
            </button>
          )}
        </div>
      </aside>

      <main className="biz-main" data-tour="biz-main">
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
                <BizIcon name="bell" size={12} />
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

        <section className="biz-overview" aria-label="Overview" data-tour="biz-overview">
          <h2>Overview</h2>
          <div className="biz-overview__grid">
            <article>
              <span>Total inflow</span>
              <MoneyAmount value={overview.inflow} />
            </article>
            <article>
              <span>Total outflow</span>
              <MoneyAmount value={overview.outflow} />
            </article>
            <article>
              <span>Net Profit</span>
              <MoneyAmount value={overview.net} />
            </article>
            <article>
              <span>Actions Needed</span>
              <strong className="biz-money">{overview.actions}</strong>
            </article>
          </div>
        </section>

        <div className="biz-tools" data-tour="biz-tools">
        <div
          className="biz-product-tabs"
          role="tablist"
          aria-label="Products"
          data-tour="biz-products"
        >
          {PRODUCT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={productTab === tab.id}
              className={productTab === tab.id ? "is-active" : ""}
              onClick={() => setProductTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section
          className="biz-product-panel"
          aria-label={PRODUCT_TABS.find((t) => t.id === productTab)?.label}
          data-tour="biz-shop-link"
        >
          {productTab === "sell" && (
            <>
              <header className="biz-product-panel__head">
                <h2>Sell Online</h2>
                <p>Share your shop link so customers can pay you directly</p>
              </header>
              <div className="biz-shoplink">
                <div className="biz-shoplink__text">
                  <code>
                    {shopUrl
                      ? shopUrl.replace(/^https?:\/\//, "")
                      : "pay.monnify.studio/your-shop"}
                  </code>
                </div>
                <div className="biz-shoplink__actions">
                  {/* Preview-before-you-share nudge (#160): pulses + shows a
                      tooltip on first render so an owner checks the page before
                      handing the link to a customer, then quiets once clicked. */}
                  {shopUrl ? (
                    <a
                      className={`biz-shoplink__preview${previewNudge ? " is-nudge" : ""}`}
                      href={shopUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setPreviewNudge(false)}
                      onMouseEnter={() => setPreviewNudge(false)}
                    >
                      Preview
                      {previewNudge ? (
                        <span className="biz-shoplink__tip" role="tooltip">
                          See what your customers see, then share
                        </span>
                      ) : null}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="biz-shoplink__copy"
                    disabled={!shopUrl}
                    onClick={() => {
                      if (!shopUrl) return;
                      setPreviewNudge(false);
                      void navigator.clipboard.writeText(shopUrl).then(() => {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1400);
                      });
                    }}
                  >
                    {copied ? "Copied" : "Copy Link"}
                  </button>
                  {shopUrl ? (
                    <a
                      className="biz-shoplink__share"
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `${shareInvite}: ${shopUrl}`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setPreviewNudge(false)}
                    >
                      Share on Whatsapp
                    </a>
                  ) : (
                    <button type="button" className="biz-shoplink__share" disabled>
                      Share on Whatsapp
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
          {productTab === "invoice" && (
            <>
              <header className="biz-product-panel__head">
                <div>
                  <h2>Invoice</h2>
                  <p>Create invoices to share with customers</p>
                </div>
                <button type="button" className="biz-product-panel__cta" onClick={onNew}>
                  Create Invoice
                </button>
              </header>
              <p className="biz-product-panel__hint">
                Invoices you send show up in Recent transaction once a customer pays.
              </p>
            </>
          )}
          {productTab === "ajo" && (
            <>
              <header className="biz-product-panel__head">
                <div>
                  <h2>Saving Group (Ajo)</h2>
                  <p>Member contribution ledger</p>
                </div>
                <button type="button" className="biz-product-panel__cta" onClick={onNew}>
                  Add New Member
                </button>
              </header>
              {shopUrl ? (
                // Ajo carries its own share context (#160): members get a
                // contribution link, not a shop link. shareInvite is already
                // goal-aware ("Pay your contribution securely").
                <div className="biz-shoplink">
                  <div className="biz-shoplink__text">
                    <span>{shareLabel}</span>
                    <code>{shopUrl.replace(/^https?:\/\//, "")}</code>
                  </div>
                  <div className="biz-shoplink__actions">
                    <a
                      className={`biz-shoplink__preview${previewNudge ? " is-nudge" : ""}`}
                      href={shopUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setPreviewNudge(false)}
                      onMouseEnter={() => setPreviewNudge(false)}
                    >
                      Preview
                      {previewNudge ? (
                        <span className="biz-shoplink__tip" role="tooltip">
                          See what members see, then share
                        </span>
                      ) : null}
                    </a>
                    <button
                      type="button"
                      className="biz-shoplink__copy"
                      onClick={() => {
                        setPreviewNudge(false);
                        void navigator.clipboard.writeText(shopUrl).then(() => {
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 1400);
                        });
                      }}
                    >
                      {copied ? "Copied" : "Copy Link"}
                    </button>
                    <a
                      className="biz-shoplink__share"
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `${shareInvite}: ${shopUrl}`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setPreviewNudge(false)}
                    >
                      Share on Whatsapp
                    </a>
                  </div>
                </div>
              ) : (
                <p className="biz-product-panel__hint">
                  Start an Ajo from New to add members and track contributions here.
                </p>
              )}
              {artifactId ? <AjoPanel artifactId={artifactId} /> : null}
            </>
          )}
        </section>
        </div>

        <section className="biz-activity" aria-label="Activity" data-tour="biz-activity">
          <div className="biz-activity__card">
            <header className="biz-activity__head">
              <div>
                <h2>Activity</h2>
                <p>Recent payments and payouts</p>
              </div>
              <button
                type="button"
                className="biz-activity__all"
                onClick={() => {
                  setNotifyOpen(true);
                  setOpenMenu(null);
                }}
              >
                View all activites
              </button>
            </header>
            {activityPreview.length === 0 ? (
              <p className="biz-activity__empty">No activity yet — payments appear here when money moves.</p>
            ) : (
              <ul className="biz-activity__list">
                {activityPreview.map((item) => (
                  <li key={item.id}>
                    <span
                      className={`biz-activity__mark is-${item.kind}`}
                      aria-hidden
                    >
                      {item.kind === "outflow" ? "↗" : "↙"}
                    </span>
                    <div>
                      <p>{item.text}</p>
                      <time>{item.when}</time>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="biz-table-card" aria-label="Recent transaction" data-tour="biz-transactions">
          <div className="biz-table-card__title">Recent transaction</div>
          <div className="biz-table-card__header">
            <div className="biz-table-card__controls">
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
                    <BizIcon name="filter" size={12} /> Status
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
                    <BizIcon name="filter" size={12} /> Type
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
                    {dateLabel}
                    <BizIcon name="chevron" size={12} />
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

            <label className="biz-search">
              <BizIcon name="search" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or reference..."
              />
            </label>
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
                <div className="biz-empty__art" aria-hidden>
                  <BizIcon name="empty" size={24} />
                </div>
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

        <footer className="biz-footer">
          <BizIcon name="clock" size={14} />
          Last updated {updated}
        </footer>
      </main>
    </div>
  );
}
