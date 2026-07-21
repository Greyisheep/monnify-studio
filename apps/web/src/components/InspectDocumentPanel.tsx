/**
 * Right inspect document pane — Figma Chat and Code panel (118:3740).
 * Header: format label + Copy; body: scrollable mono text.
 */
"use client";

import { useState } from "react";

export interface InspectDocumentPanelProps {
  /** Shown as the left header label (e.g. Markdown, JSON). */
  formatLabel: string;
  content: string;
  emptyHint?: string;
}

export function InspectDocumentPanel({
  formatLabel,
  content,
  emptyHint = "Nothing to show yet.",
}: InspectDocumentPanelProps) {
  const [copied, setCopied] = useState(false);
  const text = content.trim();

  async function onCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="studio-doc">
      <div className="studio-doc__head">
        <span className="studio-doc__format">{formatLabel}</span>
        <button
          type="button"
          className="studio-doc__copy"
          onClick={() => void onCopy()}
          disabled={!text}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
          >
            <rect
              x="3.5"
              y="3.5"
              width="7"
              height="7"
              rx="1.2"
              stroke="currentColor"
              strokeWidth="1.1"
            />
            <path
              d="M8.5 3.5V2.7A1.2 1.2 0 0 0 7.3 1.5H2.7A1.2 1.2 0 0 0 1.5 2.7v4.6A1.2 1.2 0 0 0 2.7 8.5H3.5"
              stroke="currentColor"
              strokeWidth="1.1"
            />
          </svg>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="studio-doc__body">
        {text ? (
          <pre className="studio-doc__pre">{text}</pre>
        ) : (
          <p className="studio-doc__empty">{emptyHint}</p>
        )}
      </div>
    </div>
  );
}
