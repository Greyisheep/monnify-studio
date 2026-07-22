/**
 * Right inspect document pane — Figma Chat and Code panel (118:3740).
 * Header: format label (or JSON|Python toggle) + Copy; body: scrollable mono text.
 * Provenance: #152, #146.
 */
"use client";

import { useState, type ReactNode } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

// Only the languages we render, so the bundle stays small (#211).
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("markdown", markdown);

export interface InspectFormatOption {
  id: string;
  label: string;
}

export interface InspectDocumentPanelProps {
  /** Shown as the left header label when no format toggle (e.g. Markdown). */
  formatLabel: string;
  content: string;
  emptyHint?: string;
  /** Optional Code-tab format switcher (#152). */
  formats?: InspectFormatOption[];
  activeFormat?: string;
  onFormatChange?: (id: string) => void;
  /** Shown in the header row (e.g. generated Python filename). */
  subtitle?: string | null;
  busy?: boolean;
}

export function InspectDocumentPanel({
  formatLabel,
  content,
  emptyHint = "Nothing to show yet.",
  formats,
  activeFormat,
  onFormatChange,
  subtitle,
  busy = false,
}: InspectDocumentPanelProps) {
  const [copied, setCopied] = useState(false);
  const text = content.trim();
  const langKey = (activeFormat ?? formatLabel).toLowerCase();
  const language =
    langKey === "python" ? "python" : langKey === "json" ? "json" : "markdown";

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

  let headLeft: ReactNode;
  if (formats && formats.length > 0 && onFormatChange) {
    headLeft = (
      <div
        className="studio-doc__formats"
        role="tablist"
        aria-label="Code format"
      >
        {formats.map((format) => (
          <button
            key={format.id}
            type="button"
            role="tab"
            aria-selected={activeFormat === format.id}
            className={
              activeFormat === format.id
                ? "studio-doc__format-tab is-active"
                : "studio-doc__format-tab"
            }
            disabled={busy}
            onClick={() => onFormatChange(format.id)}
          >
            {format.label}
          </button>
        ))}
      </div>
    );
  } else {
    headLeft = <span className="studio-doc__format">{formatLabel}</span>;
  }

  return (
    <div className="studio-doc">
      <div className="studio-doc__head">
        <div className="studio-doc__head-start">
          {headLeft}
          {subtitle ? (
            <span className="studio-doc__filename">{subtitle}</span>
          ) : null}
        </div>
        <button
          type="button"
          className="studio-doc__copy"
          onClick={() => void onCopy()}
          disabled={!text || busy}
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
        {busy && !text ? (
          <p className="studio-doc__empty">Generating…</p>
        ) : text ? (
          <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            showLineNumbers
            wrapLongLines
            className="studio-doc__code"
            customStyle={{
              margin: 0,
              padding: "16px 14px",
              borderRadius: "10px",
              fontSize: "12.5px",
              lineHeight: "1.55",
              background: "#1e1e1e",
            }}
            codeTagProps={{
              style: {
                fontFamily:
                  "var(--font-mono, 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace)",
              },
            }}
            lineNumberStyle={{
              color: "#5a6270",
              minWidth: "2.4em",
              userSelect: "none",
            }}
          >
            {text}
          </SyntaxHighlighter>
        ) : (
          <p className="studio-doc__empty">{emptyHint}</p>
        )}
      </div>
    </div>
  );
}
